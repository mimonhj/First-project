# Pirates Ahoy!

A cartoon-style 3D pirate adventure that runs in the browser, built with [three.js](https://threejs.org/).
Captain the **Sea Biscuit** across nine seas in three voyages. Sink a different pirate fleet in each, or
grapple their ships, board them and take them as prizes, and at the very end drive off the Kraken. Between
battles, walk the pirate town of Sparrow's Floating Island as the captain: refit the ship, train the crew, dress
them all up, answer Professor Barnacle's riddles and build the town up with houses, villagers and amenities.

The look is inspired by animated TV shows: cel-shaded colours, bold ink outlines, a painted
sky with puffy clouds, and cartoon water with foam around every shore.

## The voyage

The title screen shows the nine levels in three groups, each card with its difficulty word and skull pips
(1 to 9). Pick an open level, or press **Set sail!** to start at level 1.

### Voyage I · The Old World

| Level | Where | Pirates | Hazards |
|-------|-------|---------|---------|
| 1 · Easy | **Coast of Europe**: cliffs, a lighthouse, a harbour town and a castle | Corsair Cutters, then a Privateer Brig | Rocky islets |
| 2 · Medium | **Bali Islands**: jungle islands, temples and rice terraces | Prahu Raiders, then Dragon Junks | Coral reefs slow your ship (but not the shallow-draft prahus) |
| 3 · Hard | **The Volcano**: open sea under an erupting volcano | Ember Corsairs and a Man-o'-War, then **The Molten Maw** alone | Lava bombs land inside red target circles and hurt any ship caught there, pirates included |

### Voyage II · The Far Seas

| Level | Where | Pirates | What's new |
|-------|-------|---------|------------|
| 4 · Tricky | **Doubloon Bay**: golden hour over a walled harbour town, a ruined star fort, palm beaches and sandbars | A Treasure Galleon and two Corsair Cutters, then a Treasure Galleon and an Ember Corsair | The galleons run for two escape gates on the south edge (red and green buoys). Catch them before they get away with their gold: board one for 525 gold, plus a 150 treasure bonus at the end of the level. Sandbars slow deep hulls, so the galleons keep to the channels |
| 5 · Tough | **Frostbite Straits**: a pastel arctic strait at dawn, between snowy fjord cliffs, with icebergs, a stave church and the northern lights | Two Frost Raiders and a Man-o'-War, then two Frost Raiders and a Privateer Brig | Longship raiders board **you** (see Raiders below). Drifting ice floes slow every ship, and a ship ramming one at speed takes 6 damage (CRUNCH!) |
| 6 · Legendary | **The Maelstrom**: a stormy night round a giant whirlpool, ringed by sea stacks and Skull Rock | Two Ember Corsairs and a Man-o'-War, then **the Phantom Galleon** with a Frost Raider | The current drags every ship but the Phantom toward the whirlpool's eye, which grinds hulls at 5 hp a second. Lightning strikes inside white warning circles (14 damage). The Phantom can't be sunk: see below |

**How Voyage II opens.** Beating the Molten Maw still shows the Victory screen, and it opens Doubloon Bay.
**Sail on to the Far Seas** (or `Enter`) sails straight there with the voyage's gold. Until then card 4 reads
"Beat the Molten Maw" and cards 5 and 6 read "Locked". A locked card can still be reached with `Tab`; pressing it
says why instead of starting. Progress saved before this update stops at the Volcano, so if you had already
beaten it, play the Molten Maw once more to open Voyage II. After the Maelstrom the Victory screen reads
"The Phantom Galleon is yours! You are the Legend of the Seven Seas."

**The Phantom Galleon** (300 hull, 24 crew) sails under her ghost crew. While they stand, round and chain shot do
half damage and her hull never drops below 1: at 1 she turns spectral and her boss bar reads
"BOARD HER! — The Phantom Galleon". Grape shot still kills her ghosts. Take her by boarding her, or grape her crew
down to the surrender notch ("The ghost crew is banished!") and grapple her. She is worth 625 gold, and taking her
wins the Pirate King's crown at the tailor's. The current and the whirlpool's eye don't touch her.

### Voyage III · The Kraken Seas

| Level | Where | Pirates | What's new |
|-------|-------|---------|------------|
| 7 · Daring | **The Turtle Atolls**: South Seas noon over turquoise lagoons, an island shaped like a giant turtle, flamingos on the sandbars, a stilt village with conch-shell roofs, a toppled candy-striped lighthouse, and a purple storm wall to the east | Two Shark Raiders and an Ember Corsair, then a Bomb Ketch, a Shark Raider and a Privateer Brig | **Waterspouts** ride loops round the lagoon, two at once (three in the second wave). Each forms harmlessly for 3 s under a dark swirl ring, then spins for 22 s: within 14 paces it drags every ship toward it (2 paces a second), and its core (6 paces) spins you, does 4 hp a second and flings you out after 1.5 s ("WHOOSH!"). Sandbars slow deep hulls |
| 8 · Fearsome | **The Cape of Storms**: an orange-violet stormy sunset off a green cape: cliffs and crashing surf, a red-and-white lighthouse, a conch-horn tower, penguins, whales and albatrosses | An Iron Turtle, a Bomb Ketch and an Ember Corsair, then two Fire Ships and an Iron Turtle | **Rogue waves**: the first after 30 s, then one every 24 to 32 s. The conch horn sounds, a WAVE! arrow shows at the screen edge and a teal line on the minimap, 4 s before a giant curling crest rolls through you. Side-on it does 10 damage and shoves you ("SPLASH!"); turn your bow into it ("RODE IT!") or your stern to it ("SURF'S UP!", a short burst of speed) and it does nothing. Pirates take it the same way |
| 9 · Mythic | **The Kraken's Deep**: a moonlit night under a huge cratered moon, glowing cyan foam, wrecks on their sides, a whale-skeleton arch you can sail through, glowing jellyfish, and the Kraken Crew's lair, a sea cave carved like an octopus head | Two Squid Skiffs and an Iron Turtle, then **the Inkheart** with a Squid Skiff | **Sea geysers** burst inside rings of bubbles (1.8 to 2.2 s of warning, 10 damage) until the Inkheart falls. Then her crew flee and **the Kraken rises**: see below |

Each Voyage III level also has two **powder crates** floating somewhere (see Special shot).

**How Voyage III opens.** Beating the Maelstrom still shows the Victory screen, now with "…but far to the south,
something stirs in the deep.", and it opens the Turtle Atolls. **Sail on to the Kraken Seas** (or `Enter`) sails
straight there with the voyage's gold; from the dock the way out reads "Set sail for The Turtle Atolls". Until then
card 7 reads "Beat the Phantom Galleon" and cards 8 and 9 read "Locked". A save from before this update that had
already captured the Phantom Galleon opens level 7 as the game loads: nobody plays the Maelstrom again. (The capture
is saved the moment she is taken, so a captain who took her and was then sunk by her escort sails on too.)

**The Kraken Seas' pirates** (gold in Capture and gold below):

| Ship | What she does | How to beat her |
|------|---------------|-----------------|
| Shark Raider | Lines up on you for 1.5 s (red ▶▶ chevrons on her name tag, "RAM!"), then charges at 16 paces a second for 2 s. A hit does up to 10 to you and 8 to her ("CRUNCH!"). She can charge again 9 s later | turn away when she lines up; Frost shot halves the charge, Stink shot stops it |
| Bomb Ketch | Keeps 28 to 38 paces off and, every 6 to 8 s, lobs a mortar shell at where you will be: an orange ring with fizzing fuse sparks for 2.2 s, then 12 damage to any ship inside | steer out of the orange circle and close in (her one gun is weak); Stink shot pauses her mortar |
| Iron Turtle | Iron sides: a hit on her beam does half damage ("CLANG!") | rake her bow or stern; crits, burns and KA-BOOM! do full damage |
| Fire Ship | No guns: she sails straight at you. Within 30 paces she lights up, with a red danger ring round her; from 1.6 s later, near any hull, she explodes: 22 damage at her centre down to 11 at the ring's edge, to every ship, pirates too. Sunk while lit, she blows up where she is and leaves no coins | sink her far off, lure her into her own fleet, or hit her with Frost shot: her fuse goes out and she strikes her colours ("The fire ship gives up!"). Until then she can't be grappled ("Too hot to board! Freeze her first.") |
| Squid Skiff | Boards **you**, like a Frost Raider (see Raiders) | cut the ropes; Stink shot makes her drop them ("Ropes dropped!") |
| The Inkheart | The Kraken Crew's flagship (360 hull, 26 crew, a boss). Every 10 s she lobs 2 ink pots near you (violet rings, 1.8 s, 8 damage each); each leaves an ink slick for 6 s that slows any ship in it ("INKY!") | keep moving; sink her, or board her for 725 gold |

The first mortar shell and the first fire ship each get a banner that says what to do, and a fire ship or charging
shark off the screen shows a red FIRE SHIP! or RAM! arrow at its edge.

**The Kraken.** When the Inkheart is sunk or taken, the rest of her fleet flee (no gold, no penalty), the geysers stop
and the ink slicks fade. Struck ships still afloat are yours, as at a level's end. Then the sea goes quiet for 4 s
("Something stirs in the deep…"): your crew patches the hull as at reinforcements and 3 more hands come aboard. 40
paces ahead the sea bulges and one great amber eye opens: "THE KRAKEN RISES! Shoot its tentacles and its big eye!"
(any key or tap skips the rise). It is not a ship: it can't be boarded ("You can't board a sea monster!") or raked,
but your guns aim at its raised parts, and the FIRE! light works, as for any pirate. Its boss bar, **THE KRAKEN**,
holds 2,850 hp in three parts:

| | The Hunt (2,850 → 1,900) | The Fury (1,900 → 950) | The Last Stand (950 → 0) |
|-|--------------------------|------------------------|--------------------------|
| The Kraken | a shadow under the water that chases you at 8 paces a second (a stock ship at full sail does 12) | chases at 9.5 | stops chasing: its head comes up 25 paces off your beam and stays, its eyes glowing 4 s in every 8 |
| Tentacles | 2 every 8 s where you are heading, once it is within 14 paces of you | 3 every 7 s | 4 every 6 s, anywhere within 40 paces |
| Warning | 1.8 s | 1.6 s | 1.5 s |
| Its head | up for 7 s every second attack | the same | always up |
| Also | | it can grab you, and every 12 s spits an ink blob ahead of your bow (8 damage and a slick) | it grabs, and pulls you toward its head at 2 paces a second |

- **Tentacles.** Each one comes up after a violet dashed ring of foam with bubbles, a rising tone and "TENTACLE!".
  It slams for 12 damage inside the ring ("SLAM!"), then sways for 4 s as a target. Never more than 4 are up. If you
  outrun it for 12 s, it dives and comes up 30 paces ahead of your bow.
- **Hitting it.** Its head and tentacles take a ball's normal damage (range and crits count, but crits have no
  effect), its eyes take ×1.5 ("BULLSEYE!"). A tentacle also has 30 hp of its own: at 0 it recoils ("OUCH!") and sinks.
- **The grab** (The Fury and The Last Stand). A red-rimmed ring is a grab: if your hull is inside when it lands, a
  tentacle holds the ship (no sailing or steering) and squeezes 2 hp a second: "GRABBED! Hold G to cut it loose". It
  always lets go within 4 s. To get free sooner, hold `G` (or the Board button, which reads **CUT!**) for 0.8 s or
  press it 3 times, hit that tentacle, or hit the Kraken with Stink shot. You can still fire while it holds you, and
  after a release it doesn't grab again for 8 s.
- **Special shot on it** (as on a boss): Frost halves its chase and makes every warning 0.5 s longer for 2.5 s;
  Fire burns the part it hits for 3 hp a second for 3 s; Stink makes it sneeze ("ACHOO!"): every tentacle snaps under
  (a grab lets go) and no attack starts for 2 s, then it wears clothes-pegs for 20 s.
- **Driven off.** At 0 it isn't killed: it sinks away sulking ("THE KRAKEN IS DRIVEN OFF!"), the sky turns to dawn
  and the Kraken's Pearl bobs up in a giant shell. Sail over it (or wait: it drifts to you) for 1,000 gold, paid on
  every win of level 9. A baby kraken climbs aboard onto your captain's shoulder ("It seems to like you!"); from now
  on it is a pet at Polly's. Then the level clears and the final Victory reads "The Kraken is driven back to the deep,
  and the Seven Seas are safe! You are the Kraken Tamer!"; `Enter` goes back to the title.
- **Try again from the Kraken.** If you sink after it has risen, the shipwreck screen's first button (and `Enter`) is
  **Try again from the Kraken**: a full hull and crew, your special loads refilled, the plunder you had when it rose,
  and the Kraken rising again at once at full strength (a 3 s rise). **Try again** (the whole level) and **Main menu**
  are still there. This checkpoint is never saved: leaving or closing the page forgets it.

On a ship with a tier or two of most upgrades, the Kraken fight lasts two to three minutes (the bots' median was
139 s).

Each level comes in two waves. When reinforcements arrive, your crew patches part of the hull and up to 3 more
hands join you. Clearing a level unlocks the next one and banks the level's plunder in your treasure chest, to spend
in town (see below). The level-cleared card lists ships sunk and captured, the bonuses and the gold banked.
Within each voyage every level is harder than the one before it. Voyage II expects a few upgrades, and
Doubloon Bay is gentler than the Molten Maw before it. Voyage III is tuned for a ship with a tier or two of most
upgrades; special shot helps, but every level can be won without it. Every new danger of Voyage III is warned at
least 1.5 s ahead by a ring or shape, a sound and a word.

On your first voyage, hints show how to steer and when a pirate is in your firing arc.
After that, one-time tips in the same bubble introduce boarding, new ammo, raiders, rakes, counter-boarding,
ships that surrender, each special shot, rams, waterspouts, rogue waves and the Kraken's grab. The gun panel
lights up **FIRE!** when a side has a target, and hits pop up as **HIT!** / **SUNK!**. Any key skips the camera
fly-in at the start of a level.

Press `M` (or the speaker button) to mute.

## In battle

### Where and how you hit

- **Range.** Point blank (10 paces or less) does ×1.25 damage ("POINT BLANK!"). Full damage from 14 to 24
  paces, then it falls off to ×0.75 at 34 paces, the cannons' longest reach. This holds for the pirates' shots too.
- **Raking.** A ball that flies along a ship's keel line (within about 37° of it) rakes her: in at the stern for
  ×2 ("STERN RAKE ×2!"), in at the bow for ×1.5. When the ship a side would aim at shows that side her bow or stern,
  its gun light reads **RAKE!** (gold) instead of FIRE!. Pirates rake you too, but on the early levels only part of a
  rake's extra damage counts: 40 % of it on level 1 (a stern rake does ×1.4 instead of ×2), 60 % on level 2,
  80 % on level 3, and all of it from Doubloon Bay on.
- **Critical hits** (your shots only). Each ball has a 6 % chance, plus 12 % on a stern rake, 6 % on a bow rake
  and 5 % at point blank, up to 35 %. The tavern's Master gunner raises the 6 % to 9, 12 or 15 %. A crit does
  ×1.75 damage and has an effect:

  | Crit with | Where it hits | Pop | Effect |
  |-----------|---------------|-----|--------|
  | Round shot | the stern | RUDDER SMASHED! | she turns at a quarter of her rate for 6 s |
  | Round shot | amidships | MAST DOWN! | her top sail comes down: half speed for 8 s |
  | Round shot | the bow | POWDER KEG! | 12 more damage at once, then she burns for 2 hp a second for 4 s |
  | Chain shot | anywhere | MAST DOWN! | as above |
  | Grape shot | anywhere | CREW ROUTED! | 2 more of her crew are killed |

  A ship takes at most one new effect every 3 s, and bosses shake effects off in half the time.
  Speed and turning effects don't add up: the strongest one counts.
- **Visible damage.** Balls leave holes where they land. A battered ship smokes and lists, a wrecked one
  burns, sits lower and her sail droops.

### Ammo

| Ammo | Unlocked | Hull damage | Reach | Reload | What else |
|------|----------|-------------|-------|--------|-----------|
| Round shot | always | ×1 | 34 | ×1 | the default |
| Chain shot | once you have cleared the Coast of Europe | ×0.4 | 26 | ×1.15 | hits up in the sails too; each hit slows her to 55 % speed and 70 % turning for 6 s (more hits add time, up to 10 s) |
| Grape shot | once you have cleared the Bali Islands | ×0.3 | 20 | ×0.85 | kills a sailor with every ball that hits (2 on a rake), and throws some overboard; spreads wide |
| Fire shot | its recipe, on sale once you have cleared the Volcano | ×0.7 | 30 | ×1.1 | sets her on fire (see Special shot) |
| Frost shot | its recipe, on sale once you have cleared Frostbite Straits | ×0.6 | 28 | ×1.1 | freezes her sails |
| Stink shot | its recipe, on sale once you have cleared the Maelstrom | ×0.2 | 22 | ×1.2 | stops her moving and shooting; spreads wider than round shot |

`R` cycles through the ammo you have (special shot only while it has loads left); `1` to `6` pick Round, Chain,
Grape, Fire, Frost or Stink (by key position, so they work on any keyboard layout). On touch, the **Ammo** button
cycles, or opens the ammo tray once you own a recipe. A locked ammo says what unlocks it ("Buy Fire shot at the
Salty Sparrow", "Frost shot goes on sale after Frostbite Straits", "No Stink shot left this level"). Changing
ammo takes the gun crews half a second, and the hint bubble says what the new shot is for ("Round shot: smashes her
hull", "Chain shot: slows her down", "Grape shot: knocks out her crew", "Fire shot: sets her on fire. 4 loads left").
Every level starts with round shot; pirates always fire round shot.

You can see each shot work on the ship you hit: round shot's damage number is the biggest; a chain-slowed ship shows
"SLOWED!", a chain badge on her name tag with a timer bar that shrinks as the slow wears off, and a short, choppy wake;
the crew pips that grape shot knocks out blink before they go.

Firing while a side is still loading is never lost: tapped within 0.6 s of being ready, the shot goes off the moment
the guns are loaded (the Fire button and that side's reload bar show a white ring meanwhile); tapped earlier, the
button says "Loading…" with a soft click. On a phone held upright, the camera swings to show the ship you are firing
at beside your own, with her name tag on screen, and eases back when nobody is in reach (with reduced motion it cuts
instead of swinging).

### Special shot: Fire, Frost and Stink

Each special shot is a recipe bought once in the tavern's **Powder room** (see The Salty Sparrow): Fire 300 gold,
Frost 300, Stink 500. You don't buy the shot itself:

- **Loads.** Every level starts with 4 loads of each recipe you own (5 to 7 with the Powder Windmill on the island).
  A load is one broadside of one side, whatever the number of guns; `Space` fires both sides, so a special broadside
  from both costs 2. Loads are never carried over: they refill at every level start (and at the Kraken checkpoint).
  The Ammo cell reads "Fire ×4".
- **Powder crates.** Each Voyage III level has 2 crates (a keg under an orange diamond with a soft pillar of light;
  an orange diamond on the minimap too). Sail within 3 paces of one for +1 load of the special you own with the
  fewest loads ("+1 FROST SHOT!"), or +20 gold if you own no recipe.
- **Picking.** `4`, `5` and `6`, or `R`. On touch, the **Ammo** button opens the ammo tray: six round buttons, each
  with its icon, name and loads ("Fire ×4"); one you can't load is crossed out and says why. Picking one, any Fire
  tap, a tap elsewhere or 3 s without a pick closes it. The game keeps running meanwhile.
- **Out of loads.** A side whose special has no load left fires round shot instead, at once (no half-second swap):
  "Out of Fire shot! Round shot loaded."

| Shot | Pop | What it does to her | Lasts |
|------|-----|---------------------|-------|
| Fire | ON FIRE! | burns 3 hp a second, her hull doesn't mend, and she can't be boarded ("Too hot to board! Wait for the fire to go out."; the Board cell reads "HOT! 4 s") | 6 s; another hit starts it again |
| Frost | FROZEN! | half speed and 60 % turning | 5 s; another hit adds 2 s, up to 8 s |
| Stink | STINKY! | she coasts to a stop and can't turn, fire, ram, lob shells or board you; if you board her, her crew fights at ×0.75 (the Board preview shows the better odds, and the stink waits while the boarding plays out) | 4 s, then 10 s of "Clothes-pegs!" when stink does nothing to her |

- A ship holds one of these at a time, and a new one replaces the old, except: Fire on a stinky ship bursts the stink
  cloud for 15 more damage ("KA-BOOM!"), and Frost on a burning ship puts the fire out ("FIRE OUT! SSSS!"). Rogue
  waves and waterspouts put fires out too.
- A status is put on a ship once per broadside, however many of its balls hit her. Special balls kill no crew; a
  crit still does ×1.75 but has no crit effect.
- Bosses (the Molten Maw, the Phantom Galleon, the Inkheart, the Kraken) shake statuses off in half the time (fire 3
  s, frost 2.5 s up to 4 s, stink 2 s and then 20 s of clothes-pegs). Two shrug one off ("IMMUNE!"): the Molten Maw
  laughs at fire, and ghosts can't smell, so the Phantom ignores stink. The tavern's rumour board says so once you
  own those recipes.
- What you see: flames from her holes and charred sails, icicles and ice plates round her hull, or a lime stink
  cloud with buzzing flies; a flaming ball, a spiky ice ball or a clay stinkpot in flight, each with its own trail.
  Her name tag shows a flame, snowflake or stink-cloud badge with a ring of 8 dots that go dark as it wears off (a
  boss shows it beside the boss bar). Your own ship carries a small keg for each recipe you own.
- Every special is a trade, never just better: from a mid-game ship (4 guns of 12), a beam-on broadside at 20
  paces does 48 with round shot, 33.6 with Fire (plus 18 as she burns), 28.8 with Frost and 9.6 with Stink (then sail
  round and rake her stern).

### Steering

- **Keys:** `A` `D` or `←` `→`, as before.
- **Touch, ◀ ▶:** tap for a nudge, hold for a full turn. New: slide your thumb sideways on them and the turn follows
  it (a full turn is a 56 px slide; it starts once the thumb has moved 12 px). A little rudder needle above the
  buttons shows how far you are turning.
- **Touch, ship's wheel:** the pause menu's **Steering: ◀ ▶ buttons** toggle switches to **Steering: Ship's wheel**
  (saved; it shows only on touch screens, with a "New!" badge the first time). A brass-hubbed wheel takes the
  arrows' place: drag it sideways to turn (a full turn at 60 px) and it springs back when you let go. The captain at
  the helm turns his wheel the same way. The arrows stay the default, and the accessible way to steer.
- **The Big rudder & wheel** (the shipyard's seventh row) makes the Sea Biscuit turn much better when slow and a
  little better at speed.

### Crew and surrender

Every ship's name tag shows her hull bar and, under it, 10 crew pips with a gold **surrender notch** at about a
fifth of her crew. Hull damage thins a crew, but by half at most; grape shot, crits and boardings kill sailors
outright. A pirate whose crew falls to the notch **strikes her colours**: she hoists a white flag, stops firing
and drifts, two of her sailors stand with their hands up, and your cannonballs pass through her. Grapple her to
take her without a fight. Any struck ship still afloat when the level is cleared is yours anyway. The Molten Maw
never strikes.

Your own crew (the crossed cutlasses on your hull card) is 12 hands, more with the tavern's Boarding party. You
start every level with a full crew. Boardings cost hands; reinforcements bring 3 and every capture 2 (up to your full
crew). You never drop below 1, but you need 3 to grapple.

### Boarding

Press `G` (or tap **⚓ Board**) to grapple a pirate in reach: 14 paces from centre to centre (17 or 20 with
Long grapples), plus a quarter of her length. Of the ships in reach the Board button picks the one with the best
odds, then the nearest. Before you commit, the Board cell on the gun panel (and the Board button on touch) shows
the odds and about how many hands you would lose:

| Preview | Meaning |
|---------|---------|
| **CAPTURE! −1** (green tick) | she should strike in this fight |
| **FIGHT! −3** (gold cutlasses) | you should win the fight, but she won't strike yet |
| **RISKY! −4** (red "!") | her crew is about as strong as yours, or stronger |
| **TAKE HER!** (white flag) | she has struck: no fight |
| **HOT! 4 s** (touch: **Hot!**) | she burns (Fire shot) for 4 more seconds: no boarding until the fire is out. A fire ship that hasn't struck shows **HOT!** too |

The odds are your crew (times your Cutlass drills) against hers (times her crew's grit), and the lower her hull,
the better yours: soften her up first. Each of her sailors beaten in a boarding also takes 2 off her hull.

A boarding plays out in about 5 seconds: the hooks fly, she is reeled in alongside (1.2 s; 1.0 or 0.8 s with Long
grapples), your captain and up to four sailors swing across, the brawl, the result. While she is reeled in, every `G`
press (or tap) heaves for a little extra strength (+4 % a press, up to +20 %); it is a bonus, never needed. Your
gun crews are on the ropes for the whole boarding, so you can't fire. From the swing to the result no pirate
fires and bombs and lightning wait, but the other ships keep sailing. `G`, `Space` or `Enter` during the brawl
skips to the result. If her crew is beaten down to the notch she is **captured**; if not, you are driven back
and the ships push apart. If land blocks the reel, "She broke free!".

Why `G` did nothing shows in the hint bubble: "Get closer!", "Hooks coiling…" (6 s after any boarding), "Not
enough hands!", "Too hot to board!" (the Molten Maw), "Too hot to board! Wait for the fire to go out." (a burning
ship), "Too hot to board! Freeze her first." (a fire ship), "You can't board a sea monster!" (the Kraken), "Nothing
to board!" or "Busy!".

### Raiders

Frost Raiders (Frostbite Straits and the Maelstrom) and Squid Skiffs (the Kraken's Deep) come close and board
**you**. "BOARDERS!": you have 1.5 seconds to cut their ropes. Press `G` three times, hold it for 0.8 s, or hit
that raider with a cannonball. On touch the Board button reads **CUT!**: tap it three times or hold it. Otherwise
they come aboard and your crew fights them on your own deck, where it fights half as hard again.

- **Boarders driven back!** For 3 seconds you can **Counter-board!** them (`G`, or **Again!** on touch).
- If the raiders are beaten down to their notch, the raider is yours.
- **Overrun!** They grab 25 % of the gold you have plundered in this level (never your treasure chest) and cast
  off. A raid never sinks you or ends the run.
- A raider or skiff hit with Stink shot while her hooks are in drops them ("Ropes dropped!"), as if you had cut them.

### Capture and gold

A captured ship pays at once: twice the gold she would drop when sunk, plus 25. You also get 15 hull
back, 2 more hands and a 50-gold prize bonus at the end of the level. She hoists your flag and sails away.

| Ship | Sunk (coins) | Captured |
|------|--------------|----------|
| Corsair Cutter | 30 | 85 |
| Prahu Raider | 40 | 105 |
| Frost Raider | 50 | 125 |
| Privateer Brig | 60 | 145 |
| Ember Corsair | 60 | 145 |
| Dragon Junk | 80 | 185 |
| Man-o'-War | 100 | 225 |
| Treasure Galleon | 250 | 525 (and 150 more at the end of Doubloon Bay) |
| The Molten Maw | 200 | can't be boarded |
| The Phantom Galleon | can't be sunk | 625 |
| Shark Raider | 40 | 105 |
| Bomb Ketch | 70 | 165 |
| Iron Turtle | 120 | 265 |
| Fire Ship | 30 (none if she blows up) | 85 (once she has struck: freeze her) |
| Squid Skiff | 50 | 125 |
| The Inkheart | 350 | 725 |

The Kraken is not a ship: driving it off pays the Kraken's Pearl, 1,000 gold.

### Leaving a battle

The pause menu (`P`, `Esc` or the **II** button) has **Resume** and, under **Leave this battle**, **Shipyard**
and **Main menu**. Leaving asks once: "Leave the battle for the shipyard?" with **Leave** and **Keep fighting**
(`Esc` also goes back). The gold plundered in this level isn't banked, as in a shipwreck; your treasure chest,
upgrades and open levels stay. From the shipyard you can then try the level again or go to the main menu. If
"Level cleared!" is already counting down, the level counts as won: leaving banks its plunder and bonuses and
opens the next level. On a touch screen the pause menu also holds the Steering toggle (see Steering).

## Music and sound

The soundtrack is recorded music made with [ElevenLabs](https://elevenlabs.io) (Eleven Music),
with the game's own synthesised sound (Web Audio API) for everything that has no recording yet:

| Where | Music | |
|-------|-------|-|
| Title screen | a jaunty sea-shanty jig: fiddle, accordion, tin whistle, bodhrán | recorded |
| Shipyard (Sparrow's Floating Island) | a sunny harbour-tavern tune: concertina, mandolin, ukulele | recorded |
| Ashore in the town, Polly's, the tavern, the Riddle Bell and Builder Bess | the title screen's jig, over harbour sounds | recorded |
| Coast of Europe | a swashbuckling hornpipe: fiddle and accordion over a snare march, brass stabs | recorded |
| Bali Islands | gamelan bells, kendang drums and a bamboo flute | synthesised |
| The Volcano | taiko drums, low brass and driving cellos in D minor | recorded |
| Doubloon Bay | a fandango: trumpets over strummed guitars, castanets and a cajón | synthesised |
| Frostbite Straits | a fiddle tune over a bowed drone, with a rowing drum, a choir and horn calls | synthesised |
| The Maelstrom | a danse macabre: a ghostly theremin over a pizzicato waltz and a wheezing organ | synthesised |
| The Turtle Atolls | a calypso: steel pans and a marimba over a strummed ukulele, congas and shakers | synthesised |
| The Cape of Storms | a brass storm shanty: horns and a concertina over shivering storm strings and a big drum | synthesised |
| The Kraken's Deep | moonlit and mysterious: a low cello, a glass harmonica and whales calling far off | synthesised |
| The Kraken | a heartbeat over a low drone as it stirs, then a tuba motif over timpani in 6/8, with horns and a choir (faster in its last stand) | synthesised |
| Level cleared | a brass fanfare | recorded |
| Victory, shipwrecked | fanfares | synthesised |

The recorded tracks are seamless loops (48 to 80 seconds) and play at the same loudness as the
synthesised tunes they replace. The sound effects (cannons, splashes, hits, coins, sails, lava bombs,
grapples, cutlass clashes, cheers, thunder, the special shots' whoomph, ice and splorch, rams, mortars, the conch
horn, the Kraken's slams and sneezes, the Riddle Bell's ding-ding, the builders' hammers...) and the ambience (waves,
gulls, jungle birds, the volcano's rumble...) are synthesised.

- The files are in `assets/audio/` (MP3, about 5 MB in all). They download in the background, the
  title music first. A scene whose track hasn't arrived yet waits up to 2 seconds for it, then plays the
  synthesised tune, and switches to the recording when it comes in. If a file can't be loaded, that
  part of the soundtrack stays synthesised (and the shipyard keeps the title screen's tune).
- Add `?audio=synth` to the URL for the synthesised soundtrack only (nothing is downloaded).
- `tools/audio/assets.json` lists every recording: what it is for, the ElevenLabs prompt and generation,
  and where it was cut. `tools/audio/build.py` turns the raw downloads into the game's files
  (loop with a crossfaded seam, loudness, MP3) and `tools/audio/loopfind.py` finds the loop points
  (they need `ffmpeg` and Python 3 with `numpy`). The level trims (`gain` in `RECORDED`, `src/audio.js`)
  come from `node tests/audio.cjs --calibrate`. The raw downloads are not kept in the repository.
- To add a recording (say the Bali music, or a sound effect): generate and download it, add an entry
  to `assets.json` (for music, find the loop with `loopfind.py`), run
  `python3 tools/audio/build.py RAW_DIR music:bali` (it builds just that one and prints its line for
  `RECORDED`), add the line, calibrate the gain, and run `npm run test:audio`. Ambience beds
  (`RECORDED.amb`) and sound effects (`RECORDED.sfx`) work the same way.

## Shipyard & Sparrow's Floating Island

Between voyages the Sea Biscuit is moored at **Sparrow's Floating Island**, a pirate town built on
rafts, barrels and stilts: the Salty Sparrow tavern, a lookout tower with a sparrow weathervane,
market stalls, rope bridges, a shipyard crane hoisting a cannon, and townsfolk going about their day.
While you shop, your crew cleans the ship: mopping the deck, scrubbing the hull from a hanging plank
and from a rowboat, with soap bubbles everywhere. They cheer when you buy an upgrade.

The dock opens on the shipyard panel. **Go ashore** (at the top of the panel) lets you walk the town as the
captain (see Ashore below).

### Getting there

| From | Button | Ways out of the dock |
|------|--------|----------------------|
| Title screen | **Shipyard** | Back to the title |
| Level cleared | **Visit Sparrow's Floating Island** (next to **Sail to ...** and **Main menu**) | Set sail for the next level, or Main menu |
| Shipwrecked | **Visit the dock** | Try again (same level), or Main menu |
| Pause menu, in a battle | **Shipyard** (under Leave this battle) | Try again (same level), or Main menu |
| Victory after the Molten Maw | **Visit the dock** | Set sail for Doubloon Bay, or Back to the title |
| Victory after the Maelstrom | **Visit the dock** | Set sail for The Turtle Atolls, or Back to the title |
| Victory after the Kraken | **Visit the dock** | Back to the title |

The ways out are at the foot of the shipyard panel, in the town's Harbour menu and at your ship's gangplank.
After a level you don't have to sail on: **Main menu** ends the voyage there. Progress and the
treasure chest are kept, and the plunder so far counts for the best score (as when you are sunk).
`Enter` on the level-cleared screen still sails straight on.

### The treasure chest

- When you **clear** a level, everything you earned in it (loot, captures and the bonuses) goes into the
  treasure chest, which is saved. The level-cleared card says how much was banked and the new total;
  the title screen, the shipyard and the town show the chest too.
- Gold picked up in an attempt you **lose** (or leave from the pause menu) is not banked: trying again restores
  the gold you had when the level started.
- Spending comes out of the chest only, at the shipyard, the tavern, Polly's and Builder Bess. The voyage's
  plunder (the HUD's **Gold**) and the best score are never reduced by shopping. The quiz pays straight into the
  chest.
- Everything there is to buy costs 24,940 gold: the shipyard 6,240, the tavern's crew 4,600 and recipes 1,100,
  Polly's 1,200 and the island 11,800.

### Upgrades

Each tier is bought in turn, and each one shows on the model (more gun ports, bronze barrels and
shot piles, powder kegs and rammer racks, iron bands, rivets and an armoured bow, sail trim, a flying
jib and a spanker, a carpenter's toolbox, spare planks and patches, a bigger rudder, a gold-trimmed wheel, then a
brass wheel and a compass binnacle). Buying everything costs 6,240 gold.

| Upgrade | Effect at each tier | Prices |
|---------|---------------------|--------|
| Extra cannons | guns per side 3 → 4 → 5 | 300, 700 |
| Heavy shot | damage per ball 10 → 12 → 14 → 16 | 150, 350, 650 |
| Gun crew drills | reload 1.5 → 1.35 → 1.2 → 1.05 s | 150, 350, 650 |
| Iron-banded hull | hull strength 120 → 140 → 165 → 195 hp | 120, 300, 600 |
| Racing sails | top speed 12 → 13 → 14, acceleration 4 → 4.5 → 5, turning 1.4 → 1.5 → 1.6 | 150, 400 |
| Ship's carpenter | repairs 2 → 3 → 4.5 hp/s, starting 5 → 4 → 3 s after the last hit | 100, 300 |
| Big rudder & wheel | turning at a standstill 35 % → 50 % → 65 % → 80 % of the full rate (which it reaches at top speed), and the full rate ×1 → ×1.05 → ×1.1 → ×1.15 | 120, 300, 550 |

A Buy button you can't use yet says why ("Need 120 more gold" or "Fully upgraded").

### Paint (free)

- **Hull:** Honey & Teal (the original), Royal Blue & Gold, Crimson & Black, Emerald & Cream,
  Plum & Silver, Driftwood & Sea Green
- **Sails:** Cream canvas, Snow white, Crimson, Midnight, Sunset orange, Sky blue
- **Flag:** Blue pennant, Scarlet pennant, Gold pennant, Jolly Roger

Upgrades and paint are saved and used everywhere: on the title screen and on every voyage.

### Shipyard controls

| Action | Mouse / keyboard | Touch |
|--------|------------------|-------|
| Turn the view around the ship | drag the 3D view, or `←` `→` (`A` `D`) when no button is focused | drag the 3D view |
| Move through the panel | `Tab` / `Shift+Tab` (`Shift+Tab` from the tabs reaches **Go ashore**) | scroll the panel |
| Switch between Upgrades and Paint | `←` `→` on the tabs (`Home` / `End`) | tap a tab |
| Buy an upgrade, pick a paint | click, `Enter` or `Space` | tap |
| Mute | `M`, or the speaker button in a top corner | the speaker button in a top corner |

The view also sways slowly by itself (not when the system asks for reduced motion). There is no
pause in the shipyard: `P`, `Esc` and `Enter` (with no button focused) do nothing there. A held `Enter` or
`Space` presses a button once, here and on every screen outside a battle.

## Ashore: the town

**Go ashore** puts the captain on the pier at your ship's gangplank. He looks the way you dressed him at Polly's.
Walk the boardwalks, rafts and rope bridges; the water's edge is a wall, so you can't fall in. Townsfolk wave
and say hello as you pass ("Ahoy, Captain!", or "Fine coat, Cap'n!" in a priced or trophy coat), and walkers stop
and wait if you stand in their way (and if they stand in yours, you squeeze past them after a moment). The two most
valuable kinds of ship you have captured are moored off the island, flying your flag.

- **Places.** The places bar at the bottom (**Shipyard**, **Tailor**, **Tavern**, **Quiz**, **Build**, **Set
  sail**) walks you to a place and opens it. On phones (below 760 px wide, and on short landscape screens) its six
  buttons are 44 px icons, each with its name for screen readers. Near a door a prompt shows its name and how to go
  in.
  - **The Shipyard**: back to the shipyard panel. Its Go ashore button now reads **Back to town**.
  - **Polly's Plumes & Trims**, the tailor and barber, over the rope bridge from the plaza.
  - **The Salty Sparrow**, the tavern.
  - **Professor Barnacle's Riddle Bell**, the quiz, on the lookout tower's raft.
  - **Builder Bess**, on the plaza by the welcome sign: build the island up.
  - **The Sea Biscuit** (your gangplank): **All aboard?** offers the dock's ways out, or **Stay ashore**.
- **The Harbour menu** (☰, or `P` / `Esc`): Keep walking, Shipyard, Tailor, Tavern, Quiz, Build and the ways out,
  so every place is one key away without walking.
- **The camera** follows behind the captain and keeps clear of buildings, signs and awnings. A walking key you
  hold keeps going the way it started when the camera swings round on its own; dragging the view or `C` turns it.
  On a portrait screen the walk view uses a narrower lens, so the captain shows bigger.

### Polly's Plumes & Trims

Two tabs: **Captain** and **Crew**. Free items are worn at once. A priced item is tried on first: the captain
(or, on the Crew tab, three of your sailors lined up outside the shop) wears it, and a Buy button appears at the
top of its group ("Buy Cavalier's plume — 180 gold"). Leave the tab or the shop without buying and it goes back
on the rack. Trophies can't be bought: each unlocks with a feat. **Surprise me!** picks random free items for the
open tab. **Match the ship's paint** dresses the crew in your hull paint's colours.

Your look shows on the walking captain, at the helm in every battle and in every boarding party. The crew's
uniform shows in the boarding parties and on the cleaning crew at the dock (they change when you leave Polly's).

The catalogue (from `ITEMS` in `src/cosmetics.js`; the default of each slot is in bold):

| Captain | Free | Priced (gold) | Trophy |
|---------|------|---------------|--------|
| Hat | **Tricorn**, Bandana, Straw hat, No hat | Admiral's bicorne 120, Cavalier's plume 180 | Pirate King's crown: capture the Phantom Galleon; Professor's mortarboard: pass all 9 quiz islands |
| Coat | **Crimson coat**, Navy coat, Shirt and vest | Black coat 60, Emerald coat 60, Plum coat 60 | Admiral's white coat: capture 10 ships; Governor's coat: build every plot up to tier 3 |
| Beard | **Full beard**, Goatee, Stubble, Clean-shaven | Blackbeard braids 80, Curly moustache 40 | — |
| Hair colour | **Brown**, Black, Ginger, Blonde, Grey | Sea-blue dye 50, Coral-pink dye 50 | — |
| Hairstyle | **Cropped**, Long, Ponytail, Bald | — | — |
| Skin | Tone 1, Tone 2, **Tone 3**, Tone 4, Tone 5, Tone 6, Tone 7 | — | — |
| Body | **Broad**, Slim | — | — |
| Pet | **No pet** | Red parrot 150, Blue macaw 150 | Golden parrot: land 50 raking shots; Baby kraken: drive off the Kraken; Rainbow macaw: win all 27 quiz stars |
| Eyepatch | **No eyepatch**, Eyepatch | — | — |

| Crew | Free | Priced (gold) | Trophy |
|------|------|---------------|--------|
| Shirts | **Their own clothes**, Red stripes, Blue stripes, Black stripes, Teal shirts, Match the ship's paint | Navy jackets 60, Sunset stripes 60 | — |
| Headgear | **Their own hats**, Bandanas, Caps | Tricorns 80 | Skull bandanas: fight 15 boardings |
| Sash | **Their own sashes**, Gold sashes, Red sashes, Teal sashes, Purple sashes | — | — |

Everything priced costs 1,200 gold in all. Each item says what it is: Free, Owned, its price, "Need 30 more gold"
or "Locked: capture 10 ships". On Polly's podium the captain turns slowly; drag the view (or press `←` `→` when
nothing in the panel has focus) to turn him.

### The Salty Sparrow

Crew upgrades, bought from the same treasure chest as the shipyard and saved in their own record (from
`ARMORY` in `src/armory.js`):

| Upgrade | Improves | At each tier | Prices |
|---------|----------|--------------|--------|
| Boarding party | your crew | 12 → 15 → 18 → 22 hands (they join at the next level start) | 200, 450, 800 |
| Cutlass drills | boarding strength | ×1.0 → ×1.2 → ×1.4 → ×1.6 | 150, 350, 650 |
| Long grapples | grapple range | 14 → 17 → 20 paces, and the reel takes 1.2 → 1.0 → 0.8 s (coils of grapples hang on your rail) | 150, 400 |
| Master gunner | critical hits | 6 % → 9 % → 12 % → 15 % | 200, 450, 800 |

Buying everything costs 4,600 gold. The tavern also has:

- **The Powder room**: the recipes for Fire, Frost and Stink shot (see Special shot), each bought once, from
  `RECIPES` in `src/specials.js`. A row says what its shot does before you buy it, and the loads you get ("4 loads
  every level start", "(Windmill +2)").

  | Recipe | On sale once you have cleared | Price |
  |--------|-------------------------------|-------|
  | Fire shot | the Volcano | 300 |
  | Frost shot | Frostbite Straits | 300 |
  | Stink shot | the Maelstrom | 500 |

  Before then a row reads **Soon** and says when it goes on sale. Buying one adds its keg to your ship's rack; an
  owned one reads **Owned** and "Press 4 in battle" (on touch: "Tap Ammo in battle"). All three cost 1,100 gold.
- **The rumour board**: the next voyage's name, two lines of gossip and the ammo to bring. "Next" is the level
  after the one you cleared, the one to try again after a shipwreck (or a battle you left), or else the highest
  level open. Once you own Fire or Stink shot it adds a powder tip ("Powder tip: The Maw laughs at fire!",
  "Powder tip: Ghosts can't smell!").
- **The captain's log**: ships captured, boardings fought, raking shots and critical hits, and the trophies still
  to win with your progress ("Admiral's white coat: 3 of 10 captures", "Professor's mortarboard: 4 of 9 quiz
  islands passed").

### Professor Barnacle's Riddle Bell

On the lookout tower's raft stands a brass bell, a chalkboard headed "QUIZ ★" and **Professor Barnacle** (round
spectacles, a mortarboard, a long grey beard) with **Quizzle**, his green-and-yellow macaw. Go in at the bell (`E`,
or the round **Play** button) for the quiz: nine islands on a map, each a round of 5 questions, one from each of
sea and ships, sea life, places, pirates and sums. There is no timer and nothing to lose; you can leave a round at
any time ("Your stars are safe!").

| Island | Band | Answers to pick from | Gold for the 1st, 2nd and 3rd star |
|--------|------|----------------------|------------------------------------|
| 1 Shallow Shoals | 1 | 3 | 60, 15, 15 |
| 2 Seagull Sands | 1 | 3 | 80, 30, 30 |
| 3 Turtle Cove | 1 | 3 | 100, 45, 45 |
| 4 Coral Corner | 2 | 3 | 120, 60, 60 |
| 5 Puffin Point | 2 | 3 | 140, 75, 75 |
| 6 Whale Way | 2 | 3 | 160, 90, 90 |
| 7 Storm Cape | 3 | 4 | 180, 105, 105 |
| 8 Kraken Quay | 3 | 4 | 200, 120, 120 |
| 9 Professor's Peak | 3 | 4 | 220, 135, 135 |

- **Stars.** 3 right answers win a star, 4 two, 5 all three. A star on one island opens the next; the quiz never
  waits for the battles, so a child who prefers riddles can play all nine.
- **Gold, once.** Each star pays the first time it is won (2,610 for all 27), and finishing an island's round the
  first time pays 10 ("Good try!", whatever the score): 2,700 in all. Replays reshuffle the questions and pay
  nothing more, so the quiz can't be farmed.
- **A wrong answer** gets a soft marimba bonk (never a buzzer), "Not quite! It's Eight.", a ✓ on the right answer
  and the fun fact. A right one rings the bell ("Right you are!"). With 2 right: "So close: 2 right! Have another
  go?"
- **Lifebuoys.** With a Sea School on the island, each round has 1 to 3 lifebuoys (`H`): each takes away one
  wrong answer.
- **The questions**: 120 in `src/quizBank.js` (10 per category for each band, kind, true and child-safe, in
  British spelling) and the sums, made up fresh each round (band 1 adding and taking away within 20; band 2 within
  100, and ×2, ×5, ×10; band 3 times tables to 10 × 10 and sharing). A question about one of the game's seas waits
  until you have reached that sea, and a question isn't asked again until 60 others have been.
- Passing all nine islands wins the **Professor's mortarboard** at Polly's; all 27 stars win the **Rainbow
  macaw**.

### Builder Bess: building up the island

**Builder Bess** stands on the plaza by the welcome sign, beside an easel with a plan of the island. Go in (`E`, or
the round **Build** button) to build on ten fixed plots, today's shacks, each marked with a small "Build me!" board.
Each plot goes up one tier at a time (from `PLOTS` in `src/island.js`):

| Plot | Tiers | Prices | At each tier |
|------|-------|--------|--------------|
| Four homes: Tavern Row, Lagoon End, Tailor's Lane, Yard Corner | Cottage → Townhouse → Manor | 100, 250, 500 each | 2 → 4 → 6 villagers |
| Biscuit Bakery | Bread oven → Bakery → Bakery & café | 200, 450, 800 | when reinforcements arrive your crew patches 45 → 55 → 65 % of the hull (35 % without it) |
| Powder Windmill | Post mill → Stone mill → Powder mill | 250, 500, 900 | +1 → +2 → +3 loads of each special shot at every level start |
| Lighthouse | Beacon → Tower → Great light | 200, 450, 800 | every hazard warning 0.3 → 0.6 → 0.9 s longer (lava bombs, lightning, geysers, mortar shells, ink pots, waterspouts, rogue waves, the Kraken's attacks) |
| Market Hall | Stalls → Market hall → Grand bazaar | 250, 500, 900 | +5 → +10 → +15 % of a cleared level's gold, at most 300 a level |
| Sea School | Schoolroom → Bell tower → Academy | 150, 350, 600 | 1 → 2 → 3 lifebuoys a quiz round |
| Flower Park | Flower beds → Fountain → Bandstand | 150, 350, 600 | the villagers' gift +25 → +50 → +100 % |

- **Building** costs 3,400 gold for the homes and 8,400 for the amenities: 11,800 for the whole island. The panel
  has two tabs, **Homes** and **Amenities**; each row shows the tier ("Tier 2 of 3"), what it gives now and next,
  and one button ("Build Cottage — 100 gold", "Upgrade to Townhouse — 250 gold", "Need 30 more gold", "Fully
  built"). Picking a row turns the camera to its plot. A build puts up a scaffold, four hammer knocks and a saw,
  then the building springs up with bunting and a cheer (any key or tap skips it); a new home's villagers wave from
  the porch ("Thank you, Captain!").
- **Villagers** (up to 24) give a gift every time you clear a level, finales too: 5 gold each (more with the Flower
  Park), at most 240 a level. It shows on the level-cleared card as "Villagers' gift +60", beside "Market Hall +10%
  +85" if you have one. Up to 8 villagers walk the town (the rest are at home behind lit windows). Like all
  townsfolk they wait for you, you can squeeze past them, and they say things like "Lovely house, Cap'n!", "Fresh
  biscuits today!" (with a Bakery) or "The Kraken? Brrr!" (once it is driven off).
- **The island's rank** goes by the tiers built (30 in all): Hamlet, Village (5), Town (12), Harbour Town (20),
  **Pirate Capital** (30). It is painted on a plaque under the welcome sign and shown in the panel's header
  ("Villagers 12 · Town"). Reaching Pirate Capital wins the **Governor's coat** at Polly's.
- Apart from the "Build me!" boards, a fresh save's town looks as it always did. Every perk is small and shows where
  it works (the reinforcements banner, the Ammo cell, the longer rings, the level-cleared card, the quiz's
  lifebuoys).

### Town controls

| Action | Keyboard / mouse | Touch |
|--------|------------------|-------|
| Walk | `W` `A` `S` `D` or the arrows (they follow the camera) | the stick: put your thumb down on the left part of the screen and drag; a small tilt walks, more jogs |
| Sprint | hold `Shift` | hold the stick right over for half a second |
| Walk to a spot | click the boardwalk | tap the boardwalk |
| Walk to a place and open it | the places bar (`Tab` to it, then `Enter`) | tap the places bar |
| Go in at a door (or at the bell, or Bess) | `E`, or `Enter` / `Space` when no button has focus, or the prompt | the round **Go in** button (bottom right; **Play** at the bell, **Build** at Bess), or the prompt |
| Turn the camera | drag the view (up and down tilts it) | drag a finger outside the stick |
| Camera behind the captain | `C` | |
| Harbour menu | `P` or `Esc`, or ☰ | ☰ |
| Close the Harbour menu or All aboard? | `Esc` (or `P` for the Harbour menu), Keep walking, Stay ashore | Keep walking, Stay ashore |
| Back to town from Polly's, the tavern or Bess | `Esc`, or **Back to town** | **Back to town** |
| Switch Captain / Crew at Polly's, Homes / Amenities at Bess | `←` `→` on the tabs (`Home` / `End`) | tap a tab |
| Answer a quiz question | `1` to `4` (or `Tab` to an answer and `Enter`) | tap an answer |
| Throw a lifebuoy (with a Sea School) | `H` | **Lifebuoy** |
| Next question | `Enter` (Next ▶ takes focus) | **Next ▶** |
| Leave the quiz | `Esc`: a round goes back to the map, the map back to town | **Leave quiz**, **Map**, **Back to town** |
| Mute | `M`, or the speaker button | the speaker button |

Any move key or stick input stops a walk to a place. `E` always means the door; `Enter` and `Space` press a
button if one has focus. Walking moves focus off the town's buttons, so `Enter` at the next door goes in. A held
`Enter` presses once, so it never answers twice or builds twice; letter keys never answer (`A` and `D` walk).

## Play

ES modules need to be served over HTTP (not opened as `file://`):

```sh
npm start            # serves on http://localhost:8080
# or: python3 -m http.server 8080
```

Three.js and the add-ons it needs are vendored in `vendor/`, so there is no build step.

The game lowers its internal resolution automatically if frames run slow. Add `?quality=high` to the URL to force full resolution, or `?quality=low` for weak devices.

### Controls

| Action                 | Keyboard              | Touch           |
|------------------------|-----------------------|-----------------|
| Steer                  | `A` `D` / `←` `→`     | ◀ ▶ (hold, or slide a thumb on them), or the ship's wheel (see Steering) |
| Raise / lower sails    | `W` `S` / `↑` `↓`     | `+` `−`         |
| Fire left (port)       | `Q` (or `J`)          | ◀ Fire          |
| Fire right (starboard) | `E` (or `L`)          | Fire ▶          |
| Fire both sides        | `Space`               |                 |
| Board: grapple, heave, cut ropes, counter-board, skip the brawl, cut a Kraken tentacle | `G` (hold it to cut ropes or a tentacle) | ⚓ Board (top right; hold it to cut ropes or a tentacle) |
| Change ammo            | `R` cycles, `1` `2` `3` pick Round, Chain, Grape, `4` `5` `6` Fire, Frost, Stink | Ammo (top right, once chain shot is unlocked; with a recipe owned it opens the ammo tray) |
| Skip the fly-in, or the Kraken's rise | any key | any touch button (the rise: a tap anywhere) |
| Pause, or leave the battle | `P` / `Esc`       | `II` button     |
| Mute                   | `M`                   | speaker button  |

Cannons fire **sideways**, so turn your side toward the enemy. Your gunners automatically aim at
the nearest ship on that side and lead it. Each side reloads separately, and the hull slowly repairs
when you haven't been hit for a few seconds. Steering is locked while your crew is swinging across or fighting
in a boarding, and while a Kraken tentacle holds you. On touch the Board button always shows; when there is nothing
to board, a tap says why. The title's and the pause menu's help lists add "4–6 special" to the ammo keys, and on
touch "slide on them for gentle turns" (or, with the wheel on, how to drag it).

With "reduce motion" set in the system, the camera never shakes, crits don't freeze the frame, boardings and
the town's camera cut instead of swooping, and lightning becomes a slow tint of the sky. The Kraken's rise cuts to
its eye and back, the KA-BOOM! flash becomes a soft tint, flames, ice and stink clouds don't swirl or bob, the dawn
after the Kraken comes at once, and a new building and the quiz's stars fade in.

## Saves

Everything is saved in the browser's `localStorage`, one record per key:

| Key | What it holds |
|-----|---------------|
| `pirates-ahoy-unlocked` | the highest level you can play (1 to 9) |
| `pirates-ahoy-best` | the best plunder of a voyage |
| `pirates-ahoy-purse` | the treasure chest |
| `pirates-ahoy-ship` | the shipyard's upgrades and paint (the Big rudder & wheel only once bought) |
| `pirates-ahoy-armory` | the tavern's crew upgrades |
| `pirates-ahoy-powder` | the special-shot recipes you own (Fire, Frost, Stink) |
| `pirates-ahoy-island` | the tier of each of the island's ten plots |
| `pirates-ahoy-quiz` | each quiz island's stars, the stars and "Good try!"s already paid for, and the last 60 questions asked |
| `pirates-ahoy-settings` | how the ship steers on a touch screen: ◀ ▶ buttons or the ship's wheel |
| `pirates-ahoy-look` | the captain's and the crew's looks, and the priced items you own |
| `pirates-ahoy-feats` | captures (and which ships), boardings, raking shots, crits, the Phantom, the Kraken driven off, quiz islands passed, quiz stars and island tiers built: the captain's log, the trophies and the prize ships in town |
| `pirates-ahoy-tips` | which one-time battle tips you have seen (and the steering toggle's "New!" badge) |
| `pirates-ahoy-tutorial-done` | whether the first-voyage hints are done |
| `pirates-ahoy-muted` | sound on or off |

- Every record is checked when it is read, field by field where it has fields. Anything broken or tampered with
  (garbage, numbers out of range, unknown items, a worn item you don't own, a trophy you haven't won) falls back to
  its default, and the record is rewritten.
- Progress and the best score only ever go up, and so do recipes, island tiers and quiz stars. With the game open in
  two tabs, each tab takes the gold, purchases, looks, feats, progress, recipes, buildings, quiz stars and steering
  setting the other one saves, and neither undoes the other's.
- Feats are saved when a ship is captured, at the end of a level or a shipwreck, on pause, when the page is
  hidden and when you go to the menu or the dock; the Kraken's as soon as it is driven off. The Phantom, Kraken,
  quiz and island feats are never added up between tabs (each keeps the larger), and the quiz and island ones are
  raised from their records whenever those are saved and when the game loads.
- **The record first, then the chest.** A tavern upgrade, a priced item at Polly's, a recipe in the Powder room and
  a building from Bess each save their own record before the chest. If the record can't be written (storage full or
  switched off), nothing is bought and no gold moves: "Couldn't save: your browser's storage is full or switched
  off." Quiz gold works the same way round: the quiz record is saved first and the gold counts as paid only once the
  chest is saved too. Until then the stars still count (and open the next island), the gold stays owed ("Couldn't
  save your stars, so no gold this time"), and it is paid once, the next time it can be saved.
- **Storage blocked** (some private windows, or site data turned off): the game starts from the defaults (level 1,
  an empty chest, the stock ship and look) and works for the visit; nothing is kept. The quiz still plays (its stars
  and the islands they open last for the visit), and so does the steering setting.
- **Storage full**: what can't be written just isn't kept. A shipyard upgrade (the rudder too) still lasts for the
  visit, but its gold stays in the saved chest until the ship record can be saved too. Everything bought elsewhere
  is refused and costs nothing, as above. A free item you wear is worn for the visit.
- **Saves from before the Kraken Seas** keep everything; no key is renamed or removed. A save that had captured the
  Phantom Galleon with the Maelstrom open opens level 7 as it loads. A ship record without the rudder reads as tier 0
  and is left as it is; a feats record without the four new feats reads them as 0 and is rewritten once.
- The Kraken checkpoint ("Try again from the Kraken") lives only as long as the page; it is never saved.

## Code

- `src/main.js`: game loop, waves, combat, AI, hazards, HUD and input, boarding and capture wiring, special shot
  and powder crates, the Kraken's sequence (dread, rise, fight, Pearl, checkpoint) and its parts as targets, the
  treasure chest, saved records (the island's and the quiz's too), the shipyard panel and camera
- `src/voyage.js`: the whole voyage (`LEVELS`, all nine levels, which main imports) and `WITH_KRAKEN`, the switch
  for everything the Kraken Seas added (now `true`; before it went live only `?kraken=1` turned it on)
- `src/levels.js`: the levels of Voyage I, and Voyages I and II together; `src/act2.js`: the levels of Voyage II;
  `src/act3.js`: the levels of Voyage III
- `src/combat.js`: the battle rules and their numbers (range, rakes, crits, ammo, crew, boarding odds, raiders,
  capture gold, the Iron Turtle's armour); `src/mechanics.js`: Voyage II's level mechanics (the treasure convoy, the
  ice floes, the whirlpool's current); `src/mechanics3.js`: Voyage III's (waterspouts, rogue waves, the Inkheart's
  fall) and the new ships' tricks (the shark's ram, the ketch's mortar, the fire ship, ink pots and slicks).
  All three are plain modules with no imports, so Node tests load them
- `src/specials.js`: Fire, Frost and Stink shot (their table, the statuses and how they mix, recipes, loads,
  crates, the words they pop) and the powder record; `src/kraken.js`: the Kraken's simulation (the rise, the three
  phases, tentacles, grabs, specials on it, the Pearl). Both plain modules
- `src/island.js`: Bess's plots, prices and perks, the villagers, the gift, the Market and the town's rank, and the
  island record; `src/quiz.js`: the quiz islands, rounds, generated sums, stars and their gold, the bank's rules and
  the quiz record; `src/quizBank.js`: the 120 questions, one line each; `src/settings.js`: the steering setting and
  its record (all plain modules)
- `src/boarding.js`: the boarding set-piece (hooks, reel, swing, brawl, the camera); `src/tags.js`: the name tags
  with hull bars, crew pips, status badges with their time dots and the RAM! chevrons; `src/pops.js`: the pop words
  over the 3D view; `src/overboard.js`: sailors tumbling overboard and struck crews with their hands up
- `src/statusfx.js`: flames, ice and stink clouds on every ship with a status (five instanced meshes for the
  whole fleet); `src/krakenView.js`: the Kraken's model (body, eyes, tentacles, shadow, bubbles, warning rings, the
  Pearl)
- `src/scenery.js`: renderer with the cartoon outline effect, sky, ocean shader, clouds and lights
- `src/ships.js`: the cartoon ship models, including the player's paint, visible upgrades (the rudder and wheel too)
  and keg rack, holes, damage, flags, the cannonball and special-shot meshes and the powder crates' beacons
- `src/shipTypes.js`: ship stats, dimensions and crews (Voyage III's six new types too)
- `src/upgrades.js`: the shipyard's upgrades (and the Big rudder & wheel, `RUDDER`) and paint jobs, the player's
  stats per tier, and reading and writing the saved ship (no three.js, so Node can load it too)
- `src/armory.js`: the tavern's crew upgrades and their record; `src/cosmetics.js`: Polly's catalogue (with the
  four Kraken Seas trophies), the look and feats records, and the person options for the captain, your crew and
  each pirate faction (both plain modules)
- `src/people.js`: cartoon pirates and townsfolk with their outfits and animations (mopping, scrubbing, waving,
  fishing, fiddling, steering, sword fights...), the mortarboard and the baby kraken
- `src/walk.js`: the town's walking rules (where the captain may stand, paths, taps); `src/town.js`: the walking
  captain and the town camera; `src/townMode.js`: the town's screens (the walk HUD, Polly's, the tavern and its
  Powder room, the quiz and build views, the Harbour menu and All aboard?); `src/quizPanel.js`: the Riddle Bell's
  panel (the map, questions, answers, results); `src/buildPanel.js`: Builder Bess's panel
- `src/audio.js`: sound effects, music and ambience: the recorded tracks (`RECORDED`) and the synthesised
  sound for everything else
- `assets/audio/`: the recorded music; `tools/audio/`: how it was made (see Music and sound)
- `src/env/europe.js`, `src/env/bali.js`, `src/env/volcano.js`, `src/env/doubloon.js`, `src/env/frost.js`,
  `src/env/maelstrom.js`, `src/env/atolls.js` (with the waterspouts), `src/env/cape.js` (with the rogue wave's
  crest), `src/env/deep.js` (with the ink slicks, the dread and the dawn): the nine level environments
- `src/env/sparrow.js`: Sparrow's Floating Island, the shipyard's town, its walk data and the cleaning crew, the
  ten plots and their buildings, the villagers, the Riddle Bell with Professor Barnacle and Quizzle, and Builder Bess
- `src/style.js`: shared cel-shading materials, outline settings and palette fields
- `style.css`, `fx.css` (battle pop words and hit stickers), `town.css` (the town's screens, the quiz and build
  panels)
- `docs/boarders-away/`: the design and build record of the "Boarders Away!" update (`SPEC2.md` is the spec)
- `docs/kraken-seas/`: the design and build record of the "Kraken Seas" update (`SPEC3.md` is the spec; its section
  19 records where the build differs from it and the numbers the bots tuned)

## Tests

`npm test` runs 21 suites, in this order, and stops at the first one that fails: combat, specials, armory,
cosmetics, walk, mechanics, mechanics3, kraken, island, quiz, settings, upgrades, server, smoke, controls, audio,
battle, levels, town, voyage3, ashore. The first thirteen run in plain Node; the other eight run in headless
Chromium with Playwright. To run one alone use its `npm run test:<name>` script (or `node tests/<file>`); the
browser suites marked below can also run just some of their sections. A 22nd suite, `npm run test:balance`, is
opt-in and not part of `npm test`.

- `tests/combat.test.cjs` (`npm run test:combat`): the battle rules in `src/combat.js`.
  - the rules' tables, exactly; range fall-off, rakes, hit zones, crit chances and effects for every ammo;
    pirate shots scaled per level and never critting; the Phantom's ghost crew; the seeded random numbers
  - crew thinning (never below 0, never brought back by repairs, half at most from the hull) and the notch
  - every worked boarding example of the spec (odds to 3 decimals, losses, capture, overrun), the caps, the
    preview labels, capture and plunder gold, and junk input that never throws
  - the Iron Turtle's armour (beam ×0.5, rakes and crits in full) and the six Voyage III ship types against every
    per-type rule (crew, notch, hull zones, capture gold, boarding)
- `tests/specials.test.cjs` (`npm run test:specials`): special shot in `src/specials.js`.
  - the tables exactly (shots, recipes, loads, statuses, the two immunities) and every pop and hint word
  - each shot's hull factor, no crit effect, no crew killed; the worked example (48 / 33.6 + 18 / 28.8 / 9.6), and
    the Iron Turtle's armour on top
  - statuses: once per volley, refreshing, adding up to the cap, bosses at half, IMMUNE!, KA-BOOM!, FIRE OUT!,
    the clothes-pegs; their timings in 1/120 s steps; the one shared burn with the POWDER KEG crit; water putting
    fires out
  - loads (4 + the Windmill), one a side per broadside, the fall back to round shot, crates; why an ammo can't be
    loaded; on sale at the right progress; the powder record against the garbage battery of `upgrades.test.cjs`
- `tests/armory.test.cjs` (`npm run test:armory`): the tavern upgrades in `src/armory.js`: the table and its
  4,600-gold total, the stats and stat texts at every tier, that they agree with the battle rules, and the saved
  record against garbage, tampering and huge input.
- `tests/cosmetics.test.cjs` (`npm run test:cosmetics`): Polly's catalogue in `src/cosmetics.js`: one free
  default per slot, 1,200 gold of priced items, the trophies; wearing, buying, trophies and Surprise me!; the look
  and feats records against garbage; and that the person options handed to `people.js` are valid. Also the four
  Kraken Seas trophies (their feats' targets checked against `quiz.js` and `island.js`), the four new feats (old
  records read them as 0 and are rewritten once), the six new crews, and today's items and crews unchanged.
- `tests/walk.test.cjs` (`npm run test:walk`): the walking rules in `src/walk.js`, on the town's real walk data
  (`tests/fixtures/sparrow-walk.json`, dumped from `src/env/sparrow.js`).
  - every place reachable from the spawn and from each other; 10,000 random steps never leave the walk, walk into
    anything or climb more than a step; taps on decks and bridges land, taps on the water miss
  - the camera-only volumes; the rope bridges have no lip at their posts, and a jog held from each end crosses
    straight or a little off the line
  - the Kraken Seas: the Riddle Bell and Builder Bess reachable; no new deck or bridge, no plot walkable, every
    plot's tallest building a camera-only box from tier 0; Bess and the professor clear (by 1 to 2 u) of every
    walker's path, villager loop, bridge mouth and doorway, never narrowing a deck below 1.6 u; the villagers'
    loops, at most two on any bridge; the quiz's panel stand keeping the professor in view
  - small made-up towns (an L of two rects, a turned rect, a round mound, a sagging bridge, two islands) and junk
  - `WALK_SRC=path/to/walk.js` checks another copy of `walk.js`
- `tests/mechanics.test.cjs` (`npm run test:mechanics`): Voyage II's mechanics in `src/mechanics.js`, against a
  mock of the game: the convoy (gates, speeds, zig-zag, holding fire, escapes, the objective and the bonus), the
  floes (6 damage, once per 1.5 s, only above speed 6), the current (the drift formula, the eye's 5 hp a second,
  the Phantom rising); and that `src/act2.js` holds the three levels as tuned, after Voyage I.
- `tests/mechanics3.test.cjs` (`npm run test:mechanics3`): Voyage III's rules in `src/mechanics3.js`, against a
  mock of the game with the real ship types, and the levels in `src/act3.js`.
  - waterspouts (two, then three; forming 3 s and harmless; 22 s; the pull, the core, the fling, fire put out),
    rogue waves (the first at 30 s, then every 24 to 32 s; the warning; side-on between 50° and 130°, surf and ride
    outside; bosses turn bow-in), the shark's ram (the wind-up before any surge, damage by speed, the 9 s cooldown,
    frost and stink), the ketch's mortar, the fire ship (lit at 30 u, never a blast before 1.6 s, the blast's
    fall-off, frost makes her strike), the Inkheart's ink pots and slicks, and her fall (the fleet flees, the
    slicks fade, the Kraken waits for the boarding and the fleeing ships)
  - the same seed gives the same run; junk never throws
  - `act3.js`: the three levels exactly as tuned, every field the earlier levels have, at most 3 ships a wave and
    4 afloat
- `tests/kraken.test.cjs` (`npm run test:kraken`): the Kraken in `src/kraken.js`, with a scripted ship.
  - the rise (6 s, 3 s short, skippable, in open water), the bar and its notches, the phases at the notches (read
    from `KRAKEN`, so later tuning keeps them valid), chase speeds, attack counts and intervals
  - every warning at least 1.5 s; slams only inside the ring; never more than 4 tentacles up over 600 s of each
    phase; grabs only in phases 2 and 3, every way out of one, always free by 4 s, never again within 8 s
  - the head, the ink blob, the last stand's pull, the cut-off; never on land or off the map; hits (eye ×1.5,
    tentacles' 30 hp, no rakes) and special shot; the Pearl; the same seed gives the same fight
- `tests/island.test.cjs` (`npm run test:island`): the island in `src/island.js`: the plots table exactly and its
  totals (3,400 + 8,400 = 11,800), building one tier at a time and why not, the panel's texts, the perks at every
  tier (tier 0 is today's game), villagers, the gift (≤ 240) and the Market (≤ 300), the ranks at their edges, the
  island record against the garbage battery, and two tabs merging.
- `tests/quiz.test.cjs` (`npm run test:quiz`): the quiz in `src/quiz.js` and the bank in `src/quizBank.js`: the
  islands' gold (2,610 + 90), the real bank valid (at least 10 per category per band and 4 real-geography places
  questions in each band, British spelling, child-safe words) and every kind of mistake caught, 10,000 generated
  sums per band, rounds (one per category, the seas gate, the seen list, a seeded order), stars, lifebuoys, gold
  paid exactly once and owed gold paid once, and the quiz record against the garbage battery.
- `tests/settings.test.cjs` (`npm run test:settings`): the steering setting in `src/settings.js`: both modes,
  the defaults, round trips and the garbage battery (≤ 1 KB).
- `tests/upgrades.test.cjs` (`npm run test:upgrades`, under a second): the shipyard data and logic in
  `src/upgrades.js`.
  - the upgrade table (values and prices), the paint jobs, the defaults and the price of each next tier
  - the player's stats at every tier of every upgrade; tier 0 is the stock ship, and the stock ship
    type itself is never changed
  - whatever the saved ship record holds (garbage, cut-short JSON, arrays, tiers like `1e1`, `2.5`,
    `Infinity` or `-3`, unknown paint, extra fields, `__proto__` tricks, megabytes of junk, deep
    nesting, throwing getters) gives a valid config, field by field, without throwing
  - saving and reading back round trips every combination of tiers and paint
  - the Big rudder & wheel: its table, turning at every tier with every sails tier, its stat text, the 6,240-gold
    shipyard, and `up.rudder` written only from tier 1, so every older ship record stays exactly as it was
- `tests/server.test.cjs` (`npm run test:server`): the small static server the browser tests use.
  It only listens on 127.0.0.1, answers malformed URLs with 400 and never serves files outside
  the project (including `../` tricks, similarly named sibling folders and symlinks). Throwaway
  temp folders only.
- `tests/smoke.cjs` (`npm run test:smoke`): the whole game.
  - rendering, the nine level cards with their difficulty words (only level 1 open at first), sails, steering and
    broadsides
  - hits at different ranges, loot, waves and hull repair
  - reefs, lava bombs, the boss and its health bar
  - level unlocking, game over, retrying and winning; beating the Molten Maw opens Doubloon Bay
  - that every level (all nine) spawns ships in open water and keeps draw calls reasonable
  - touch controls, keyboard focus, pause/mute keys, hit and aim feedback, first-voyage hints,
    adaptive resolution
  - sound calls that must succeed and make sound. The sound module catches its own errors so
    they can't stop the game, but it counts them (`audio.errors()`) and logs them as `audio:`
    warnings, and the test fails on either. A regression check makes sure a broken sound call
    really fails the check. Short offline renders must also give finite, non-silent stereo audio.
  - a bot captain playing Voyage I's three levels with simulated controls, to show each can be won and the
    volcano is harder than the coast of Europe (Voyage II has its own bot in `tests/levels.cjs`, Voyage III in
    `tests/voyage3.cjs`)
  - the shipyard, visited from the victory screen: the banked chest, the crew aboard and the town's
    people, draw calls within budget (450), the light build of the townsfolk keeping the frame under
    1.5M triangles, and a screenshot (`8-dock.png`)
- `tests/controls.cjs` (`npm run test:controls`): focused regressions.
  - small-screen layouts (320x480 to desktop, small landscape phones too) keep every HUD control
    on screen, the hint readable and clear of the level banner, and the boss name whole
  - small text on the parchment cards, and the white Fire labels, have at least 4.5:1 contrast
  - the touch sail and fire buttons work by tap (exactly once), Enter, Space and native click,
    including a touch that slides off and a held Enter
  - steering: overlapping keys, keyboard-held and touch-held buttons, blur and pause release,
    a key whose character changes mid-hold
  - the pause dialog keeps keyboard focus inside and hands it back to the game, and fits every touch size with
    the Steering toggle in it
  - leaving a battle from the pause dialog (Shipyard / Main menu, asked once): the level's plunder is not
    banked, the chest is untouched, nothing of the battle is left behind; leaving while "Level cleared!" counts
    down banks the level
  - saved best score, progress and tutorial records are validated (Infinity, negative, garbage...)
  - losing the WebGL context pauses the fight and waits for the player when the view comes back,
    also after a second loss and on the level-cleared and shipwrecked screens; at the shipyard the
    dialog talks about the shipyard and focus returns to where it was, and a loss while the scenery
    is being built gives no errors (uses the browser's `WEBGL_lose_context`; reported as skipped if
    it isn't available)
  - the shipyard and Sparrow's Floating Island:
    - the level-cleared choices (sail on, visit the dock, main menu; `Enter` still sails on), and
      banking exactly each cleared level's earnings, never a lost attempt's
    - the dock: the ship at its berth with its crew aboard (and moving), the townsfolk at work
    - buying: the gold comes out of the chest and is saved, the ship is rebuilt with more cannons
      (counted on the model) and the next level's broadside fires that many balls; Buy buttons that
      are out of reach or maxed say why and buy nothing, a double-click or a held `Enter` buys once,
      also on a slow device where each purchase holds the page up for longer than a double-click
    - the hull scrubber's plank, ropes and bucket stay clear of the gun barrels for every number
      and size of cannons
    - paint is free, saved, marked with `aria-pressed` and shows on the ship
    - the ways out by where you came from (level cleared, shipwrecked, title), and that `P`, `Esc`,
      `Enter` and `Space` do nothing in the dock
    - keyboard only: `Tab` reaches the tabs, every Buy button, the swatches and the ways out, each
      with a visible focus ring, and `Shift+Tab` reaches Go ashore; `Enter` and `Space` buy, arrows switch
      tabs; `M` mutes and says so, and `Shift+Tab` reaches the sound button
    - corrupt saved chest and ship records fall back safely and are rewritten; with storage
      blocked the shipyard still works for the visit
    - the panel at 320x480, 390x844, 844x390, 568x320, 1280x720 and 1024x1366 (a portrait tablet
      wider than the bottom sheet): no page scroll, every control on screen or reachable by
      scrolling the panel, 44px targets, nothing overlapping, the ship framed beside or above the
      panel, a sound button on screen that a tap or click toggles, and every text in the panel at
      4.5:1 contrast or better (3:1 for large text)
  - two tabs buying at the tavern and counting feats, storage full at Polly's (nothing is paid for an item whose
    record can't be saved), the Voyage II goal pill and the HIT mark on small touch screens
  - phones: a broadside's target framed with her tag clear of the HUD on portrait phones (390x844, 360x640,
    320x480), the chase view kept on a phone on its side and on a desktop; the ammo hint and "Loading…" fitting
  - `CONTROLS_ONLY=review2` runs only the checks added by the Stage 2 review (leaving for the title, leaving
    during "Level cleared!", the two tabs, the goal pill and the HIT mark); `CONTROLS_ONLY=storage` runs only the
    storage-full purchase at Polly's; `CONTROLS_ONLY=phone` only the phone framing; `CONTROLS_ROOT` serves another
    copy of the game
- `tests/audio.cjs` (`npm run test:audio`, about two minutes): the recorded audio.
  - every file in `RECORDED` is served as `audio/mpeg`, decodes, and is stereo, finite, not silent and
    not clipping
  - each loop decodes to exactly its listed length and runs from its end into its start without a
    click: in the file and played by the engine across the seam (a click is a sample step far above the
    steps within 1 ms of it; a deliberately clicking loop must be caught) and without a gap
  - an MP3 decode that kept the encoder's priming and padding (as decoders without gapless support do)
    is cut back to exactly the music: both ends or one end padded, at 48 and 44.1 kHz
  - each recording is within 1 LU of the loudness of the synthesised sound it replaces (BS.1770
    integrated loudness of offline renders through the game's mix)
  - the level-cleared fanfare ducks the music and lets it back up
  - stand-ins for recordings that don't exist yet: a recorded bomb whistle is fitted to the bomb's
    flight (it ends on the impact), a recorded ambience bed replaces the synthesised one, and recorded
    music or ambience arriving mid-scene takes over from the synthesised version
  - in the game: the title, the shipyard and the levels play their recordings (Bali its synthesised
    tune), the title music is fetched first, only the last two scenes' tracks stay decoded,
    `?audio=synth` fetches nothing (and the shipyard keeps the title jig going), missing files fall
    back to the synthesised sound with one warning each, a file that fails while its scene waits
    for it starts the synthesised tune straight away, and a slow download goes silent for a moment,
    then synthesised, then recorded
  - `node tests/audio.cjs --calibrate` prints the `RECORDED` gains instead of checking
- `tests/battle.cjs` (`npm run test:battle`): the battle systems, on levels 1–3 (raiders, galleons and the
  Phantom are spawned for the checks), with the simulation stepped by hand and crits pinned.
  - damage: rakes ×2 / ×1.5, range ×1.25 / 1.0 / 0.85, each crit effect, pirate rakes scaled per level
  - ammo: locked until unlocked, `R`, `1`–`3` and the touch button, the swap time, chain slowing, grape killing
    crew, the ranges, and a broadside still firing one ball per gun
  - crew: thinned by the hull, the tag pips and notch, surrender (white flag, out of the fight, balls pass
    through), the capture at the level's end, reinforcements, a full crew every level
  - boarding: every refusal, `G` and the Board button (one grapple per tap), the phases and their timings, the
    truce (no pirate fires, no bomb advances), the outcome equal to the preview, 145 gold for the battered brig,
    surrender captures, context loss and pause mid-boarding, reduced motion
  - raiders (cut by presses, by holding, by a cannonball; the defence results; counter-boarding), the Phantom
    (half damage, the 1-hp floor, grape to the notch, 625 gold and the trophy feat)
  - the HUD and layouts with the new cells and buttons, contrast, pops, live announcements, the new sound
    effects, draw calls during a boarding (450 or less), saved records, the one-time tips, leaving from the
    pause dialog during a raid, and the Voyage II levels
  - the Stage 4 review's fixes (`review4`), and a phone held upright (`phone`): the target framed with her tag,
    a Fire tap while loading queued or answered with "Loading…", and what each ammo shows on the ship it hits
  - the Kraken Seas (the `kraken-*` sections): special shot (keys `4`–`6`, loads, `R`, `Space` with the last
    load, a queued tap, ranges and reloads), the touch ammo tray and its layout at every phone size, statuses and
    how they mix, bosses at half and the two immunities, what the statuses look like, the Iron Turtle's armour, hot
    and stinky boarding, the rudder's tiers, the thumb slide and the ship's wheel (two thumbs at once too), the
    powder, settings, tips and feats records, the shipyard's rudder row and the new sounds. (`kraken-live` and
    `kraken-finale-live` checked the six-level game while Voyage III was hidden; now they only say it sails.)
  - `BATTLE_ONLY=damage,ammo,...` runs some sections (`damage ammo crew boarding boarding-live raiders phantom
    hud audio records draws leave rules2 boarding2 hud2 touch tips short layout act2 review4 phone kraken-ammo
    kraken-status kraken-bosses kraken-look kraken-armour kraken-board kraken-steer kraken-tray kraken-saves
    kraken-dock kraken-audio kraken-live kraken-finale-live kraken-thumbs`); `BATTLE_ROOT` serves another copy of
    the game
- `tests/levels.cjs` (`npm run test:levels`): the voyages and Voyage II.
  - the title: nine cards in three groups (Easy … Mythic, skull pips, "Beat the Molten Maw"), and its layout at
    small sizes (no page scroll, all nine cards reachable by `Tab`)
  - the Molten Maw still wins the Victory screen; Sail on to the Far Seas and `Enter` start Doubloon Bay with the
    voyage's gold; the dock's ways out after it; after the Maelstrom the legend's words, the Kraken Seas' teaser,
    Sail on to the Kraken Seas and `Enter` to level 7
  - Doubloon Bay's convoy (the far gate, escapes, 525 + 150 for a capture), Frostbite Straits' floes (they move
    with the game clock, CRUNCH! once per 1.5 s, ice slows a raider) and the Maelstrom (the current, the eye,
    the Phantom rising, lightning that warns, strikes at most once per 3 s, and is only a tint under reduced
    motion)
  - a bot captain on a mid-game ship clears levels 4–6, each fights back, the Maelstrom hurts more than
    Doubloon Bay, and the ship never ends up inside land
  - draw calls at each Voyage II level start (310 or less) and during a boarding (450 or less); screenshots
  - the Stage 4 review's fixes (`review4`), and progress saved by a game with more levels than this one (as nine
    were, before Voyage III sailed for everyone) never lowered, in one tab or two (`progress`)
  - `LEVELS_ONLY=cards,finale,doubloon,frost,maelstrom,bot,draws,review4,progress` runs some sections;
    `LEVELS_ROOT` serves another copy of the game
- `tests/town.cjs` (`npm run test:town`): the town, through the real keys and touches.
  - going ashore (and back to the shipyard), walking with the keys (they follow the camera), sprinting, 30
    seconds of random keys and taps that never leave the walk, the tavern building in the way
  - the places bar, a move key stopping a walk, going in at doors, the Harbour menu (a labelled dialog that
    keeps focus inside and gives it back), All aboard? doing what the shipyard's ways out do
  - touch: the stick, tap-to-walk, the Go in button, 44-pixel controls, the portrait lens
  - Polly's: wearing, try-on and its undo, buying, too poor, a double-click buying once, trophies, Surprise me!,
    Match the ship's paint, the cleaning crew's shirts
  - the tavern (more hands at the next level, grapple coils on the rail, the rumour board, the log) and the
    captain's look at the helm and in the boarding party
  - corrupt look, feats, armory and tips records, blocked storage; layouts at 7 sizes; draw calls in the walk
    view and at Polly's; a lost graphics context; `M`; screenshots
  - the Stage 4 review's fixes (`review4`, `review4-world`): `E` at a door, held `Enter` / `Space`, the rope
    bridges and their mouths (never pinned beside one, also at a phone's frame rate), walkers waiting for the
    captain, and the captain squeezing past a porter who meets him head-on on a bridge
  - `TOWN_ONLY=ashore,walk,places,touch,wardrobe,tavern,battle,records,layout,draws,review4,review4-world` runs some
    sections; `TOWN_ROOT` serves another copy of the game
- `tests/voyage3.cjs` (`npm run test:voyage3`): Voyage III and the Kraken, with the simulation stepped by hand
  (levels 1–9 open, every tip seen, all three recipes owned).
  - the nine levels and Voyage III's three (seas, stars, waves, rules, crates, bonuses, the finale); each level's
    start: its music, its first wave, open water for every spawn and crate, draw calls (310 or less), the banner
    clear of the minimap at 568x320, screenshots (`atolls.png`, `cape.png`, `deep.png`)
  - special shot on the new ships (the shark, the Iron Turtle's armour, the skiff, the Inkheart a boss) and the
    loads at every level start
  - the Turtle Atolls' waterspouts, the shark's charge and the crates; the Cape of Storms' rogue waves (the 4 s
    warning with the horn and the WAVE! arrow; side-on, bow-in and stern-on), the fire ships and the mortar; the
    Kraken's Deep's geysers, ink pots and slicks, a Squid Skiff boarding you and the Inkheart's fall
  - the busiest play of each level (a full wave, every special, the hazards, warning rings, a crate and then a
    boarding): every frame 450 draw calls or less
  - the Kraken: the dread and the rise (skippable), its three phases, every warning at least 1.5 s with its sound
    and word, slams, ink, the boss bar and notches, FIRE! and the guns, "You can't board a sea monster!", the
    cut-off; a grab and every way out of it, no grab within 8 s of a release, CUT! on a phone; driven off, the
    Pearl, the baby kraken, the feat, the final Victory; Try again from the Kraken; reduced motion, draw calls and
    screenshots; and the Stage 2 review's fixes (its head is solid, all stop for the dread, the pops clear of the
    grab strip on small phones, the FIRE SHIP!, RAM! and WAVE! arrows at the screen edge)
  - the journey: cards 7–9 under "Voyage III · The Kraken Seas", the save migration (an old save with the Phantom
    captured opens level 7, one without doesn't), the Maelstrom's Victory and Sail on to the Kraken Seas, the
    dock's way out, and `Enter` starting level 7 with the voyage's gold
  - bot v3: a late-game ship clears each of levels 7–9 within 900 s (a second try allowed), once with special shot
    and once with none, never stuck for 60 s and never inside land, and the Kraken's fight takes 240 s or less (one
    seeded run each). Every Kraken hp the suite uses is read from `KRAKEN` in `src/kraken.js`, so retuning it keeps
    the checks valid
  - `VOYAGE3_ONLY=levels,starts,...` runs some sections (`levels starts specials banner atolls cape deep busy
    kraken-rise kraken-fight kraken-grab kraken-end kraken-retry kraken-look kraken-calm kraken-calm-look
    kraken-calm-pops seas-cues voyage bot`); `VOYAGE3_ROOT` serves another copy of the game; `VOYAGE3_QUERY`
    replaces the default `?quality=low` (`?quality=low&kraken=1` for a copy from before Voyage III went live)
- `tests/ashore.cjs` (`npm run test:ashore`): the Kraken Seas ashore, through the real keys and touches.
  - the places bar of six at the 7 town sizes (44 px icon buttons on phones, nothing overlapping), the Harbour
    menu's Quiz and Build; `E` / `Enter` at the bell and at Bess, the places-bar walks, `Esc` back
  - the walking bug with 8 villagers out: 30 s of random keys, stick drags and taps never leave the captain stuck
    behind someone for more than 1 s; held keys, the stick and taps cross every rope bridge both ways; no villager
    stops on a bridge, in a doorway, in a place's circle or at the gangplank; villagers wait for the captain
  - the quiz by keyboard and by taps: stars and their gold once, replays paying nothing, "Good try!" once, a
    wrong answer's ✓ and fun fact with the soft bonk, the next island opening, the lifebuoy; a seeded round is the
    same round; storage full (the stars shown, no gold, the owed gold paid exactly once later); a corrupt record
  - building: a Cottage for 100 (the record before the chest), the montage (a key skips it; a fade under reduced
    motion), 2 villagers, a held `Enter` or a double click building once, storage full and too poor costing
    nothing, every plot to tier 3 (Pirate Capital and the Governor's coat), and the walk data never changing
  - the perks (the Windmill's loads, the School's lifebuoys, the Lighthouse's longer warnings, the Bakery's patch,
    the gift and the Market on the level-cleared card); the Powder room (on sale by progress, storage full, the
    record before the chest, the docked ship's kegs, the rumour board's tips); two tabs
  - layouts at the 7 town sizes (answers 56 px tall, every answer of a round in view unscrolled); the quiz map's
    notes and the two quiz trophies; draw calls with every plot at tier 3 and 8 villagers (450 or less);
    screenshots (`quiz.png`, `build.png`, `island-tier3.png`); no tier-3 building hiding the docked ship from the
    shipyard's view
  - `ASHORE_ONLY=bar,keys,walking,quiz,quiztaps,quizrec,build,perks,powder,tabs,layout,quizfit,quizmap,draws,rays`
    runs some sections; `ASHORE_ROOT` serves another copy of the game; `ASHORE_QUERY` replaces the default
    `?quality=low`
- `tests/balance.cjs` (`npm run test:balance`, opt-in: not part of `npm test`): special shot doesn't flatten
  Voyages I and II. The Act I bot (smoke's) and the Act II bot (levels') sail again with every recipe owned and the
  Powder Windmill at tier 3, firing special shot. Each level must still be won (a bot may lose one run in ten, so
  none at the default 5 runs: aim spread and lava scatter are random), fight back and never put the ship inside
  land, and by the median damage taken the Volcano must still hurt more than the Coast of Europe and the Maelstrom
  more than Doubloon Bay.
  `BALANCE_RUNS=n` sails each level n times (default 5; SPEC3 section 19 records a run of 24), `BALANCE_ONLY=act1`
  or `act2` runs one bot, and `BALANCE_ROOT` / `BALANCE_QUERY` work as above.

### Setting up the tests

You need Node.js 18 or newer (developed with Node 22.22.0) and a Chromium build for Playwright:

```sh
npm install                          # http-server and Playwright (see package.json)
npx playwright install chromium      # downloads the browser Playwright drives
npm test
```

On Linux, Chromium also needs some system libraries. If the browser fails to launch with a
missing-library error, install them with `npx playwright install-deps chromium` (needs root),
or use `npx playwright install --with-deps chromium` instead of the second step.

The tests render with software WebGL (SwiftShader), which is slow: a single frame of the 3D scene can take
seconds, and the browser suites take minutes each (on the busy build machine a whole `npm test` took about 80
minutes before the Kraken Seas, smoke and controls the longest; the new browser suites add to that, ashore alone
about 20 minutes there, half of it its draw-call section). Screenshots therefore get a
120-second timeout (instead of Playwright's 30-second default); they are saved to
`tests/screenshots/` (set `SCREENSHOT_DIR` to put them elsewhere). Only one game page renders
at a time: the smoke test closes the desktop page before it opens the mobile one, because two
software-rendered pages at once made each tap wait for a frame for tens of seconds on a busy
machine. The adaptive-resolution check expects the slowness to come from rendering pixels; on a
machine whose CPU is busy with other work it can fail (the game rightly keeps full resolution
when fewer pixels don't help).

Versions used for the runs recorded in this repository: Node 22.22.0, Playwright 1.56.1 with its
Chromium build 1194 (Chrome 141), http-server 14.1.1. There is no lockfile, so `npm install`
resolves the newest versions within the ranges in `package.json`.
