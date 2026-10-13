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
Clearing a level unlocks the next one on the title screen (marked Easy, Medium and Hard).

On your first voyage, hints show how to steer and when a pirate is in your firing arc.
The gun panel lights up **FIRE!** when a side has a target, and hits pop up as **HIT!** / **SUNK!**.
Any key skips the camera fly-in at the start of a level.

All sound effects and music are generated in the browser with the Web Audio API: cannon booms,
splashes, a sea shanty for Europe, gamelan bells for Bali and drums for the Volcano.
Press `M` (or the speaker button) to mute.

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

- `src/main.js`: game loop, levels and waves, combat, AI, hazards, HUD and input
- `src/scenery.js`: renderer with the cartoon outline effect, sky, ocean shader, clouds and lights
- `src/ships.js`: the cartoon ship models
- `src/shipTypes.js`: ship stats and dimensions
- `src/audio.js`: procedural sound effects, music and ambience
- `src/env/europe.js`, `src/env/bali.js`, `src/env/volcano.js`: the three level environments
- `src/style.js`: shared cel-shading materials, outline settings and palette fields

## Tests

Three suites run in headless Chromium with Playwright (`npm test` runs them all, in this order):

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
