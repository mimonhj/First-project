# Pixel Pirates

A pixel-art 3D pirate game that runs in the browser, built with [three.js](https://threejs.org/).
Captain your ship across five levels of naval battles. Sink pirate sloops, brigs and
finally Blackbeard's galleon, then sail over the gold they drop.

The scene is rendered at 1/3 resolution and scaled up with hard edges. Ships, islands
and waves are built from blocks and flat-shaded low-poly shapes, which gives the pixel look.

## Play

ES modules need to be served over HTTP (not opened as `file://`):

```sh
npm start            # serves on http://localhost:8080
# or: python3 -m http.server 8080
```

Three.js is vendored in `vendor/`, so there is no build step. The site can be hosted as-is
on GitHub Pages, Netlify, etc.

### Controls

| Action                 | Keyboard              | Touch           |
|------------------------|-----------------------|-----------------|
| Steer                  | `A` `D` / `←` `→`     | ◀ ▶ (hold)      |
| Raise / lower sails    | `W` `S` / `↑` `↓`     | `+` `−`         |
| Fire left (port)       | `Q`                   | ↖FIRE           |
| Fire right (starboard) | `E`                   | FIRE↗           |
| Fire both sides        | `Space`               |                 |
| Pause                  | `P` / `Esc`           | `II` button     |

Cannons fire **sideways**, so turn your side toward the enemy. Your gunners automatically
aim at the nearest ship on that side and lead it, within a small swivel arc. Each side
reloads separately. Your hull slowly repairs itself when you haven't been hit for a few seconds.

### Levels

1. Calm Waters: 2 sloops
2. Smugglers' Cove: 2 sloops and a brig
3. The Blockade: 2 brigs and 2 sloops
4. Storm Fleet: 3 brigs and a sloop
5. Blackbeard's Galleon: the boss and 2 escorts

At most two pirates attack at once. The others circle just out of range until a slot opens.
If you're sunk you can retry the level; your gold goes back to what you had when it started.

## Code

- `src/main.js`: game loop, physics, AI, combat, levels, HUD and input
- `src/models.js`: blocky ship, island and health-bar models
- `index.html` / `style.css`: overlays, HUD and touch controls

## Tests

`tests/smoke.cjs` serves the game and drives it in headless Chromium with Playwright. It checks:

- the low-resolution pixel rendering and the HUD
- sails, steering and both broadsides, including reloading
- hits at different ranges, sinking ships, loot drops and collecting gold
- clearing levels, game over and retrying, and winning the game
- that the best score is saved and that no ship spawns inside an island
- that the enemy AI shoots back, plus the touch controls on a phone-sized screen
- a bot captain playing all five levels with simulated controls, to show every level can be won

```sh
npm install
npm test
```

Screenshots from the run are written to `tests/screenshots/`.
