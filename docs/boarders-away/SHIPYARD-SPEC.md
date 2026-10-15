# Pirates Ahoy! — Shipyard & Sparrow's Floating Island: build contract

Repo: /home/user/First-project (branch claude/3d-website-game-9b0d9q). Plain ES modules, no build step,
three.js r170 vendored (`import * as THREE from 'three'`, addons via `three/addons/...`). Never edit `vendor/`,
never add npm dependencies, never commit or push (the coordinator does that).

## What the player asked for (verbatim intent)
1. Customise the ship: add cannons, buy upgrades with coins (gold).
2. After a level, a choice NOT to continue: go to the dock to customise the ship, or exit to the menu.
3. While customising, the ship is shown DOCKED, with PIRATES CLEANING IT (visibly animated: mopping, scrubbing).
4. The dock is a pirate town on the water called **Sparrow's Floating Island**; PEOPLE are visible in the background.

## Look & feel (must match the existing game)
Cartoon, cel-shaded (MeshToonMaterial via `toon()` from `src/style.js`), bold ink outlines (the outline pass in
scenery.js; per-material control via `toon(color, {outline: ...})`, `noOutline()`), rounded smooth-normal geometry
(spheres, capsules, lathes, cylinders, RoundedBoxGeometry), saturated "animated movie" colours, chunky proportions.
Study `src/env/europe.js`, `src/env/bali.js` (module structure, palette, mergeStatic of static geometry, update/dispose)
and `src/ships.js` (helpers: add, rod, spar, rbox, cyl, lathe, flagMesh, lantern, barrel, seagull ...) and reuse their
idioms. Static geometry must be merged (`mergeStatic`) to keep draw calls low.

## Scale
Ships: origin at waterline, bow +z, deck y ≈ 1.2, rail top ≈ 1.82. The player ship is len 10, wid 3.6.
People: about **1.25 units tall** at scale 1 (cartoon: big head, short body) so the ship rail is at their waist.

---------------------------------------------------------------------------------------------------
## Module A — `src/people.js` (new)
```js
export function buildPerson(opts = {}) // -> THREE.Group, origin at the feet, facing +z, ~1.25 tall at scale 1
//   opts: { seed?: number, kind?: 'pirate'|'man'|'woman'|'kid'|'old',
//           skin?, shirt?, pants?, accent? (hex colours; random from seed when omitted),
//           hat?: 'tricorn'|'bandana'|'cap'|'straw'|'kerchief'|'none',
//           beard?: boolean, eyepatch?: boolean, pegLeg?: boolean,
//           tool?: 'mop'|'brush'|'bucket'|'crate'|'rod'|'fiddle'|'hammer'|'lantern'|'none',
//           scale?: number }
export const ACTIONS // ['idle','walk','mop','scrub','wave','carry','fish','sit','cheer','hammer','fiddle','lean']
export function animatePerson(person, t, action, opts = {}) // opts: { phase?: number, speed?: number }
//   Poses the rig for time t (seconds). Deterministic, cheap (transform-only). 'walk' animates in place
//   (the caller moves the group). 'mop' = two-handed mop pushed back and forth on the deck with a body sway;
//   'scrub' = kneeling/crouched, brush arm scrubbing in small circles; 'wave' = arm waving overhead; 'fish' =
//   seated with rod and occasional twitch; 'sit' = seated idle; 'carry' = walking with crate held up;
//   'cheer' = both arms up bouncing; 'hammer' = hammering; 'fiddle' = playing the fiddle; 'lean' = leaning on rail.
export function disposePerson(person)
```
- Rig: group.userData.parts = { hips, torso, head, armL, armR, legL, legR, tool } (Object3D pivots).
- Budget: **≤ 16 meshes per person** (merge rigid sub-parts per pivot and material). Share materials via `toon()`.
- Faces: friendly cartoon faces (big white eyes with pupils, nose, beard/moustache options), hats, sashes,
  striped shirts, boots. Pirates read as pirates (bandana/tricorn, eyepatch, beard, sash); townsfolk read as
  townsfolk (aprons, dresses/skirts, caps, straw hats), kids smaller (~0.8 scale).
- A tool held in the hands (mop with shaggy head, scrubbing brush, wooden bucket with water, crate, fishing rod...).

## Module C — `src/upgrades.js` (new) + `src/ships.js` (extend)
### upgrades.js (pure data + logic, no THREE import)
```js
export const UPGRADES = [ // order = display order
  { id: 'guns',      name: 'Extra cannons',     blurb: ..., stat: 'Guns per side',   values: [3, 4, 5],              costs: [300, 700] },
  { id: 'shot',      name: 'Heavy shot',        blurb: ..., stat: 'Damage per ball', values: [10, 12, 14, 16],       costs: [150, 350, 650] },
  { id: 'crew',      name: 'Gun crew drills',   blurb: ..., stat: 'Reload',          values: [1.5, 1.35, 1.2, 1.05], costs: [150, 350, 650] }, // seconds
  { id: 'hull',      name: 'Iron-banded hull',  blurb: ..., stat: 'Hull strength',   values: [120, 140, 165, 195],   costs: [120, 300, 600] },
  { id: 'sails',     name: 'Racing sails',      blurb: ..., stat: 'Top speed',       values: [12, 13, 14],           costs: [150, 400] },
  //   sails tiers also raise accel 4 -> 4.5 -> 5 and turn 1.4 -> 1.5 -> 1.6
  { id: 'carpenter', name: "Ship's carpenter",  blurb: ..., stat: 'Repairs',         values: [2, 3, 4.5],            costs: [100, 300] },
  //   carpenter = hull regen hp/s; also regen delay 5 -> 4 -> 3 s
];
export const LOOKS = {
  hull:  [ { id: 'honey', name: 'Honey & Teal' (default), colors: {...} }, 'royal' Royal Blue & Gold, 'crimson' Crimson & Black,
           'emerald' Emerald & Cream, 'plum' Plum & Silver, 'driftwood' Driftwood & Sea Green ],
  sails: [ 'cream' (default), 'snow', 'crimson', 'midnight', 'sunset', 'sky' ],
  flag:  [ 'pennant' blue pennant (default), 'scarlet' red pennant, 'gold' gold pennant, 'jolly' black Jolly Roger flag ],
};  // each entry: { id, name, swatch: [hex, ...] (for the UI), ...colour fields ships.js needs }
export function defaultShipConfig() // { up: {guns:0, shot:0, crew:0, hull:0, sails:0, carpenter:0}, look: {hull:'honey', sails:'cream', flag:'pennant'} }
export function parseShipConfig(raw) // raw string|null from storage -> a VALID config. Never throws. Unknown/invalid
//   fields fall back field-by-field to defaults (tiers: integers clamped to [0, maxTier]; looks: known ids only).
//   Reject non-plain-integer tiers like the game's loadInt does (no '1e1', '2.5', 'Infinity', NaN...).
export function serializeShipConfig(config) // -> JSON string
export function maxTier(id), nextCost(config, id) // nextCost -> number, or null when maxed
export function playerType(baseType, config) // -> NEW object: {...baseType, hp, maxSpeed, accel, turn, reload, guns, dmg, regen, regenDelay}
export function statText(id, tier) // short UI text, e.g. "3 guns", "1.35 s", "140 hp"
```
### ships.js
`buildShip(typeKey, opts = {})` stays backward compatible (`buildShip('cutter')` unchanged). For `'player'`:
- `opts.type` (from playerType) replaces SHIP_TYPES.player for gun count/placement (gunOffset uses it).
- `opts.look` = config.look → hull paint (bands/wall/rim/crest/accents), sail cloth colour, flag/pennant.
- `opts.upgrades` = config.up → VISIBLE upgrades, each tier visibly different:
  guns (more gun ports/barrels), shot (bigger brass/bronze barrels, shot pyramids), crew (powder kegs, rammer rack),
  hull (iron bands / rivets / armoured bow), sails (extra sail and/or trim on sails), carpenter (toolbox, spare planks,
  patched planks). Keep the stern view (what the chase cam sees all game) readable; never block the chase cam.
- Must set `group.userData.deckSpots` = array of ≥ 5 `{x, y, z, h}` free deck standing spots (ship-local; y = deck
  height; h = facing yaw) that stay clear of masts, cabin, barrels and every upgrade prop for ALL upgrade combos, and
  `group.userData.hullSpots` = ≥ 2 `{x, y, z, side}` points on the hull sides just above the waterline (for a scrubber).
- The player's cloth materials remain cloned per ship (main.js fades the player's sails for the chase cam).

## Module B — `src/env/sparrow.js` (new): Sparrow's Floating Island
An environment module like europe.js:
```js
export const meta = { name: "Sparrow's Floating Island", place: "Sparrow's Floating Island", subtitle: '...' };
export const palette = { ...warm golden-afternoon or bright tropical palette, same keys as DEFAULT_PALETTE };
export function build(scene, ctx = {}) // -> {
//   worldRadius, colliders: [{x, z, r, h?}], playerStart: {x, z, h}, enemySpawns: [], reefs: [],
//   berth: {x, z, h},            // pose of the docked ship (same as playerStart)
//   view: { target: [x, y, z], yaw, yawRange, dist, height },
//        // showcase camera: position = target + (sin(a)*dist, height, cos(a)*dist) for a in [yaw-yawRange, yaw+yawRange],
//        // looking at target; the TOWN must be BEHIND the ship from every allowed angle; the ship fills a good part of view.
//   setShip(mesh | null),        // attach the cleaning crew as CHILDREN of the docked ship mesh (so they bob with it),
//                                // using mesh.userData.deckSpots / hullSpots; call again after the ship is rebuilt.
//   peopleCount,                 // number of people in the scene (crew + townsfolk), for tests
//   update(t, dt), dispose(), group }
```
Content: a pirate town built ON THE WATER — rafts and platforms on barrels/pontoons lashed together, stilt shacks
with patched colourful roofs, rope bridges, a tavern ("The Salty Sparrow"), a tall lookout tower with a SPARROW
weathervane, a big welcome sign with a sparrow emblem, market stalls, a shipyard crane hoisting a cannon, laundry
lines, bunting, lanterns, nets, crates, barrels, small boats; a palm or two on a sandy floating garden. A wooden
pier/berth where the player's ship is moored (bollards, mooring ropes, gangplank). Optionally one or two other
moored ships (buildShip('cutter' | 'privateer') from ships.js) for life.
People: **≥ 5 crew cleaning the docked ship** (≥ 2 mopping the deck, 1 scrubbing the hull from a hanging plank or
bosun's chair, 1 in a rowboat scrubbing the waterline, 1 polishing a cannon or carrying a bucket) with soap bubbles,
and **≥ 15 townsfolk in the background** (walking the boardwalks along paths, waving, fishing off the pier, a fiddler,
kids running, a vendor, someone hammering, someone leaning on a rail). People must be visible in the showcase view.
Ambient life: gulls, flags/bunting fluttering, lanterns glowing, bubbles. Draw-call budget for the dock scene
(including the player ship): renderer.info.render.calls ≤ ~450 at quality level 0.

## Module D — integration: `src/main.js`, `index.html`, `style.css`
### Economy & persistence
- **Treasure chest (purse)**: persistent gold you spend at the shipyard. Key `pirates-ahoy-purse`, loaded with the
  existing `loadInt(key, 0, MAX_GOLD, 0)` validation. When a level is CLEARED, that level's earnings
  (`state.gold - state.goldAtLevelStart`, incl. level bonus) are banked into the purse (and saved). Gold collected in
  an attempt you lose is not banked (as today, retry restores the voyage gold).
- Voyage plunder (`state.gold`, HUD "Gold", best score) keeps its meaning and is NOT reduced by spending.
- **Ship config**: key `pirates-ahoy-ship`, via `parseShipConfig` / `serializeShipConfig`. Storage blocked → defaults,
  never throws (follow the existing try/catch patterns).
- The player ship uses `playerType(SHIP_TYPES.player, config)` for all gameplay stats (guns, dmg, reload, hp,
  speed/accel/turn, regen, regenDelay — replace the REGEN_RATE/REGEN_DELAY uses for the player with the type's
  values) and `buildShip('player', {type, look, upgrades})` for the model (also on the title screen ship).
### Flow
- Level-cleared screen buttons: **"Sail to <next>"** (primary, Enter, keep id `next-btn`), **"Visit Sparrow's
  Floating Island"** (opens the dock; id `dock-btn`), **"Main menu"** (exit; id `exit-btn`). Summary says how much
  gold was banked and the chest total. Exiting mid-voyage keeps progress, updates the best score like game over does.
- Shipwrecked screen: add "Visit the dock" (`over-dock-btn`) between Try again and Main menu; leaving the dock goes
  back to retrying that level.
- Victory screen: add "Visit the dock" (`won-dock-btn`).
- Title screen: add a secondary button **"Shipyard"** / "Sparrow's Floating Island" (`menu-dock-btn`) next to Set sail.
- Dock exits depend on where you came from: from level cleared → "Set sail for <next level>" + "Main menu";
  from shipwrecked → "Try again: <level>" + "Main menu"; from title/victory → "Back to the title".
- New `state.mode = 'dock'`. In dock mode: no HUD/minimap/touch pads; P/Escape do nothing; Enter with no focused
  control does nothing; a WebGL context loss shows the recovery dialog (not playing → no Continue needed).
### Dock view
- Load the sparrow environment (palette via applyPalette like loadEnvironment; foam from colliders), place the
  player ship at `env.berth` with gentle bobbing (like the title screen ship), call `env.setShip(mesh)`.
- Camera: showcase orbit from `env.view`: slow auto-sway across the allowed yaw range; the player can DRAG on the
  3D view (mouse or touch) to rotate within the range. Frame the ship in the free space beside the panel with
  `camera.setViewOffset` like the title screen does; on narrow portrait screens the panel is a bottom sheet and the
  ship is framed above it. Clear the view offset when leaving.
- Buying an upgrade or changing paint rebuilds the ship mesh (dispose the old one) and re-attaches the crew.
### Dock UI (HTML overlay, parchment `.panel` style, `id="dock-screen"`)
- Title "Sparrow's Floating Island", subtitle "Shipyard", chest total ("Treasure chest: 340 gold", aria-live).
- Tabs or segmented control: **Upgrades** | **Paint**.
- Upgrade rows: name, blurb, tier pips, "now → next" stat text, Buy button with cost; disabled with a reason when
  maxed ("Fully upgraded") or too poor ("Need 120 more gold"). Buying: deduct, save, rebuild ship, coin sound,
  announce via a polite live region, little celebratory crew reaction (e.g. a 'cheer' for a second) is a plus.
- Paint: swatch buttons for Hull / Sails / Flag (free), `aria-pressed` on the chosen one, with names.
- Footer: the exit buttons above. Keyboard and screen-reader usable, focus lands on the first sensible control,
  visible focus rings, contrast ≥ 4.5:1 for small text (use the --*-text tokens), touch targets ≥ 44px, works at
  320×480, 360×640, 390×844, 844×390, 568×320, 1024×600, 1280×720 without page scroll (the panel scrolls inside).
- Don't regress any earlier fix (F01–F10): modal/inert/focus code, touch activation (data-tap/pointerType logic),
  storage validation, contrast, context-loss recovery.
### Test API additions (`window.__game`)
`dock: { open(from), leave(), buy(id), paint(part, id) }`, `get shipConfig()`, and `state.purse`.

## Testing harness facts
- Browser tests: `NODE_PATH=/opt/node22/lib/node_modules`, `require('playwright')` → chromium with args
  `['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']`; serve files with
  `require('/home/user/First-project/tests/server.cjs').serve(root)` (127.0.0.1, random port). SwiftShader is slow:
  frames can take seconds; use `timeout: 120000` on screenshots/waits; load the game with `?quality=low` for speed
  except when judging visuals. `window.__gameReady === true` once the game started.
- You can LOOK at your screenshots with the Read tool (PNG). Use that to judge and iterate on visuals.
- Put scratch files (harness pages, screenshots) under
  /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/dock/<your-module>/.
  A standalone harness page must live INSIDE the served root to import the modules: create it as
  `/home/user/First-project/.dock-harness/<name>.html` (gitignored scratch; the coordinator deletes it) and
  import e.g. `../src/people.js` with the same importmap as index.html.
- Full suite: `cd /home/user/First-project && NODE_PATH=/opt/node22/lib/node_modules npm test` (≈10 min) must stay green.
