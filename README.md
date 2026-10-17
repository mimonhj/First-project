# Pirates Ahoy!

A cartoon-style 3D pirate adventure that runs in the browser, built with [three.js](https://threejs.org/).
Captain the **Sea Biscuit** across six seas in two voyages. Sink a different pirate fleet in each, or
grapple their ships, board them and take them as prizes. Between battles, walk the pirate
town of Sparrow's Floating Island as the captain: refit the ship, train the crew and dress them all up.

The look is inspired by animated TV shows: cel-shaded colours, bold ink outlines, a painted
sky with puffy clouds, and cartoon water with foam around every shore.

## The voyage

The title screen shows the six levels in two groups, each card with its difficulty word and skull pips
(1 to 6). Pick an open level, or press **Set sail!** to start at level 1.

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

Each level comes in two waves. When reinforcements arrive, your crew patches part of the hull and up to 3 more
hands join you. Clearing a level unlocks the next one and banks the level's plunder in your treasure chest, to spend
in town (see below). The level-cleared card lists ships sunk and captured, the bonuses and the gold banked.
Within each voyage every level is harder than the one before it. Voyage II expects a few upgrades, and
Doubloon Bay is gentler than the Molten Maw before it.

On your first voyage, hints show how to steer and when a pirate is in your firing arc.
After that, one-time tips in the same bubble introduce boarding, new ammo, raiders, rakes, counter-boarding and
ships that surrender. The gun panel lights up **FIRE!** when a side has a target, and hits pop up as **HIT!** /
**SUNK!**. Any key skips the camera fly-in at the start of a level.

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

`R` cycles through the ammo you have; `1`, `2` and `3` pick Round, Chain or Grape (by key position, so they
work on any keyboard layout). On touch, the **Ammo** button cycles. A locked ammo says what unlocks it. Changing
ammo takes the gun crews half a second. Every level starts with round shot; pirates always fire round shot.

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
enough hands!", "Too hot to board!" (the Molten Maw), "Nothing to board!" or "Busy!".

### Raiders

Frost Raiders (Frostbite Straits and the Maelstrom) come close and board **you**. "BOARDERS!": you have 1.5
seconds to cut their ropes. Press `G` three times, hold it for 0.8 s, or hit that raider with a cannonball. On
touch the Board button reads **CUT!**: tap it three times or hold it. Otherwise they come aboard and your crew
fights them on your own deck, where it fights half as hard again.

- **Boarders driven back!** For 3 seconds you can **Counter-board!** them (`G`, or **Again!** on touch).
- If the raiders are beaten down to their notch, the raider is yours.
- **Overrun!** They grab 25 % of the gold you have plundered in this level (never your treasure chest) and cast
  off. A raid never sinks you or ends the run.

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

### Leaving a battle

The pause menu (`P`, `Esc` or the **II** button) has **Resume** and, under **Leave this battle**, **Shipyard**
and **Main menu**. Leaving asks once: "Leave the battle for the shipyard?" with **Leave** and **Keep fighting**
(`Esc` also goes back). The gold plundered in this level isn't banked, as in a shipwreck; your treasure chest,
upgrades and open levels stay. From the shipyard you can then try the level again or go to the main menu. If
"Level cleared!" is already counting down, the level counts as won: leaving banks its plunder and bonuses and
opens the next level.

## Music and sound

The soundtrack is recorded music made with [ElevenLabs](https://elevenlabs.io) (Eleven Music),
with the game's own synthesised sound (Web Audio API) for everything that has no recording yet:

| Where | Music | |
|-------|-------|-|
| Title screen | a jaunty sea-shanty jig: fiddle, accordion, tin whistle, bodhrán | recorded |
| Shipyard (Sparrow's Floating Island) | a sunny harbour-tavern tune: concertina, mandolin, ukulele | recorded |
| Ashore in the town, Polly's and the tavern | the title screen's jig, over harbour sounds | recorded |
| Coast of Europe | a swashbuckling hornpipe: fiddle and accordion over a snare march, brass stabs | recorded |
| Bali Islands | gamelan bells, kendang drums and a bamboo flute | synthesised |
| The Volcano | taiko drums, low brass and driving cellos in D minor | recorded |
| Doubloon Bay | a fandango: trumpets over strummed guitars, castanets and a cajón | synthesised |
| Frostbite Straits | a fiddle tune over a bowed drone, with a rowing drum, a choir and horn calls | synthesised |
| The Maelstrom | a danse macabre: a ghostly theremin over a pizzicato waltz and a wheezing organ | synthesised |
| Level cleared | a brass fanfare | recorded |
| Victory, shipwrecked | fanfares | synthesised |

The recorded tracks are seamless loops (48 to 80 seconds) and play at the same loudness as the
synthesised tunes they replace. The sound effects (cannons, splashes, hits, coins, sails, lava bombs,
grapples, cutlass clashes, cheers, thunder...) and the ambience (waves, gulls, jungle birds, the volcano's
rumble...) are synthesised.

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
| Victory after the Maelstrom | **Visit the dock** | Back to the title |

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
- Spending comes out of the chest only, at the shipyard, the tavern and Polly's. The voyage's plunder (the HUD's
  **Gold**) and the best score are never reduced by shopping.

### Upgrades

Each tier is bought in turn, and each one shows on the model (more gun ports, bronze barrels and
shot piles, powder kegs and rammer racks, iron bands, rivets and an armoured bow, sail trim, a flying
jib and a spanker, a carpenter's toolbox, spare planks and patches). Buying everything costs 5270 gold.

| Upgrade | Effect at each tier | Prices |
|---------|---------------------|--------|
| Extra cannons | guns per side 3 → 4 → 5 | 300, 700 |
| Heavy shot | damage per ball 10 → 12 → 14 → 16 | 150, 350, 650 |
| Gun crew drills | reload 1.5 → 1.35 → 1.2 → 1.05 s | 150, 350, 650 |
| Iron-banded hull | hull strength 120 → 140 → 165 → 195 hp | 120, 300, 600 |
| Racing sails | top speed 12 → 13 → 14, acceleration 4 → 4.5 → 5, turning 1.4 → 1.5 → 1.6 | 150, 400 |
| Ship's carpenter | repairs 2 → 3 → 4.5 hp/s, starting 5 → 4 → 3 s after the last hit | 100, 300 |

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
and wait if you stand in their way. The two most valuable kinds of ship you have captured are moored off the
island, flying your flag.

- **Places.** The places bar at the bottom (**Shipyard**, **Tailor**, **Tavern**, **Set sail**) walks you to a
  place and opens it. Near a door a prompt shows its name and how to go in.
  - **The Shipyard**: back to the shipyard panel. Its Go ashore button now reads **Back to town**.
  - **Polly's Plumes & Trims**, the tailor and barber, over the rope bridge from the plaza.
  - **The Salty Sparrow**, the tavern.
  - **The Sea Biscuit** (your gangplank): **All aboard?** offers the dock's ways out, or **Stay ashore**.
- **The Harbour menu** (☰, or `P` / `Esc`): Keep walking, Shipyard, Tailor, Tavern and the ways out, so every
  place is one key away without walking.
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
| Hat | **Tricorn**, Bandana, Straw hat, No hat | Admiral's bicorne 120, Cavalier's plume 180 | Pirate King's crown: capture the Phantom Galleon |
| Coat | **Crimson coat**, Navy coat, Shirt and vest | Black coat 60, Emerald coat 60, Plum coat 60 | Admiral's white coat: capture 10 ships |
| Beard | **Full beard**, Goatee, Stubble, Clean-shaven | Blackbeard braids 80, Curly moustache 40 | — |
| Hair colour | **Brown**, Black, Ginger, Blonde, Grey | Sea-blue dye 50, Coral-pink dye 50 | — |
| Hairstyle | **Cropped**, Long, Ponytail, Bald | — | — |
| Skin | Tone 1, Tone 2, **Tone 3**, Tone 4, Tone 5, Tone 6, Tone 7 | — | — |
| Body | **Broad**, Slim | — | — |
| Pet | **No pet** | Red parrot 150, Blue macaw 150 | Golden parrot: land 50 raking shots |
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

- **The rumour board**: the next voyage's name, two lines of gossip and the ammo to bring. "Next" is the level
  after the one you cleared, the one to try again after a shipwreck (or a battle you left), or else the highest
  level open.
- **The captain's log**: ships captured, boardings fought, raking shots and critical hits, and the trophies still
  to win with your progress ("Admiral's white coat: 3 of 10 captures").

### Town controls

| Action | Keyboard / mouse | Touch |
|--------|------------------|-------|
| Walk | `W` `A` `S` `D` or the arrows (they follow the camera) | the stick: put your thumb down on the left part of the screen and drag; a small tilt walks, more jogs |
| Sprint | hold `Shift` | hold the stick right over for half a second |
| Walk to a spot | click the boardwalk | tap the boardwalk |
| Walk to a place and open it | the places bar (`Tab` to it, then `Enter`) | tap the places bar |
| Go in at a door | `E`, or `Enter` / `Space` when no button has focus, or the prompt | the round **Go in** button (bottom right), or the prompt |
| Turn the camera | drag the view (up and down tilts it) | drag a finger outside the stick |
| Camera behind the captain | `C` | |
| Harbour menu | `P` or `Esc`, or ☰ | ☰ |
| Close the Harbour menu or All aboard? | `Esc` (or `P` for the Harbour menu), Keep walking, Stay ashore | Keep walking, Stay ashore |
| Back to town from Polly's or the tavern | `Esc`, or **Back to town** | **Back to town** |
| Switch Captain / Crew at Polly's | `←` `→` on the tabs (`Home` / `End`) | tap a tab |
| Mute | `M`, or the speaker button | the speaker button |

Any move key or stick input stops a walk to a place. `E` always means the door; `Enter` and `Space` press a
button if one has focus. Walking moves focus off the town's buttons, so `Enter` at the next door goes in.

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
| Steer                  | `A` `D` / `←` `→`     | ◀ ▶ (hold)      |
| Raise / lower sails    | `W` `S` / `↑` `↓`     | `+` `−`         |
| Fire left (port)       | `Q` (or `J`)          | ◀ Fire          |
| Fire right (starboard) | `E` (or `L`)          | Fire ▶          |
| Fire both sides        | `Space`               |                 |
| Board: grapple, heave, cut ropes, counter-board, skip the brawl | `G` (hold it to cut ropes) | ⚓ Board (top right; hold it to cut ropes) |
| Change ammo            | `R` cycles, `1` `2` `3` pick | Ammo (top right, once chain shot is unlocked) |
| Pause, or leave the battle | `P` / `Esc`       | `II` button     |
| Mute                   | `M`                   | speaker button  |

Cannons fire **sideways**, so turn your side toward the enemy. Your gunners automatically aim at
the nearest ship on that side and lead it. Each side reloads separately, and the hull slowly repairs
when you haven't been hit for a few seconds. Steering is locked while your crew is swinging across or fighting
in a boarding. On touch the Board button always shows; when there is nothing to board, a tap says why.

With "reduce motion" set in the system, the camera never shakes, crits don't freeze the frame, boardings and
the town's camera cut instead of swooping, and lightning becomes a slow tint of the sky.

## Saves

Everything is saved in the browser's `localStorage`, one record per key:

| Key | What it holds |
|-----|---------------|
| `pirates-ahoy-unlocked` | the highest level you can play (1 to 6) |
| `pirates-ahoy-best` | the best plunder of a voyage |
| `pirates-ahoy-purse` | the treasure chest |
| `pirates-ahoy-ship` | the shipyard's upgrades and paint |
| `pirates-ahoy-armory` | the tavern's crew upgrades |
| `pirates-ahoy-look` | the captain's and the crew's looks, and the priced items you own |
| `pirates-ahoy-feats` | captures (and which ships), boardings, raking shots, crits and the Phantom: the captain's log, the trophies and the prize ships in town |
| `pirates-ahoy-tips` | which one-time battle tips you have seen |
| `pirates-ahoy-tutorial-done` | whether the first-voyage hints are done |
| `pirates-ahoy-muted` | sound on or off |

- Every record is checked when it is read, field by field where it has fields. Anything broken or tampered with
  (garbage, numbers out of range, unknown items, a worn item you don't own, a trophy you haven't won) falls back to
  its default, and the record is rewritten.
- Progress and the best score only ever go up. With the game open in two tabs, each tab takes the gold, purchases,
  looks, feats and progress the other one saves, and neither undoes the other's.
- Feats are saved when a ship is captured, at the end of a level or a shipwreck, on pause, when the page is
  hidden and when you go to the menu or the dock.
- **Storage blocked** (some private windows, or site data turned off): the game starts from the defaults (level 1,
  an empty chest, the stock ship and look) and works for the visit; nothing is kept.
- **Storage full**: what can't be written just isn't kept. A shipyard upgrade still lasts for the visit, but its
  gold stays in the saved chest until the ship record can be saved too. A tavern upgrade or a priced item at
  Polly's is refused and costs nothing (its record is saved before the chest). A free item you wear is worn for
  the visit.

## Code

- `src/main.js`: game loop, waves, combat, AI, hazards, HUD and input, boarding and capture wiring, the treasure
  chest, saved records, the shipyard panel and camera
- `src/levels.js`: the levels of Voyage I and the whole voyage (`LEVELS`); `src/act2.js`: the levels of Voyage II
- `src/combat.js`: the battle rules and their numbers (range, rakes, crits, ammo, crew, boarding odds, raiders,
  capture gold); `src/mechanics.js`: Voyage II's level mechanics (the treasure convoy, the ice floes, the
  whirlpool's current). Both are plain modules with no imports, so Node tests load them
- `src/boarding.js`: the boarding set-piece (hooks, reel, swing, brawl, the camera); `src/tags.js`: the name tags
  with hull bars and crew pips; `src/pops.js`: the pop words over the 3D view; `src/overboard.js`: sailors
  tumbling overboard and struck crews with their hands up
- `src/scenery.js`: renderer with the cartoon outline effect, sky, ocean shader, clouds and lights
- `src/ships.js`: the cartoon ship models, including the player's paint and visible upgrades, holes, damage,
  flags and cannonball meshes
- `src/shipTypes.js`: ship stats, dimensions and crews
- `src/upgrades.js`: the shipyard's upgrades and paint jobs, the player's stats per tier, and reading
  and writing the saved ship (no three.js, so Node can load it too)
- `src/armory.js`: the tavern's crew upgrades and their record; `src/cosmetics.js`: Polly's catalogue, the look
  and feats records, and the person options for the captain, your crew and each pirate faction (both plain modules)
- `src/people.js`: cartoon pirates and townsfolk with their outfits and animations (mopping, scrubbing, waving,
  fishing, fiddling, steering, sword fights...)
- `src/walk.js`: the town's walking rules (where the captain may stand, paths, taps); `src/town.js`: the walking
  captain and the town camera; `src/townMode.js`: the town's screens (the walk HUD, Polly's, the tavern, the
  Harbour menu and All aboard?)
- `src/audio.js`: sound effects, music and ambience: the recorded tracks (`RECORDED`) and the synthesised
  sound for everything else
- `assets/audio/`: the recorded music; `tools/audio/`: how it was made (see Music and sound)
- `src/env/europe.js`, `src/env/bali.js`, `src/env/volcano.js`, `src/env/doubloon.js`, `src/env/frost.js`,
  `src/env/maelstrom.js`: the six level environments
- `src/env/sparrow.js`: Sparrow's Floating Island, the shipyard's town, its walk data and the cleaning crew
- `src/style.js`: shared cel-shading materials, outline settings and palette fields
- `style.css`, `fx.css` (battle pop words and hit stickers), `town.css` (the town's screens)
- `docs/boarders-away/`: the design and build record of the "Boarders Away!" update (`SPEC2.md` is the spec)

## Tests

`npm test` runs thirteen suites, in this order, and stops at the first one that fails. The first seven run in
plain Node; the others run in headless Chromium with Playwright. To run one alone use its `npm run` script (or
`node tests/<file>`); the browser suites marked below can also run just some of their sections.

- `tests/combat.test.cjs` (`npm run test:combat`): the battle rules in `src/combat.js`.
  - the rules' tables, exactly; range fall-off, rakes, hit zones, crit chances and effects for every ammo;
    pirate shots scaled per level and never critting; the Phantom's ghost crew; the seeded random numbers
  - crew thinning (never below 0, never brought back by repairs, half at most from the hull) and the notch
  - every worked boarding example of the spec (odds to 3 decimals, losses, capture, overrun), the caps, the
    preview labels, capture and plunder gold, and junk input that never throws
- `tests/armory.test.cjs` (`npm run test:armory`): the tavern upgrades in `src/armory.js`: the table and its
  4,600-gold total, the stats and stat texts at every tier, that they agree with the battle rules, and the saved
  record against garbage, tampering and huge input.
- `tests/cosmetics.test.cjs` (`npm run test:cosmetics`): Polly's catalogue in `src/cosmetics.js`: one free
  default per slot, 1,200 gold of priced items, the trophies; wearing, buying, trophies and Surprise me!; the look
  and feats records against garbage; and that the person options handed to `people.js` are valid.
- `tests/walk.test.cjs` (`npm run test:walk`): the walking rules in `src/walk.js`, on the town's real walk data
  (`tests/fixtures/sparrow-walk.json`, dumped from `src/env/sparrow.js`).
  - every place reachable from the spawn and from each other; 10,000 random steps never leave the walk, walk into
    anything or climb more than a step; taps on decks and bridges land, taps on the water miss
  - the camera-only volumes; the rope bridges have no lip at their posts, and a jog held from each end crosses
    straight or a little off the line
  - small made-up towns (an L of two rects, a turned rect, a round mound, a sagging bridge, two islands) and junk
  - `WALK_SRC=path/to/walk.js` checks another copy of `walk.js`
- `tests/mechanics.test.cjs` (`npm run test:mechanics`): Voyage II's mechanics in `src/mechanics.js`, against a
  mock of the game: the convoy (gates, speeds, zig-zag, holding fire, escapes, the objective and the bonus), the
  floes (6 damage, once per 1.5 s, only above speed 6), the current (the drift formula, the eye's 5 hp a second,
  the Phantom rising); and that `src/act2.js` holds the three levels as tuned, after Voyage I.
- `tests/upgrades.test.cjs` (`npm run test:upgrades`, under a second): the shipyard data and logic in
  `src/upgrades.js`.
  - the upgrade table (values and prices), the paint jobs, the defaults and the price of each next tier
  - the player's stats at every tier of every upgrade; tier 0 is the stock ship, and the stock ship
    type itself is never changed
  - whatever the saved ship record holds (garbage, cut-short JSON, arrays, tiers like `1e1`, `2.5`,
    `Infinity` or `-3`, unknown paint, extra fields, `__proto__` tricks, megabytes of junk, deep
    nesting, throwing getters) gives a valid config, field by field, without throwing
  - saving and reading back round trips every combination of tiers and paint
- `tests/server.test.cjs` (`npm run test:server`): the small static server the browser tests use.
  It only listens on 127.0.0.1, answers malformed URLs with 400 and never serves files outside
  the project (including `../` tricks, similarly named sibling folders and symlinks). Throwaway
  temp folders only.
- `tests/smoke.cjs` (`npm run test:smoke`): the whole game.
  - rendering, the six level cards (only level 1 open at first), sails, steering and broadsides
  - hits at different ranges, loot, waves and hull repair
  - reefs, lava bombs, the boss and its health bar
  - level unlocking, game over, retrying and winning; beating the Molten Maw opens Doubloon Bay
  - that every level (all six) spawns ships in open water and keeps draw calls reasonable
  - touch controls, keyboard focus, pause/mute keys, hit and aim feedback, first-voyage hints,
    adaptive resolution
  - sound calls that must succeed and make sound. The sound module catches its own errors so
    they can't stop the game, but it counts them (`audio.errors()`) and logs them as `audio:`
    warnings, and the test fails on either. A regression check makes sure a broken sound call
    really fails the check. Short offline renders must also give finite, non-silent stereo audio.
  - a bot captain playing Voyage I's three levels with simulated controls, to show each can be won and the
    volcano is harder than the coast of Europe (Voyage II has its own bot in `tests/levels.cjs`)
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
  - the pause dialog keeps keyboard focus inside and hands it back to the game
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
  - `CONTROLS_ONLY=review2` runs only the checks added by the Stage 2 review (leaving for the title, leaving
    during "Level cleared!", the two tabs, the goal pill and the HIT mark); `CONTROLS_ONLY=storage` runs only the
    storage-full purchase at Polly's; `CONTROLS_ROOT` serves another copy of the game
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
  - `BATTLE_ONLY=damage,ammo,...` runs some sections (`damage ammo crew boarding boarding-live raiders phantom
    hud audio records draws leave rules2 boarding2 hud2 touch tips short layout act2`); `BATTLE_ROOT` serves
    another copy of the game
- `tests/levels.cjs` (`npm run test:levels`): the two voyages.
  - the title: six cards in two groups (Easy … Legendary, skull pips, "Beat the Molten Maw"), and its layout at
    small sizes
  - the Molten Maw still wins the Victory screen; Sail on to the Far Seas and `Enter` start Doubloon Bay with the
    voyage's gold; the dock's ways out after it; the legend's words after the Maelstrom
  - Doubloon Bay's convoy (the far gate, escapes, 525 + 150 for a capture), Frostbite Straits' floes (they move
    with the game clock, CRUNCH! once per 1.5 s, ice slows a raider) and the Maelstrom (the current, the eye,
    the Phantom rising, lightning that warns, strikes at most once per 3 s, and is only a tint under reduced
    motion)
  - a bot captain on a mid-game ship clears levels 4–6, each fights back, the Maelstrom hurts more than
    Doubloon Bay, and the ship never ends up inside land
  - draw calls at each Voyage II level start (310 or less) and during a boarding (450 or less); screenshots
  - `LEVELS_ONLY=cards,finale,doubloon,frost,maelstrom,bot,draws` runs some sections; `LEVELS_ROOT` serves
    another copy of the game
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
  - `TOWN_ONLY=ashore,walk,places,touch,wardrobe,tavern,battle,records,layout,draws` runs some sections;
    `TOWN_ROOT` serves another copy of the game

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
minutes, smoke and controls the longest). Screenshots therefore get a
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
