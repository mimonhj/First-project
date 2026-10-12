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
| 3 ★★★ | **The Volcano**: open sea under an erupting volcano | Ember Corsairs and a Man-o'-War, then **The Molten Maw** | Lava bombs rain down on a marked target circle and hurt any ship caught there |

Each level comes in two waves. When reinforcements arrive, your crew patches part of the hull.
Clearing a level unlocks the next one on the title screen.

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
| Fire left (port)       | `Q`                   | ↖ Fire          |
| Fire right (starboard) | `E`                   | Fire ↗          |
| Fire both sides        | `Space`               |                 |
| Pause                  | `P` / `Esc`           | `II` button     |

Cannons fire **sideways**, so turn your side toward the enemy. Your gunners automatically aim at
the nearest ship on that side and lead it. Each side reloads separately, and the hull slowly repairs
when you haven't been hit for a few seconds.

## Code

- `src/main.js`: game loop, levels and waves, combat, AI, hazards, HUD and input
- `src/scenery.js`: renderer with the cartoon outline effect, sky, ocean shader, clouds and lights
- `src/ships.js`: the cartoon ship models
- `src/shipTypes.js`: ship stats and dimensions
- `src/env/europe.js`, `src/env/bali.js`, `src/env/volcano.js`: the three level environments
- `src/style.js`: shared cel-shading materials, outline settings and palette fields

## Tests

`tests/smoke.cjs` serves the game and drives it in headless Chromium with Playwright. It checks:

- rendering, the level-select screen, sails, steering and broadsides
- hits at different ranges, loot, waves and hull repair
- reefs, lava bombs, the boss and its health bar
- level unlocking, game over, retrying and winning
- that every level spawns ships in open water and keeps draw calls reasonable
- the touch controls
- a bot captain playing all three levels with simulated controls, to show every level can be won

```sh
npm install
npm test
```

Screenshots from the run are written to `tests/screenshots/`.
