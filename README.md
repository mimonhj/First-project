# Pirates Ahoy!

A cartoon-style 3D pirate adventure that runs in the browser, built with [three.js](https://threejs.org/).
Captain the **Sea Biscuit** on a voyage across three seas and sink a different pirate fleet in each.

The look is inspired by animated TV shows: cel-shaded colours, bold ink outlines, a painted
sky with puffy clouds, and cartoon water with foam around every shore.

## The voyage

| Level | Where | Pirates | Hazards |
|-------|-------|---------|---------|
| 1 ★☆☆ | **Coast of Europe**: cliffs, a lighthouse, a harbour town and a castle | Corsair Cutters, then a Privateer Brig | Rocky islets |
| 2 ★★☆ | **Bali Islands**: jungle islands, temples and rice terraces | Prahu Raiders, then Dragon Junks | Coral reefs slow your ship (but not the shallow-draft prahus) |
| 3 ★★★ | **The Volcano**: open sea under an erupting volcano | Ember Corsairs and a Man-o'-War, then **The Molten Maw** alone | Lava bombs land inside red target circles and hurt any ship caught there, pirates included |

Each level comes in two waves. When reinforcements arrive, your crew patches part of the hull.
Clearing a level unlocks the next one on the title screen (marked Easy, Medium and Hard) and banks
the level's plunder in your treasure chest, to spend at the shipyard (see below).

On your first voyage, hints show how to steer and when a pirate is in your firing arc.
The gun panel lights up **FIRE!** when a side has a target, and hits pop up as **HIT!** / **SUNK!**.
Any key skips the camera fly-in at the start of a level.

All sound effects and music are generated in the browser with the Web Audio API: cannon booms,
splashes, a sea shanty for Europe, gamelan bells for Bali and drums for the Volcano.
Press `M` (or the speaker button) to mute.

## Shipyard & Sparrow's Floating Island

Between voyages the Sea Biscuit is moored at **Sparrow's Floating Island**, a pirate town built on
rafts, barrels and stilts: the Salty Sparrow tavern, a lookout tower with a sparrow weathervane,
market stalls, rope bridges, a shipyard crane hoisting a cannon, and townsfolk going about their day.
While you shop, your crew cleans the ship: mopping the deck, scrubbing the hull from a hanging plank
and from a rowboat, with soap bubbles everywhere. They cheer when you buy an upgrade.

### Getting there

| From | Button | Ways out of the shipyard |
|------|--------|--------------------------|
| Title screen | **Shipyard** | Back to the title |
| Level cleared | **Visit Sparrow's Floating Island** (next to **Sail to ...** and **Main menu**) | Set sail for the next level, or Main menu |
| Shipwrecked | **Visit the dock** | Try again (same level), or Main menu |
| Victory | **Visit the dock** | Back to the title |

After a level you don't have to sail on: **Main menu** ends the voyage there. Progress and the
treasure chest are kept, and the plunder so far counts for the best score (as when you are sunk).
`Enter` on the level-cleared screen still sails straight on.

### The treasure chest

- When you **clear** a level, everything you earned in it (loot and the level bonus) goes into the
  treasure chest, which is saved. The level-cleared card says how much was banked and the new total;
  the title screen and the shipyard show the chest too.
- Gold picked up in an attempt you **lose** is not banked (trying again restores the gold you had
  when the level started, as before).
- Spending comes out of the chest only. The voyage's plunder (the HUD's **Gold**) and the best
  score are never reduced by shopping.

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
| Move through the panel | `Tab` / `Shift+Tab` | scroll the panel |
| Switch between Upgrades and Paint | `←` `→` on the tabs (`Home` / `End`) | tap a tab |
| Buy an upgrade, pick a paint | click, `Enter` or `Space` | tap |
| Mute | `M` | the speaker button on the title screen (there is none in the shipyard) |

The view also sways slowly by itself (not when the system asks for reduced motion). There is no
pause in the shipyard: `P`, `Esc` and `Enter` (with no button focused) do nothing there.

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
| Fire left (port)       | `Q`                   | ◀ Fire          |
| Fire right (starboard) | `E`                   | Fire ▶          |
| Fire both sides        | `Space`               |                 |
| Pause                  | `P` / `Esc`           | `II` button     |
| Mute                   | `M`                   | speaker button  |

Cannons fire **sideways**, so turn your side toward the enemy. Your gunners automatically aim at
the nearest ship on that side and lead it. Each side reloads separately, and the hull slowly repairs
when you haven't been hit for a few seconds.

## Code

- `src/main.js`: game loop, levels and waves, combat, AI, hazards, HUD and input, the treasure chest
  and the shipyard panel and camera
- `src/scenery.js`: renderer with the cartoon outline effect, sky, ocean shader, clouds and lights
- `src/ships.js`: the cartoon ship models, including the player's paint and visible upgrades
- `src/shipTypes.js`: ship stats and dimensions
- `src/upgrades.js`: the shipyard's upgrades and paint jobs, the player's stats per tier, and reading
  and writing the saved ship (no three.js, so Node can load it too)
- `src/people.js`: cartoon pirates and townsfolk with their animations (mopping, scrubbing, waving,
  fishing, fiddling...)
- `src/audio.js`: procedural sound effects, music and ambience
- `src/env/europe.js`, `src/env/bali.js`, `src/env/volcano.js`: the three level environments
- `src/env/sparrow.js`: Sparrow's Floating Island, the shipyard's town and the cleaning crew
- `src/style.js`: shared cel-shading materials, outline settings and palette fields

## Tests

`npm test` runs four suites, in this order. The first runs in plain Node; the others run in headless
Chromium with Playwright:

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
  - rendering, the level-select screen, sails, steering and broadsides
  - hits at different ranges, loot, waves and hull repair
  - reefs, lava bombs, the boss and its health bar
  - level unlocking, game over, retrying and winning
  - that every level spawns ships in open water and keeps draw calls reasonable
  - touch controls, keyboard focus, pause/mute keys, hit and aim feedback, first-voyage hints,
    adaptive resolution
  - sound calls that must succeed and make sound. The sound module catches its own errors so
    they can't stop the game, but it counts them (`audio.errors()`) and logs them as `audio:`
    warnings, and the test fails on either. A regression check makes sure a broken sound call
    really fails the check. Short offline renders must also give finite, non-silent stereo audio.
  - a bot captain playing all three levels with simulated controls, to show every level can be won
  - the shipyard, visited from the victory screen: the banked chest, the crew aboard and the town's
    people, draw calls within budget (450) and a screenshot (`8-dock.png`)
- `tests/controls.cjs` (`npm run test:controls`): focused regressions.
  - small-screen layouts (320x480 to desktop, small landscape phones too) keep every HUD control
    on screen, the hint readable and clear of the level banner, and the boss name whole
  - small text on the parchment cards, and the white Fire labels, have at least 4.5:1 contrast
  - the touch sail and fire buttons work by tap (exactly once), Enter, Space and native click,
    including a touch that slides off and a held Enter
  - steering: overlapping keys, keyboard-held and touch-held buttons, blur and pause release,
    a key whose character changes mid-hold
  - the pause dialog keeps keyboard focus inside and hands it back to the game
  - saved best score, progress and tutorial records are validated (Infinity, negative, garbage...)
  - losing the WebGL context pauses the fight and waits for the player when the view comes back,
    also after a second loss and on the level-cleared and shipwrecked screens (uses the
    browser's `WEBGL_lose_context`; reported as skipped if it isn't available)
  - the shipyard and Sparrow's Floating Island:
    - the level-cleared choices (sail on, visit the dock, main menu; `Enter` still sails on), and
      banking exactly each cleared level's earnings, never a lost attempt's
    - the dock: the ship at its berth with its crew aboard (and moving), the townsfolk at work
    - buying: the gold comes out of the chest and is saved, the ship is rebuilt with more cannons
      (counted on the model) and the next level's broadside fires that many balls; Buy buttons that
      are out of reach or maxed say why and buy nothing, a double-click or a held `Enter` buys once
    - paint is free, saved, marked with `aria-pressed` and shows on the ship
    - the ways out by where you came from (level cleared, shipwrecked, title), and that `P`, `Esc`,
      `Enter` and `Space` do nothing in the dock
    - keyboard only: `Tab` reaches the tabs, every Buy button, the swatches and the ways out, each
      with a visible focus ring; `Enter` and `Space` buy, arrows switch tabs
    - corrupt saved chest and ship records fall back safely and are rewritten; with storage
      blocked the shipyard still works for the visit
    - the panel at 320x480, 390x844, 844x390, 568x320 and 1280x720: no page scroll, every control
      on screen or reachable by scrolling the panel, 44px targets, nothing overlapping, the ship
      framed beside or above the panel, and every text in the panel at 4.5:1 contrast or better
      (3:1 for large text)

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

The tests render with software WebGL (SwiftShader), which is slow: a full run takes several
minutes, and a single frame of the 3D scene can take seconds. Screenshots therefore get a
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
