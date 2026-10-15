# Pirates Ahoy! — "Boarders Away!" update: FINAL build spec (SPEC2)

Repo `/home/user/First-project` (branch `claude/3d-website-game-9b0d9q`). Plain ES modules, no build step, three.js r170
vendored (`import * as THREE from 'three'`, addons via `three/addons/...`). **Never edit `vendor/`, never add npm
dependencies, never commit or push** (the coordinator does). Harness pages go in `/home/user/First-project/.dock-harness/`
(git-ignored); screenshots and scratch files go in the session scratchpad. The previous contract (shipyard, Sparrow's
Floating Island) is `scratchpad/dock/SPEC.md`; everything it guarantees still holds unless this file changes it.

Base design: `design-arcade.md`, with grafts from `design-depth.md` and `design-spectacle.md` as the three judges
recommended. Every conflict between them is resolved here; **where this file and a design disagree, this file wins.**
Numbers are starting values: each lives in exactly one table in one module (named in §9), so balance changes touch
one place.

---------------------------------------------------------------------------------------------------

## 0. Read this first

### 0.1 Conventions every agent must follow

- Ships: heading `h`, forward `(sin h, cos h)`, starboard/right `(-cos h, sin h)` (main.js `fwdX/fwdZ/rightX/rightZ`).
  `relative(ship, x, z)` → `{ along, lat, dist }`; `lat > 0` is starboard. Gameplay "side" is **+1 = starboard, −1 = port**
  everywhere (as in `fire(ship, side)`).
- Ship models (ships.js) are built bow → +z, origin at the waterline. With `mesh.rotation.y = h`, **ship-local +x is PORT
  and −x is STARBOARD** (same as people.js: a figure facing +z has its left at +x). Any API taking a gameplay `side`
  converts with `localX = −side × halfWidth`.
- Simulation is deterministic and runs only in `step(dt)` (1/120 s substeps). Anything that changes gameplay
  (positions of moving obstacles, timers, boarding phases) advances in **simulated** time, never in `frame()`. Visual-only
  animation uses visual time `t`.
- Random numbers that decide gameplay outcomes on hits (crits) come from the seedable `combatRng` (`mulberry32`), so
  tests can pin them. Existing uses of `Math.random` (aim spread, particles) stay.
- Cel-shaded cartoon look: `toon()` materials, ink outlines from the outline pass, `noOutline()` for flat/emissive/UI-ish
  meshes. **InstancedMesh is not outlined correctly by the outline pass** (it ignores `instanceMatrix`): instanced
  meshes either use `noOutline()` (flat UI pips, decals, particles) or the inverted-hull ink twin used for the smoke in
  `src/env/volcano.js` (§ "Smoke, steam and the ash plume").
- People (people.js) cost about **5 draw calls each** (3 material groups + 2 outline passes). Ships cost roughly 2× their
  mesh count. Draw calls are measured as `__game.renderInfo.calls` after two animation frames at `?quality=low`,
  1280×720, SwiftShader (both outline passes are counted).
- **people.js determinism rule:** every existing `buildPerson(opts)` call must produce exactly the same look as today.
  New options must not consume extra `rng()` draws unless the new option is given; new random picks go at the end of
  `resolveLook`.
- Pure modules (`combat.js`, `armory.js`, `cosmetics.js`, `walk.js`, `mechanics.js`, `shipTypes.js`, `upgrades.js`) import
  **nothing**, so Node tests load them as `data:` URLs exactly like `tests/upgrades.test.cjs` does.
- Every saved record is validated like `parseShipConfig`: never throws, field by field, plain integers only, size cap,
  own properties only, `__proto__`-safe, and a record that needed fixing is rewritten.
- Accessibility floor for everything new: real `<button>`s, visible focus ring, ≥ 44×44 CSS px touch targets, small text
  ≥ 4.5:1 (use `--sea-text`, `--teal-text`, `--gold-text`, `--red-text` on `--paper`), state never shown by colour alone,
  `prefers-reduced-motion` respected, mashing never required.

### 0.2 What already exists and is relied on (verified in the code)

main.js: `LEVELS` (3 levels), `fire(ship, side, target, {spread, lead, rangeErr})`, `playerFire(side)`,
`inArc(ship, e, side)`, `hitsShip(b, s)`, `updateBalls`, `damage(ship, amount, x, z, source)` (tests call
`damage(e, 9999)`), `volleys`/`volleyDone` (HIT!/SUNK! marker), `updateEnemy(e, dt, attacking)` (attackers beyond
`engage + 8` sail straight at the player), `moveShip`, `separateShips` (push radius `(len_a + len_b) × 0.36`),
`resolveLand`, `speedCap`, `steerToward`, `syncShip` (floating tags via `buildTag/setTag`), `step(dt)`, `updateHud`,
`drawMinimap`, bombs (`launchBomb/updateBombs`, lava only), `finishLevel`, `openDock(from)`, `DOCK_EXITS`, `dock`
state, `buildDockPanel/renderDock`, `dockFraming`, `updateDockCamera`, `openModal/closeModal/activeModal` (the inert
`backdrops` list is built **once at load** from `#hud` and every `.overlay:not(.error)`), `TAP_ACTIONS` + `[data-tap]`
semantics, `[data-hold]` steering, `loadInt/saveNumber/loadShipConfig`, `window.__game`. Keys today: A/D/←/→ steer,
W/S/↑/↓ sails, Q/J port, E/L starboard, Space both (and start from the menu), P/Esc pause, M mute, Enter context; in the
dock P/Esc/Enter/Space do nothing and A/D/←/→ (focus outside the panel) turn the view.

Measured draw calls today (`?quality=low`, 1280×720): title 247–262, L1 302–309, L2 225–234, L3 174–185, dock 298–300.

---------------------------------------------------------------------------------------------------

## 1. Scope

| User ask | What ships |
|---|---|
| "reeling enemy ship close so your crew can jump over and kill some of the enemy ship's crew relative to the health bar" | **Grapple → reel → swing → brawl → result**, a ~5 s set-piece (key **G**, touch **Board** button). Every ship has a crew shown as **10 crew pips directly under its hull bar**, with a **surrender notch**. "Relative to the health bar" is honoured three ways: (1) hull damage thins the crew (up to half), so the pips fall with the bar; (2) the lower her hull, the more of her crew your boarders beat (morale term `M`); (3) every sailor beaten in a brawl also takes 2 off her hull bar. Odds and expected losses are shown **before** you commit. Beat her crew down to the notch and she is **captured** for more than twice the gold of sinking her. |
| "more differences to relative caused damage to the enemy ship" | **Stern rake ×2.0 / bow rake ×1.5** (gold RAKE! cue before you fire), **range fall-off** (×1.25 point blank → ×0.75 at max range), **crits** (×1.75) with effects by hit zone and ammo (RUDDER SMASHED / MAST DOWN / POWDER KEG / CREW ROUTED), **three ammo types** (Round, Chain, Grape; unlocked by progress), **visible damage** (holes where balls land, smoke, fire, a list, a drooping or dropped sail, struck colours, sailors tumbling overboard) and DOM pop words (`RAKE ×2!`, `−3 CREW`, `CRIT! MAST DOWN!`). |
| "more complex levels with new game mechanics" | **Act II: The Far Seas.** Beating the Molten Maw still shows Victory, now with **Sail on to the Far Seas**. Three new levels, one new twist each, built on the new systems: **4 Doubloon Bay** (golden hour; treasure galleons flee for the open sea — catch and capture them), **5 Frostbite Straits** (pastel arctic dawn; drifting ice floes; longship raiders board **you**), **6 The Maelstrom** (stormy night; a whirlpool drags every ship in; the Phantom Galleon cannot be sunk while her ghost crew stands — grape and board her). Labels Tricky / Tough / Legendary. |
| "make the dock also the town where you can walk as pirate captain and change cosmetics of your crew and yourself" | The dock still opens on the shipyard (every existing shipyard test stays valid). A **Go ashore** button switches to a third-person walk round Sparrow's Floating Island (keys, joystick, tap-to-walk, an always-visible **places bar**, a **Harbour menu**). Places: **Shipyard**, **Polly's Plumes & Trims** (tailor & barber: try on before you buy, Surprise me!, crew line-up, Match the ship's paint), **The Salty Sparrow** tavern (crew upgrades, rumour board, captain's log), and your ship (**All aboard?**). Your look shows on the walking captain, at the helm in every battle, in every boarding party and on the cleaning crew at the dock. |

**Never cut** (the minimum this update ships): grapple → reel → swing → brawl → result with the crew pips under the hull
bar and the odds preview; capture worth more than sinking; stern/bow rakes with the RAKE! cue; range fall-off; ammo
Round + Grape; Doubloon Bay; Go ashore + walking + the tailor with captain and crew outfits shown at the helm, in
boarding parties and on the dock crew.

**Explicitly out** (rejected by the judges): depth's crew economy across the voyage, crew-slows-reload, objectives
that fail a level, "Taken!" game over, medals, armour, static fort entity, fire shot, status-icon zoo, instanced chibi
crowd; spectacle's real-time reel under fire, waterline/leak hits, boarding without odds, wraith shimmer, mend timer,
enemy deck crews, Powder Locker. Enemy boarding never ends the run.

---------------------------------------------------------------------------------------------------

## 2. Combat: where and how you hit

All rules and numbers below live in **`src/combat.js`** (pure). main.js applies them.

### 2.1 The shot pipeline

Each ball stores at launch: `ammo` (`'round' | 'chain' | 'grape'`), muzzle `ox, oz`, `dmg` (shooter's `type.dmg`),
`owner`, `src`, `volley` (as today). When `hitsShip(b, s)` is true, main calls

```
info = shotResult({ ammo, base: b.dmg, dist: hypot(b.x − b.ox, b.z − b.oz), vx: b.vx, vz: b.vz,
                    target: { h: s.h, len: s.type.len, ghost: isGhostActive(s), boss: !!s.type.boss },
                    along: relative(s, b.x, b.z).along,
                    shooter: b.owner === 'player' ? { player: true, critBase } : { player: false, enemyRake: def.enemyRake },
                    rng: combatRng, force: forcedCrit })
damage(s, info.dmg, b.x, b.z, b.src, info)
```

```
dmg = base × AMMO[ammo].hull × rangeMul(dist) × aspectMul × critMul × ghostMul      (not rounded; pops show Math.round)
```

| Factor | Rule |
|---|---|
| `rangeMul(d)` | `d ≤ 10` → **1.25** ("POINT BLANK!"); `10 < d < 14` → `1.25 − 0.25 × (d − 10)/4`; `14 ≤ d ≤ 24` → 1.0; `24 < d < 34` → `1 − 0.25 × (d − 24)/10`; `d ≥ 34` → **0.75**. Values: d 12 → 1.125, 26 → 0.95, 29 → 0.875, 30 → 0.85, 32 → 0.80. Applies to both sides' shots. |
| aspect | `c = (vx·sin h_t + vz·cos h_t) / hypot(vx, vz)`. **Rake** when `\|c\| ≥ 0.8` (within 36.9° of her keel). `c > 0` (ball travels the way she faces: entered at her **stern**) → `raw = 2.0` "STERN RAKE ×2!"; `c < 0` → **bow** `raw = 1.5` "BOW RAKE ×1.5!"; else `raw = 1.0`. Player shots: `aspectMul = raw`. Enemy shots: `aspectMul = 1 + (raw − 1) × def.enemyRake` (enemyRake per level: 0.4, 0.6, 0.8, 1, 1, 1). |
| crit | **Player shots only** (enemies never crit). `p = critBase + (stern rake ? 0.12 : 0) + (bow rake ? 0.06 : 0) + (d ≤ 10 ? 0.05 : 0)`, capped at **0.35**; `critBase` = Master gunner tier 0..3 → **0.06 / 0.09 / 0.12 / 0.15**. Roll `combatRng() < p`, unless `force` is set (tests). Crit → `critMul = 1.75` plus an effect (§2.3). |
| ghost | The Phantom while her ghost crew stands: round and chain `×0.5`, grape `×1.0` (§6.6). Otherwise 1. |

`shotResult` returns `{ dmg, rangeMul, aspect: 'stern'|'bow'|null, aspectMul, pointBlank, crit, critEffect: 'rudder'|'mast'|'keg'|'routed'|null,
zone: 'bow'|'mid'|'stern', crewKill, slow: bool, tags: [..] }`. Hit zone from `along`: `> len/6` bow, `< −len/6` stern, else mid.

**Worked example (player, stock: dmg 10, 3 guns, round shot, no Master gunner):**
- On her beam at 18 u: `10 × 1 × 1.0 × 1.0 = 10`. At 30 u: `10 × 0.85 = 8.5`.
- Stern rake at 18 u: `20`. Bow rake at 12 u: `10 × 1.125 × 1.5 = 16.875` (pop "17").
- Stern rake at 8 u: `10 × 1.25 × 2 = 25`; crit chance `0.06 + 0.12 + 0.05 = 0.23`; with the crit `25 × 1.75 = 43.75` (pop "44").
- A whole 3-gun broadside: long range on the beam `3 × 8.5 = 25.5`; point-blank stern rake with one crit
  `25 + 25 + 43.75 = 93.75` — **3.7× apart**. With Master gunner tier 3 the same shot crits at 0.32.
- Enemy privateer (dmg 5) raking your stern at 20 u: L1 `5 × 1.4 = 7`, L5 `5 × 2.0 = 10`; bow rake on L1 `5 × 1.2 = 6`.

### 2.2 Ammo (player only; enemies always fire round shot)

| Ammo | Unlocked when | Hull × | Crew per hit | Extra | Range | Reload × | Spread × | Hit pad / top |
|---|---|---|---|---|---|---|---|---|
| **Round** (default) | always | 1.0 | 0 | — | 34 | 1.0 | 1.0 | 0.3 / 3.8 (today) |
| **Chain** | `state.unlocked ≥ 2` | 0.4 | 0 | **slow**: her speed cap ×0.55 and turn ×0.7 for 6 s per hit (refreshes, max 10 s); cloth-confetti particles | 26 | 1.15 | 1.2 | 0.8 / 9.0 (hits sails) |
| **Grape** | `state.unlocked ≥ 3` | 0.3 | **1** (+1 on a rake) | dark "hat" puffs; may throw a sailor overboard (§2.4) | 20 | 0.85 | 2.5 | 0.6 / 3.8 |

- One projectile per gun for every ammo (so "port broadside fires N balls" stays true). Meshes from
  `ships.projectileMesh(ammo)`: round = today's ball; chain = two half-balls on a bar, spinning; grape = a cluster of
  6 small balls (one merged geometry).
- `fire()` clamps the flight to `AMMO[ammo].range / BALL_SPEED`; `inArc(ship, e, side, range = MAX_RANGE)` gets the
  range; the FIRE! lights use the loaded ammo's range. Reload set by a shot = `type.reload × AMMO.reloadMul`, stored in
  `ship.reloadMax[side]` (the HUD reload bars divide by it).
- Switching: **R** cycles (skipping locked ammo), **1 / 2 / 3** pick (matched on `e.code` `Digit1..3` / `Numpad1..3`),
  touch **Ammo** pill cycles. On a switch each side's reload becomes `max(current, 0.5)`. Ammo is per session, reset to
  Round at every `startLevel`. Picking a locked ammo shows why in the hint bubble: "Chain shot unlocks after the Coast of
  Europe" / "Grape shot unlocks after the Bali Islands". The first time each unlocks: banner "New ammo: Chain shot!
  Press 2" (tips bits 2 and 4, §5.5).

### 2.3 Crits and their effects

| Ammo of the critting ball | Effect (pop text) | What it does |
|---|---|---|
| round, zone **stern** | **RUDDER SMASHED!** | her turn rate ×0.25 for 6 s |
| round, zone **mid** | **MAST DOWN!** | her speed cap ×0.5 for 8 s; `setShipDamage(mesh, { mast: true })` drops her top sail for the duration |
| round, zone **bow** | **POWDER KEG!** | +12 damage at once (×ghostMul), then burns 2 hp/s for 4 s (1 hp every 0.5 s, source `'fire'`, no pops per tick) |
| chain (any zone) | **MAST DOWN!** | as above |
| grape (any zone) | **CREW ROUTED!** | +2 crew killed |

Every crit is ×1.75 damage. At most one new effect per target per **3 s** (a crit inside the gap still does ×1.75 and
pops CRIT!). Bosses take effects for half the duration. Speed and turn effects don't add up: a ship uses the **smallest
active multiplier** for speed (`chain 0.55`, `mast 0.5`) and for turning (`chain 0.7`, `rudder 0.25`) on top of `speedCap()`.

### 2.4 Visible damage (every ship, never reverts except as noted)

| Trigger | Look | Owner |
|---|---|---|
| any hull hit | a **hole** at the impact: `ships.addHole(mesh, { z: along, y, side })` (dark scorched disc with splinter tips, flat, `noOutline`, one per-ship InstancedMesh of ≤ 8, oldest reused; side from `lat` sign; y = clamp(impact y, 0.5, deckY − 0.2)) | ships.js API, main calls |
| hp < 60 % ("battered") | grey smoke wisps from the oldest hole, 3 puffs/s (ambient particles); list 0.04 rad toward the side with more hits | main (`emitShipFx`, `syncShip`) |
| hp < 30 % ("wrecked") | `setShipDamage(mesh, { level: 2 })`: deck flame fx + one drooping sail; dark smoke 5 puffs/s; list 0.09 rad; sits 0.15 lower; her tag's hull bar pulses | ships.js + main |
| grape kills crew | **a sailor tumbles overboard** with a splash (`overboard.throwOver(ship, side, enemyCrewOpts(type, seed))`), at most one per volley per ship | overboard.js, main calls |
| surrender | white flag up (`hoistFlag(mesh, 'white')`), tag icon = white flag; **two of her sailors stand on deck with their hands up** (`overboard.showSurrender(ship, opts)`, from the same pool, removed on capture) | ships.js + overboard.js + main |
| capture | her flags come down, **your flag goes up** (`hoistFlag(mesh, 'player', LOOKS.flag entry)`) | ships.js + main |
| player hull back to full (regen) | `clearHoles(player.mesh)` | main |

### 2.5 Feedback

| Event | DOM pop at the impact (`pops.pop`) | Extra |
|---|---|---|
| a volley hits a target | the **summed** damage of that volley on that target, once, when the volley ends (style `dmg`) | splinters as today |
| rake | `STERN RAKE ×2!` / `BOW RAKE ×1.5!` (gold, once per volley per target) | double splinter burst; camera kick `shake = max(shake, 0.15)` (not under reduced motion); sfx `rake` |
| crit | `CRIT!` + the effect line (style `crit`, 1.3× size) | star-burst of glow particles; **hit-stop**: frame dt ×0.1 for 0.07 s real time, at most once per 0.5 s, not under reduced motion; sfx `crit` |
| point blank | `POINT BLANK!` (small white) | — |
| chain hit | `SAILS SHREDDED!` (once per volley per target) | cloth confetti |
| crew killed by shot | `−N CREW` summed per volley (style `crew`) | — |
| capture | `CAPTURED! +145` (big green-gold) | coin fountain on your deck, flag swap, sfx `capture` + `cheer` |
| iceberg/floe crunch | `CRUNCH!` | sfx `crunch` |

The side hitmark keeps its main text `HIT!` / `HIT ×N` / `SUNK!` (the smoke test's `/HIT|SUNK/` holds) followed by
stickers in `<span class="hm-tags">`: `RAKE ×2`, `CRIT!`, `POINT BLANK`, `CAPTURED!`. Pops throttle: ≤ 12 alive, ≤ 8 new
per second; reduced motion: fade only, no rise.

---------------------------------------------------------------------------------------------------

## 3. Crew, boarding and capture

All numbers in **`src/combat.js`** (`CREW`, `BOARD`, `RAIDERS`, `CAPTURE`).

### 3.1 Crew

Every ship type has `crew` (full complement `crew0`) and `grit` (fighting quality) in `shipTypes.js` (§6.7). Enemy crew:

```
crewNow(s) = max(0, crew0 − floor(crew0 × 0.5 × (1 − hpLow / maxHp)) − killed)
strikeAt(crew0) = floor(0.2 × crew0)            // the surrender notch: 2 pips of 10
```

`hpLow` = the lowest hp the ship has had (so hull regen never resurrects sailors); `killed` = crew lost to grape,
crits and boardings. Hull damage alone takes at most half the crew, so only grape or a boarding reaches the notch.

**Surrender:** an enemy (except types with `boardable: false`: the Molten Maw fights to the end) whose `crewNow ≤ strikeAt` **strikes its colours** at once (outside a boarding: "The Privateer
Brig strikes her colours!"): white flag, stops firing, keeps its heading and drifts at ≤ 1.5 u/s (`resolveLand` still
applies), leaves `fighting()` (no attack slot, not counted as a pirate left, not targeted by auto-aim), **cannonballs pass
through it**. Grappling a surrendered ship captures it at once (short set-piece, §3.4). Any surrendered ship still afloat
when the level is cleared is captured automatically ("The surrendered ships are yours!"), paying capture gold.

**Player crew:** `state.crew`, max = `armoryStats.crew` (12 / 15 / 18 / 22). Full at every `startLevel` (retry
included). Changes only by: boarding losses (yours or theirs), **+3 when reinforcements arrive** (next to `WAVE_REPAIR`),
**+2 per capture**; never above max, never below 1. Below 3 you can't grapple ("Not enough hands!"). The player's crew
is not thinned by hull damage and does not change reload.

Tag pips show `10 × crewNow / crew0` pips (the last one partly filled); the notch sits at `10 × strikeAt / crew0`.

### 3.2 Can I grapple?

`canGrapple(player, e)` (main.js, using combat constants) — first failing reason wins:

| # | Rule | Reason id → text |
|---|---|---|
| 1 | `state.mode === 'playing'`, intro over, no clear/death timer, player not sinking, no boarding running | `busy` → "Busy!" |
| 2 | target fighting **or** surrendered, not sinking, not captured/escaped | `none` |
| 3 | `type.boardable !== false` | `immune` → "Too hot to board!" (Molten Maw) |
| 4 | centre distance ≤ `grappleRange + 0.25 × e.type.len` (grappleRange 14 / 17 / 20 by Long grapples) | `range` → "Get closer!" |
| 5 | grapple cooldown over (6 s after any boarding ends) | `cooldown` → "Hooks coiling…" |
| 6 | `state.crew ≥ 3` (not needed for a surrendered target) | `crew` → "Not enough hands!" |

Angle and speed don't matter (arcade: the reel lines the ships up). G (or a Board tap) with no qualifying target shows
the first failing reason of the nearest enemy in the hint bubble for 2 s. The **target** is the qualifying enemy with the
best odds label (capture > fight > risky), then the nearest. Each frame main computes the target and its preview; the
target's tag shows the hook icon.

### 3.3 Odds and resolution (one deterministic formula, both directions)

```
boardingOdds(att, def, { heave = 0, enemyAttacks = false, home = false }):
  P = att.crew × att.blade × (1 + heave)            // player: blade = Cutlass drills 1.0/1.2/1.4/1.6; enemy: blade = grit
  M = 1 + w × (1 − def.hpFrac)                        // w = 1 when the player attacks, 0.5 when an enemy attacks
  D = def.crew × def.grit × (home ? 1.5 : 1)          // player defending its own deck: home = true, grit = blade
  R = def.crew ≤ 0 ? ∞ : P × M / D

resolveBoarding(att, def, opts):
  defLoss = min(def.crew, round(def.crew × clamp(0.45 × R, 0.15, 1)))      // R = ∞ → def.crew
  attLoss = def.crew === 0 ? 0 : round(def.crew × 0.3 / max(R, 0.5))
  caps:  player attacking:  attLoss ≤ att.crew − 1
         player defending:  defLoss ≤ min(def.crew − 1, ceil(0.6 × def.crew))
         enemy attacking:   attLoss ≤ att.crew
  hullDmg  = 2 × defLoss to the defender (a boarding never takes a ship below 1 hp)
  defLeft  = def.crew − defLoss;  attLeft = att.crew − attLoss
  player attacking → captured = defLeft ≤ strikeAt(def.crew0)
  enemy attacking  → overrun = R ≥ 1;  raiderStrikes = attLeft ≤ strikeAt(att.crew0)
```

`heave` ∈ [0, 0.2]: +0.04 per **G** press / Board tap during the reel (`e.repeat` ignored). Heave is a bonus; never needed.

**Preview label** (computed with `heave = 0`, shown on the tag hook, the HUD Board cell and the touch Board pill):

| Preview result | Label | Colour + icon (never colour alone) | Text |
|---|---|---|---|
| captured | **CAPTURE!** | green ring + tick | `CAPTURE! −1` (the `attLoss`) |
| not captured, `R ≥ 1.2` | **FIGHT!** | gold ring + crossed cutlasses | `FIGHT! −3` |
| `R < 1.2` | **RISKY!** | red ring + "!" | `RISKY! −4` |
| surrendered target | **TAKE HER!** | white flag | `TAKE HER!` |

aria-label example: "Board the Privateer Brig: capture likely, about 1 hand lost".

**Worked examples (all verified numerically):**

1. *Soften them up.* Stock ship (crew 12, blade 1.0). Privateer Brig (crew0 12, grit 1.1, maxHp 80) battered to 32 hp
   (40 %): `crewNow = 12 − floor(12 × 0.5 × 0.6) = 9`; `strikeAt = 2`. Preview: `P 12, M 1.6, D 9.9, R 1.939` →
   `defLoss = round(9 × 0.873) = 8` → 1 left ≤ 2 → **CAPTURE! −1** (`attLoss = round(2.7 / 1.939) = 1`). With three heaves
   (0.12): `R 2.172`, `defLoss 9`, `attLoss 1`. Result: captured; you lose 1 (12 → 11, +2 for the capture → 12, capped).
   Gold **145** at once (`6 × 20 + 25`; sinking her drops 60) and +50 prize bonus at level end.
2. *Full-hull rush.* The same brig at 80/80: `crewNow 12, M 1, D 13.2, R 0.909` → **RISKY! −4**:
   `defLoss = round(12 × 0.409) = 5` (7 left), `attLoss = round(3.6 / 0.909) = 4` (you keep 8), her hull 80 → 70.
   Three heaves don't save it (`R 1.018`, same losses).
3. *Raiders board you.* Frost Raider (crew 12, grit 1.1) vs stock ship at full hull: `P 13.2, M 1, D 12 × 1.0 × 1.5 = 18,
   R 0.733` → defence holds: you lose `round(12 × 0.33) = 4` (cap 8) and 8 hull; the raider loses `round(3.6 / 0.733) = 5`
   (7 left): "Boarders driven back!" and the **Counter-board!** window opens (§3.6). With Boarding party tier 2 + Cutlass
   tier 1 (`D 32.4, R 0.407`): you lose 3, the raider loses 11 → 1 left ≤ `strikeAt 2` → "Boarders beaten! The raider is
   yours!" (auto-capture, 125 gold).
4. *Overrun.* The same raider boards you when you're down to 5 crew at 30 % hull: `M = 1 + 0.5 × 0.7 = 1.35, D 7.5,
   R 2.376 ≥ 1` → **OVERRUN!** You lose 3 (cap `min(4, 3)`), the raider 1; they grab **25 % of this level's plunder**
   (`floor(0.25 × max(0, state.gold − state.goldAtLevelStart))`, pop `−N gold`) and cast off. The run never ends this way.
5. *The Phantom (spectral at 1 hp).* `crewNow = 24 − floor(24 × 0.5 × (1 − 1/300)) = 13`, `strikeAt 4`. Stock ship:
   `M 1.997, D 19.5, R 1.229` → **FIGHT! −3**: `defLoss 7` (6 left), not captured. With five heaves (0.2, the maximum):
   `R 1.474, defLoss 9` → 4 left → **captured** (four heaves, 0.16, give `R 1.425`, 5 left: not yet). Or board again after the cooldown with 9 crew: `R 1.997, defLoss 5` → 1 left
   → captured. With Boarding party 2 + Cutlass 2 (18 × 1.4): `R 2.58` → captured in one.
6. *Big ships need grape.* Man-o'-War (crew 20, grit 1.4) at 50 %: crew 15, `R 0.857` → RISKY −5; at 20 %: crew 12,
   `R 1.286` → FIGHT −3 (5 left, notch 4). Corsair Cutter (8, 1.0) at 40 %: crew 6, `R 3.2` → CAPTURE −1.

### 3.4 The set-piece (player boarding) — timeline in simulated time

| Phase | Duration | Simulation | Visuals / audio |
|---|---|---|---|
| `hook` | 0.45 s | target holds fire; both ships' speed caps → 4 | 3 hooks arc from your rail to hers, ropes appear; sfx `grapple`; banner strip "GRAPPLE!" |
| `reel` | 1.2 / 1.0 / 0.8 s (Long grapples tier 0/1/2) | speed caps stay 4; target's AI suspended; it is pulled (smoothstep) to the **slot** `player + right(h_p) × side × ((wid_p + wid_e)/2 + 0.7)`, along offset 0, heading turned to `h_p` or `h_p + π` (whichever is nearer); you can still steer at half turn rate; G presses heave | ropes taut, creaks, heave pips on the boarding strip; sfx `heave` per press |
| `swing` | 0.7 s | **steering locked; truce starts**; the pair is glued: both move along `h_p` at 2 u/s (`resolveLand` on both; if land blocks, speed 0) | captain + up to 4 crew swing from **your main yard** (`userData.yardTips`) on rope arcs to her `deckSpots`, staggered 0.08 s; sfx `heave`, "CHARGE!" |
| `brawl` | 2.0 s | glued | pairs `'fight'` with cutlasses, clang stars (glow particles), sfx `clash`; **her pips tick down one sailor at a time in `defLoss` equal steps; each visible defender `'fall'`s overboard in sync** (`onPip`) |
| `result` | 0.65 s | apply the result (§3.7); if not captured the ships are pushed apart (target moves 4 u/s laterally away for 1 s) | "CAPTURED! +145" or "Driven back! −4 crew"; survivors swing home or `'cheer'` |

Total **5.0 s** (4.6 s with the best grapples). G / Space / Enter during `brawl` skip to `result`.

- The result is computed by `boarding.js` at the **start of `swing`** from fresh snapshots (`getSides()`), so heave and
  any hull change during the reel count. The preview shown before G equals the result when no heave is added.
- **The player cannot fire during the whole set-piece** (the gun crews are on the ropes).
- **Truce** (`boarding.truce`): from `swing` to the end of `result` no enemy fires, bomb/lightning launch timers are pushed
  back by `dt` and bombs in flight freeze; cannonballs already in flight keep flying. Other enemies keep sailing (their AI
  runs), so you come out into a live fight. During `hook`/`reel` only the target holds fire.
- `separateShips()` skips the boarding pair (the slot gap ≈ 4.2 is smaller than the push radius ≈ 7); third ships still
  push normally. During `swing..result` `moveShip()` skips both ships' own integration (boarding sets their x/z/h) and the
  current drift (§6.6) does not apply to them.
- **Cancel** (lines snap, cooldown 6 s still applies): target sinks (lava, lightning), player sinks,
  level ends, or at the end of `reel` the centre distance is more than slot + 3 (land in the way): "She broke free!".
- After any boarding ends: grapple **cooldown 6 s** (hook icon shows a recharge ring); if the target is still fighting,
  both its reload timers are reset to a full `type.reload` (it cannot fire back instantly).
- Applying a result: the defender's hull damage is applied first, then main sets its `killed` so that `crewNow` equals
  `defLeft` **exactly** (hull thinning from the boarding's own hull damage never adds hidden losses); an enemy attacker's
  `killed` grows by `attLoss`; the player's `state.crew` becomes `attLeft` / `defLeft`.
- **Surrendered target** (kind `surrender`): `hook` 0.45 → `reel` → `result` 0.65 (no swing/brawl, no truce) ≈ 2.3 s →
  captured, no losses.
- **Boarding camera:** ease over 0.5 s from the chase camera to `pos = mid − fwd(h_p) × 13 + right(h_p) × (−side × 3) +
  (0, 8, 0)`, look at `mid + (0, 1.5, 0)` (`mid` = midpoint of the pair); ease back over 0.6 s. Both decks and all
  figures must be in frame at 1280×720 and 390×844 (the boarding agent tunes the numbers with screenshots). Reduced
  motion: cut instead of ease, no kick or shake.
- The helm captain hides while the boarding captain is across (`ctx.hideHelm(true/false)`).

### 3.5 Who appears

Boarding party: your captain (`captainOpts(look)`, cutlass) + up to 4 sailors (`crewOpts(look, seed)`, cutlasses),
prebuilt hidden during the level fly-in (one person per frame) with `share: true`. Defenders: `min(4, crewNow)` figures
from `enemyCrewOpts(typeName, seed)`, built lazily during `hook`/`reel` (one per frame). Raider boarders: prebuilt on
levels that have raiders. All boarding figures are children of the **scene**, never of a ship mesh (`disposeShip`
would dispose shared geometry), and are positioned each frame from the ship transforms. Peak ≤ 9 people (+45 calls).

### 3.6 Raiders board you (types with `boarder: true`)

A raider tries when: it holds an attack slot, centre distance ≤ **10**, `combatTime > def.grace`, its `crewNow ≥ 4`, it
is not surrendered, no boarding is running, its own cooldown ≤ 0, player not sinking, no clear timer. Raider AI: when
attacking within `engage + 8` it steers for a point 6 u off your beam (same side it is on) instead of circling.

| Phase | Time | What happens |
|---|---|---|
| `threat` | 1.5 s | hooks thud into your rail; both ships slow to 3; banner "BOARDERS! Cut the ropes!"; Board button → red **CUT!** (axe icon); keyboard tag "CUT! G". **Cut** by pressing G (or tapping Board) **3 times**, **or holding G / Board for 0.8 s**, **or** landing any cannonball on that raider (you may fire during `threat`). Cut → "Ropes cut!", sfx `cut`, raider veers off, its cooldown 10 s. |
| `reel` | 1.0 s | the raider is pulled to the slot beside you (speed caps 4; you may steer at half rate) |
| `swing` / `brawl` / `result` | 0.7 / 2.0 / 0.65 s | raiders swing onto your deck; your helm captain + 4 crew defend; result with `enemyAttacks: true, home: true` (examples 3, 4). Steering locked and truce as in §3.4. Raider cooldown 12 s afterwards. |

After a held defence (not overrun, raider not captured): **Counter-board!** for **3 s** — G / Board starts kind
`counter` against that raider (skips `hook` and `reel`, ignores the 6 s cooldown) with normal odds. A raider at or under
its notch after the fight surrenders and is captured automatically.

### 3.7 Capture and economy

| | Sink | Capture |
|---|---|---|
| Gold | `type.gold` coins × 10, floating (unchanged) | **`type.gold × 20 + 25`, paid at once** (`state.gold +=`, decorative coin fountain onto your deck) |
| Extras | — | +15 hull, +2 crew, **+50 prize bonus** at level end, feats `captures++`, `prizes[type]++` |
| The ship | sinks (unchanged) | `captured = true`; flags swapped; leaves `fighting()`, no collisions, not hittable; turns for the nearest world edge and sails off at 7 u/s; `removeAt = time + 5` ("poof" of glow particles) |

Capture gold: cutter 85, privateer 145, prahu 105, junk 185, corsair 145, man-o'-war 225, galleon **525**, raider 125,
phantom **625** (+ the `legend` feat). Level-end summary: `Ships sunk: 3 · Captured: 2 · Level bonus +500 · Prize bonus
+100` plus mechanic lines.

### 3.8 combat.js constants (exact)

```
RANGE   { pointBlank: 10, pointBlankMul: 1.25, fadeEnd: 14, falloffStart: 24, falloffEnd: 34, falloffMin: 0.75 }
RAKE    { cos: 0.8, stern: 2.0, bow: 1.5 }
CRIT    { base: [0.06, 0.09, 0.12, 0.15], stern: 0.12, bow: 0.06, pointBlank: 0.05, cap: 0.35, mul: 1.75,
          effectGap: 3, bossDuration: 0.5, hitStop: { scale: 0.1, time: 0.07, gap: 0.5 } }
EFFECTS { rudder: { turn: 0.25, time: 6 }, mast: { speed: 0.5, time: 8 }, keg: { burst: 12, dps: 2, time: 4 },
          routed: { crew: 2 }, chain: { speed: 0.55, turn: 0.7, time: 6, max: 10 } }
STATES  { battered: 0.6, wrecked: 0.3 }
AMMO    { round: { hull: 1, crew: 0, rakeCrew: 0, range: 34, reloadMul: 1, spreadMul: 1, pad: 0.3, top: 3.8, unlock: 1 },
          chain: { hull: 0.4, crew: 0, rakeCrew: 0, range: 26, reloadMul: 1.15, spreadMul: 1.2, pad: 0.8, top: 9, unlock: 2 },
          grape: { hull: 0.3, crew: 1, rakeCrew: 1, range: 20, reloadMul: 0.85, spreadMul: 2.5, pad: 0.6, top: 3.8, unlock: 3 } }
AMMO_IDS ['round', 'chain', 'grape'];  AMMO_SWAP 0.5
GHOST   { hullMul: 0.5 }                      // round & chain on the Phantom while her ghost crew stands
CREW    { hullShare: 0.5, strike: 0.2, minToBoard: 3, waveRefill: 3, captureRefill: 2 }
BOARD   { cooldown: 6, range: [14, 17, 20], lenFactor: 0.25, reel: [1.2, 1.0, 0.8], heaveStep: 0.04, heaveMax: 0.2,
          slope: 0.45, minFrac: 0.15, lossK: 0.3, minR: 0.5, hullPerKill: 2, homeDefence: 1.5, enemyMorale: 0.5,
          fightAt: 1.2, slotGap: 0.7, glueSpeed: 2, pushApart: { speed: 4, time: 1 }, breakFree: 3,
          phases: { hook: 0.45, swing: 0.7, brawl: 2.0, result: 0.65 }, partyShown: 4, defendersShown: 4 }
RAIDERS { reach: 10, threat: 1.5, reel: 1.0, cutTaps: 3, cutHold: 0.8, cooldownCut: 10, cooldownFight: 12, minCrew: 4,
          plunder: 0.25, counterWindow: 3, beside: 6 }
CAPTURE { goldMul: 20, flat: 25, hull: 15, crew: 2, prizeBonus: 50, sailAway: 5, sailSpeed: 7 }
```

---------------------------------------------------------------------------------------------------

## 4. Tavern upgrades — `src/armory.js` (own storage key; upgrades.js is untouched)

| id | Name | Stat | Values by tier | Costs | Also |
|---|---|---|---|---|---|
| `boarders` | Boarding party | Crew | 12 → 15 → 18 → 22 | 200, 450, 800 | new hands join at the next level start |
| `cutlass` | Cutlass drills | Boarding strength | ×1.0 → ×1.2 → ×1.4 → ×1.6 | 150, 350, 650 | |
| `grapple` | Long grapples | Grapple range | 14 → 17 → 20 paces | 150, 400 | reel 1.2 → 1.0 → 0.8 s; coiled grapples on the rail (`buildShip('player', { armory })`) |
| `gunner` | Master gunner | Critical hits | 6 % → 9 % → 12 % → 15 % | 200, 450, 800 | |

Total 4,600 gold (shipyard stays 5,270). `armoryStats(cfg)` → `{ crew, blade, grappleRange, reel, critBase }`.
`armoryStatText(id, tier)`: `"15 hands"`, `"×1.2"`, `"17 paces"`, `"9%"`. Bought in the tavern panel with the same row
markup, Buy rules, `aria-disabled` reasons and 400 ms double-click guard as the shipyard; purchases spend the same
treasure chest (`PURSE_KEY`).

---------------------------------------------------------------------------------------------------

## 5. Battle UI and controls

### 5.1 Keys (checked against every existing binding — no conflicts)

| Where | Key | Action |
|---|---|---|
| Battle | **G** | context: grapple the target · heave during your `reel` (+0.04, `e.repeat` ignored) · cut ropes during a raider `threat` (3 presses, or hold 0.8 s: keydown starts the hold timer, keyup clears it) · counter-board in the window · skip to `result` during `brawl` |
| Battle | **R** | cycle ammo Round → Chain → Grape (locked ammo skipped; `e.repeat` ignored) |
| Battle | **1 / 2 / 3** | pick Round / Chain / Grape (`e.code` `Digit1..3`, `Numpad1..3`, so AZERTY works) |
| Battle | Space / Enter during `brawl` | skip to `result` (Space never fires during a boarding anyway) |
| Battle, steering keys | — | ignored while `boarding.locked` (swing..result) |
| Town walk view | **W A S D / arrows** | move (camera-relative) |
| Town | **Shift** (held) | sprint |
| Town | **E**, or **Enter / Space** when no button is focused | go in / talk at the nearest place |
| Town | **C** | snap the camera behind the captain |
| Town | **P / Esc** | open the Harbour menu (modal); Esc inside it closes it |
| Tailor / tavern panel | **Esc** | back to town (P does nothing) |
| Any dock view | **M** | mute (as today) |
| Shipyard panel | — | **unchanged**: P / Esc / bare Enter / Space do nothing, A/D/←/→ turn the view (focus outside the panel) |

Help texts: the title and pause `.controls` lists gain `<kbd>G</kbd> board · <kbd>R</kbd> / <kbd>1</kbd>–<kbd>3</kbd> ammo`;
touch help gains "⚓ Board · Ammo".

### 5.2 Touch layout (battle)

```
.touch  grid-template-areas: "sail . act"
                             "steer . fire";
.pad.act  [ Ammo ]  [ ⚓ Board ]
```

- `.pad.act` holds `#touch-ammo` (`data-tap="ammo"`, icon + "Round" / "Chain" / "Grape"; **hidden until chain is
  unlocked**) and `#touch-board` (`data-tap="board"`, hook icon + one word: "Board" idle, "Take!" capture, "Fight",
  "Risky", "Heave!", "Cut!", "Again!" counter, "3 s" cooldown). Both use the existing `[data-tap]` semantics (act on
  pointerdown, skip the click that follows, keyboard / AT clicks act once). `TAP_ACTIONS.ammo = cycleAmmo`,
  `TAP_ACTIONS.board = boardButton` (grapple / heave / cut / counter / skip by phase).
- The Board pill is **always rendered** during play (stable layout). When nothing can be done it has
  `aria-disabled="true"` and its description says why (reason texts from §3.2); a tap then shows that reason in the
  hint bubble for 2 s (`flashHint(text, 2)`).
- Hold-to-cut: extra pointerdown/up/cancel listeners on `#touch-board` start/clear a 0.8 s timer that cuts the ropes
  during a raider `threat`.
- Size: the act pills are exactly the size of `.pad.mid` buttons at every breakpoint (66×44, 62×42, 56×40, 52×34) **but
  never less than 44 px tall** (so row 1 stays ≤ 44 px and the hint bubble, at `bottom: 222px` / `168px`, still clears
  it). Raise the hint bubble's `bottom` where a breakpoint needs it. The F01 layout probe (every `.touch button` on
  screen, no overlaps, the hint never covers a pad, nothing covers the gun card) must pass at all 10 sizes it runs.
- States are shown by icon + word + colour (green tick / gold cutlasses / red "!" / red axe), `aria-label` says the full
  state ("Board the Corsair Cutter: capture likely, about 1 hand lost").

### 5.3 Player HUD additions (ids are created in Stage 0, hidden)

| Element | Where | Content / rules |
|---|---|---|
| `#crew-chip` | inside `#hull-card`, absolutely positioned at the right end of the label row (does not widen the card) | crossed-cutlass icon + crew count, 13 px bold ink on paper; `aria-label="Crew 11 of 12"`; bumps (`.bump`) on change |
| `#gun-ammo` (`.gun.ammo`) | gun card, between Speed and Starboard | ammo icon + `#ammo-name` + label "Ammo <kbd>R</kbd>"; hidden until chain is unlocked; **hidden on touch layouts** (the act pad carries it); icon-only below 640 px |
| `#gun-board` (`.gun.board`) | gun card, after Ammo | label "Board <kbd>G</kbd>" + `#board-tag` showing the preview (`CAPTURE! −1`, `FIGHT! −3`, `RISKY! −4`, `TAKE HER!`, `HEAVE!`, `CUT!`, `AGAIN!`, `—`), text `--teal-text` / `--gold-text` / `--red-text` on paper; hidden on touch layouts; icon + key only below 640 px |
| `.fire-tag` | port/starboard cells | reads **RAKE!** (ink on `--gold`, class `rake`) instead of FIRE! when that side's aimed target (the one `playerFire(side)` would pick) presents bow or stern to that side's beam (`\|dot(beamDir, fwd(target.h))\| ≥ 0.8`); the touch fire button gets the same gold glow |
| `#objective` | small pill under the hull card (left), hidden when empty | `mechanics.objective()` text, e.g. "Galleons: 1 taken · 0 escaped · 1 to go"; updates at most 4×/s |
| `#boarding-strip` (`aria-hidden`) | top centre; below `#boss` when the boss bar shows | "⚔ 12 vs 9 ☠", a tug-of-war bar (your P vs their D) and 5 heave pips during `reel`; shows only during a set-piece |
| `#boss-crew` | inside `#boss`, under the boss bar | the boss's 10 crew pips + notch (every boss); the Phantom's name line reads "The Phantom Galleon — BOARD HER!" while spectral |
| `#pops` (`aria-hidden`) | full-screen layer inside `#hud` | ≤ 12 recycled spans (pops.js), **0 draw calls** |
| `#game-live` | sr-only, `role="status"`, polite | big events only, ≤ one per 1.5 s, de-duplicated like `announce()`: captures, boardings won/lost, ropes cut, overrun, new ammo, ammo switched, galleon escaped, Phantom spectral/banished |
| `#hitmark` | as today | main text + `.hm-tags` stickers (§2.5) |

Layout rules: nothing may widen `.hud-top` (F01 checks overflow); the F01 sizes must pass with the gun card's new cells.
Below 480 px (desktop) `.gun.steer` may hide (it is help text only).

### 5.4 Enemy tags — `src/tags.js` (replaces main's `buildTag/setTag`)

```
 [  PRIVATEER BRIG  ]              name sprite (unchanged look; label cache + font redraw move into tags.js)
 [████████▒▒▒░░░░░░░░]  (hook)      hull bar: red fill + a white "ghost" segment that lags 0.45 s (shows each hit's size)
 [▮▮▮▮▮▮▮░│░░        ]              crew row: 10 pips (cream #fff4d6 filled, dark #4a3b5c empty, last one partial), gold notch
```

- Per tag: bg plane (taller, holds both rows), ghost plane, fill plane, label sprite = **4 draws** (today 3), plus ≤ 1
  icon sprite when shown (hook icon in green/gold/red for the current target, white flag for a surrendered ship, a crossed
  flame for "too hot"; one shared atlas texture).
- **All crew pips and notches of all tags are ONE `InstancedMesh`** (MeshBasicMaterial, `noOutline`, `instanceColor`,
  capacity 12 tags × 11 instances) whose instance matrices are `tag.matrixWorld × pipLocal`, rewritten each frame for
  visible tags: **1 draw call** for the whole fleet.
- Visibility, billboarding and distance scaling exactly as today's `syncShip` code (`d > 10`, scale `clamp(d/30, 0.6, 2.6)
  × pulse`). Tags show for fighting **and surrendered** ships; hidden for captured / escaped / sinking ones.
- The boss has no tag (DOM bar + `#boss-crew`).

### 5.5 Hints and one-time tips

The first-voyage tutorial (`updateHints`, level 1, `state.tutorialDone`) keeps priority and is unchanged. Afterwards,
one-time tips (bitmask `pirates-ahoy-tips`, §8) in the same hint bubble, keyboard or touch wording:

| Bit | Trigger | Keyboard text / touch text |
|---|---|---|
| 1 | first time a boardable target is in reach | "Close enough to board! Press <kbd>G</kbd>" / "Tap ⚓ Board to board her!" |
| 2 | chain unlocked (first level start with it) | "New: chain shot slows ships! <kbd>2</kbd> or <kbd>R</kbd>" / "New: chain shot! Tap Ammo" |
| 4 | grape unlocked | "New: grape shot clears decks! <kbd>3</kbd>" / "New: grape shot! Tap Ammo" |
| 8 | first raider threat | "Boarders! Press <kbd>G</kbd> 3 times (or hold it) to cut the ropes" / "Tap CUT! 3 times or hold it" |
| 16 | first dock visit after the update | the Go ashore button pulses once |
| 32 | first time a side shows RAKE! | "Her stern is open! A shot down her length hits twice as hard" |
| 64 | first counter-board window | "Counter-board! Press <kbd>G</kbd>" / "Tap Again! to board them back" |
| 128 | first surrender | "She struck her colours! Grapple her to take her" |

### 5.6 Title screen, Act II and end screens

- Level cards: the same `.level-card.lvl-N` buttons in **two groups** inside `#level-cards`: headings "Voyage I · The Old
  World" and "Voyage II · The Far Seas" (`<h3 class="act-head">` spanning the grid; not `.level-card`), 3 per row;
  difficulty labels Easy / Medium / Hard / **Tricky / Tough / Legendary**, plus skull pips (`aria-label="Difficulty 4 of 6"`).
  A locked Act II card reads "Beat the Molten Maw" (card 4) or "Locked". The title tagline mentions the Far Seas. No page
  scroll at any F01 size (the panel scrolls inside if needed; Set sail! stays visible).
- **Level 3 stays a finale** (`def.finale`): beating the Molten Maw shows the Victory screen (`state.mode === 'won'`,
  best saved) and **unlocks level 4**. `#won-text` comes from `def.finaleText`. When a next level exists the new primary
  button **`#act2-btn` "Sail on to the Far Seas"** (first in the panel) calls `nextLevel()` (gold carries on) and Enter on
  the won screen does the same; "Main menu" and "Visit the dock" stay. After level 6 (also `finale`) the screen reads
  "The Phantom Galleon is yours! You are the Legend of the Seven Seas." and `#act2-btn` is hidden.
- `finishLevel()` and the victory banner in `step()` use `def.finale` instead of `state.level >= LEVELS.length`; a
  captured boss is named as captured in that banner ("The Phantom Galleon is yours!").
- `dockExits(from)`: `won` → `['next', 'title']` when a next level exists ("Set sail for Doubloon Bay", "Back to the
  title"), else `['title']`; the others unchanged. `openDock`'s "levelDone at the last level → won" rule uses `def.finale`.
- Level-cleared summary adds captures and mechanic lines (§3.7).

---------------------------------------------------------------------------------------------------

## 6. Levels

### 6.1 Level definition format — `src/levels.js` (Act I) and `src/act2.js` (Act II)

```js
{
  env,                       // env module (as today)
  difficulty: 'Tricky',      // card label
  act: 2, stars: 4,          // card group, skull pips
  scene: 'doubloon',         // audio scene (replaces LEVEL_SCENES; unknown names are ignored by audio.setScene)
  waves, nextWaveAt, maxAttackers, lead, spreadMul, grace, bonus,   // as today
  mechanic: '…',             // intro banner subtitle (as today)
  enemyRake: 1,              // §2.1
  mechanics: ['convoy'],     // ids into src/mechanics.js
  bombs: { kind: 'lava' | 'lightning', every: [a, b], spread, radius: 5, damage: 16, warn: [2.4, 3.2] },  // optional
  finale: true, finaleText: '…',                                   // optional
  rumour: { title: '…', lines: ['…', '…'], ammo: 'chain' | 'grape' | null },   // tavern rumour board
  lockText: 'Beat the Molten Maw',                                 // optional locked-card text
}
```

Act I (moved verbatim into `src/levels.js` in Stage 0, plus): L1 `act 1, stars 1, scene 'europe', enemyRake 0.4`;
L2 `stars 2, scene 'bali', enemyRake 0.6`; L3 `stars 3, scene 'volcano', enemyRake 0.8, bombs.kind 'lava', finale: true,
finaleText: "The Molten Maw is sunk and every pirate fleet of the Old World is at the bottom of the sea. But sailors whisper of the Far Seas…"`.
Act I waves, layouts and knobs are otherwise unchanged; Act I gains boarding, rakes/range/crits and ammo as they unlock.

`src/levels.js` exports `ACT1`, `LEVELS` and `WITH_ACT2`. Until Stage 3: `WITH_ACT2 = /[?&]act2=1(&|$)/.test(globalThis.location?.search ?? '')`
and `LEVELS = WITH_ACT2 ? [...ACT1, ...ACT2_LEVELS] : ACT1` (so agents can play Act II with `?act2=1` while the suite
still sees 3 levels). **Stage 3 sets `WITH_ACT2 = true`** in the same stage as the test updates (§11.4).

### 6.2 Generic main.js support used by the levels

- **Merchants** (`type.merchant`): never take attack slots; AI from the `convoy` mechanic.
- **Boarders** (`type.boarder`): raider AI and boarding attempts (§3.6).
- **Ghost** (`type.ghost`): Phantom rules (§6.6); ignores the current and eye damage.
- **Ice reefs** (`reef.ice`): slow **every** ship (shallow ones too) to `maxSpeed × 0.55` (normal reefs stay `×0.45` for
  deep hulls only).
- **Bombs with a kind**: `lava` (today: from `env.volcano`) or `lightning` (no projectile: a white-blue warning ring for
  `warn` s at the predicted spot, then `env.flash(x, z)` shows a bolt for 0.15 s and a sky flash; radius 5, damage 14,
  sfx `thunder`). Radius/damage/warn come from `def.bombs` (defaults = today's lava numbers).
- **Escape**: `escape(e)` → `escaped = true`, out of `fighting()`, removed with a foam puff, no loot.
- `env.step(simTime, dt)` (optional) is called every `step()` for gameplay-relevant motion (ice floes);
  `env.update(t, dt, { simTime, camera })` keeps doing visuals.

### 6.3 Mechanics hooks — `src/mechanics.js` (pure, import-free)

```js
export const MECHANIC_IDS = ['convoy', 'floes', 'current'];
export function createMechanics(ids, ctx) → {
  init(),                         // after the env, player and wave 0 exist (startLevel)
  onSpawn(e, waveIndex),          // after each enemy is created; may move e (x, z, h) to an open-water spot
  onCapture(e), onSink(e), onRemove(e),
  step(dt),                       // every step, after moveShip, before separateShips
  steer(e, dt) → { h, speed } | null,   // replaces the attack/wait logic of updateEnemy (avoidance and the world edge still apply)
  holdFire(e) → boolean,
  drift(s) → { vx, vz } | null,   // extra velocity added in moveShip (skipped for the glued boarding pair)
  avoid() → [{ x, z, r }],        // extra obstacles for enemy avoidance
  objective() → string | null,
  minimap() → [{ kind: 'gate' | 'galleon' | 'floe' | 'vortex' | 'eye', x, z, r }],
  summary() → string[],  bonus() → number,
  get state,                      // plain object for tests (__game.mechanics.state)
  dispose()
}
// ctx (from main): { env: () => env, player: () => player, enemies, fighting(e), relative(ship, x, z),
//   damage(ship, amount, x, z, source), escape(e), pop(text, x, y, z, style), showBanner(html, s), announce(text),
//   sfx(name, x, z), rng: () => number (combatRng), time: () => state.time, def }
```

- **`convoy`** (L4): `onSpawn` for `type.merchant`: move it to the nearest unused `env.convoyStarts[i]` and pick the
  `env.escapes` gate farthest from the player. `steer`: head for the gate at `0.7 × maxSpeed` (4.55); when the player is
  within 35 u, full speed (6.5) and zig-zag ±0.4 rad, switching every 4 s. `holdFire`: a merchant fires only when the
  player is abeam (`|along| < |lat| × 0.45`) within 18 u. `step`: a fighting merchant within its gate's `r` →
  `ctx.escape(e)`, banner "The galleon escaped with its gold!", `escaped++`. `onCapture`: merchant → `taken++`.
  `objective`: "Galleons: {taken} taken · {escaped} escaped · {toGo} to go" (to go counts unspawned ones). `bonus`:
  `150 × taken`. `summary`: "Galleons taken: 1 of 2". No failure state.
- **`floes`** (L5): ice floes are `env.reefs` entries with `ice: true` that `env.step(simTime)` moves (same objects,
  mutated in place). `step`: a ship whose centre enters a floe at speed > 6, at most once per 1.5 s per ship → 6 damage
  (source `'ice'`), pop "CRUNCH!", sfx `crunch`. `minimap`: floes.
- **`current`** (L6): from `env.current = { x, z, r: 75, pull: 3.2, swirl: 2.8, eye: 12, eyeDps: 5 }`. `drift(s)` for
  non-ghost ships with `d < r` (`dx, dz` from the centre, `k = 1 − d/r`): `vx = −pull·k·dx/d + swirl·k·dz/d`,
  `vz = −pull·k·dz/d − swirl·k·dx/d` (this swirl matches a disc whose `rotation.y` increases). `step`: non-ghost ships
  with `d < eye` take `eyeDps` as 1 hp every 0.2 s (source `'maelstrom'`); first time the player: banner "The
  maelstrom pulls you in!". `avoid`: `[{ x, z, r: eye + 4 }]`. `onSpawn` for `type.ghost`: place it 18 u from the centre
  in open water facing the player and set `e.rise = 3` (main's `syncShip` lowers the mesh by `6 × e.rise/3` while it
  counts down in `step`; banner "The Phantom Galleon rises!"). `minimap`: vortex ring + eye.

### 6.4 Level 4 — Doubloon Bay (`src/env/doubloon.js`) · Tricky ★4

- **Setting:** golden hour over Port Doubloon, a walled harbour town on the northern cliffs (white walls, terracotta
  roofs, a bell tower, bunting), a harbour mole with a lighthouse, a ruined star fort on the east headland (crumbled
  bastion, old cannons, tattered flag; decoration), palm-lined beaches, pelicans on pilings, treasure chests stacked on
  the quay, merchant ships at anchor inside the harbour (decor, behind colliders), a beached wreck on a sandbar.
  No skull landmarks (the Maelstrom has Skull Rock).
- **Palette:** `skyTop 0x3b6fd6, skyHorizon 0xffc27a, sunColor 0xffd9a0, sunDir [-0.7, 0.3, 0.4], sunIntensity 2.3,
  hemiSky 0xffe2b8, hemiGround 0x5a6a8a, hemiIntensity 1.3, fogColor 0xffd6a8, fogNear 140, fogFar 380, waterDeep 0x1f6fb5,
  waterShallow 0x4cc6d8, waterFoam 0xffffff, waveAmp 0.6, cloudColor 0xfff1dc, cloudShade 0xf2b48a, cloudCount 10`;
  `worldRadius 150`.
- **Gameplay data:** 6–9 **sandbars** as `reefs` (pale gold discs; deep hulls ×0.45 — the deep galleons are funnelled into
  channels); `escapes: [{ x, z, r: 10 }, { x, z, r: 10 }]` at the south edge, each **≤ 125 from the centre** (inside
  `worldRadius − 25`, or main's "stay inside the sea" rule would turn the galleons back), marked by a pair of red/green
  channel buoys with little flags and a faint foam ring; `convoyStarts: [{ x, z, h }, …]` (≥ 3, open water near the
  harbour mouth, 130–150 u from both gates, ≥ 45 u from `playerStart`, clear of colliders by 12 and of reefs by r + 4 —
  the smoke layout check requires every enemy > 35 u from the player at the start); `enemySpawns` ≥ 6 (open water, ≥ 35 from the
  start, 58–92 from it, inside `worldRadius − 16`); `playerStart` mid-bay facing the harbour.
- **Waves:** `[['galleon', 'cutter', 'cutter'], ['galleon', 'privateer', 'corsair']]`, `nextWaveAt: 1`, `maxAttackers: 2`,
  `lead 0.6, spreadMul 1.0, grace 4, enemyRake 1, mechanics ['convoy'], bonus 500, scene 'doubloon'`.
  `mechanic: 'Treasure galleons are running for the open sea! Catch them, thin their crews and board them for a fortune.'`
  `rumour: { title: 'Doubloon Bay', lines: ['The treasure fleet sails at dusk.', 'Sink a galleon and her gold sinks too: board her instead!'], ammo: 'chain' }`.
- **Why it is more complex:** two goals pull against each other (escorts vs the loot), channels and time pressure matter,
  and the best answer uses the new tools: chain to slow her, grape or rakes to thin her, grapple for 525 + 150 gold.

### 6.5 Level 5 — Frostbite Straits (`src/env/frost.js`) · Tough ★5

- **Setting:** a pastel arctic strait at dawn: snowy fjord cliffs along two sides (a channel 80–100 u wide), an ice arch,
  a frozen waterfall (emissive pale cyan, `noOutline` on the glow), a turf-roofed Nordic village with a **stave church**
  on one shore, dragon longships moored at a jetty (decor), an abandoned whaling station on stilts with a beacon fire,
  puffins on rocks and seals on floes, static **icebergs** (blue faces, snow tops; normal colliders with shore foam),
  **aurora** ribbons (3 emissive additive meshes, fog off, `noOutline`), snowfall (one InstancedMesh of ≤ 200 flakes
  around the camera, `noOutline`).
- **Palette:** `skyTop 0x5d7fd6, skyHorizon 0xf3e6ff, sunColor 0xffe3f0, sunDir [0.5, 0.25, -0.6], sunIntensity 1.9,
  hemiSky 0xe9e6ff, hemiGround 0x5a6a9a, hemiIntensity 1.4, fogColor 0xe6ecff, fogNear 90, fogFar 360, waterDeep 0x1d5f9e,
  waterShallow 0x5fc3e0, waterFoam 0xf4fbff, waveAmp 0.5, cloudColor 0xffffff, cloudShade 0xd8d0f0, cloudCount 12`;
  `worldRadius 140`.
- **Gameplay data:** 8 drifting **ice floes** in `reefs` (`{ x, z, r: 3–5.5, ice: true }`), each moved by `env.step(simTime)`
  along a fixed ellipse (`cx + rx·cos(ωt + φ)`, `cz + rz·sin(ωt + φ)`, 0.6–1.2 u/s) that never enters a collider or the
  player start (clear by r + 8); the floe meshes follow in `update`. Floes are **not** colliders, so `ocean.setFoam` (baked
  once per level) is unaffected; each floe carries its own flat foam-ring mesh.
- **Waves:** `[['raider', 'raider', 'privateer'], ['raider', 'raider', 'manowar']]`, `nextWaveAt: 1`, `maxAttackers: 3`,
  `lead 0.65, spreadMul 0.95, grace 3, enemyRake 1, mechanics ['floes'], bonus 700, scene 'frost'`.
  `mechanic: 'Longship raiders board YOU! Press G three times (or hold it) to cut their ropes.'` (touch wording: "Tap CUT!
  three times or hold it"). `rumour: { title: 'Frostbite Straits', lines: ['Raiders with horned helmets row out of the fog.', 'Chain shot slows their longships; cut their ropes fast!'], ammo: 'chain' }`.
- **Why it is more complex:** the threat comes to you (cut, fight or counter-board), moving obstacles, and distance
  management flips: raiders (12.5 u/s, faster than a stock ship) want to be close, you want them slowed at broadside range.

### 6.6 Level 6 — The Maelstrom (`src/env/maelstrom.js`) · Legendary ★6 · Act II finale

- **Setting:** a stormy night at the end of the world: the **whirlpool** at (0, 0) — a rotating spiral foam disc (r 40,
  vertex-coloured spiral arms, `noOutline`, `rotation.y` increasing) around a dark sinking eye funnel (r 12); **Skull
  Rock** (a sea stack carved like a skull with glowing green eyes) and a ring of jagged sea stacks on the rim (colliders,
  r 95–125 from the centre); a sunken temple of pillars with green braziers on rim islets; wreck debris circling in the
  current (decor meshes rotated in `update`); a ghostly lighthouse with a green flame; rain streaks (one InstancedMesh ≤ 300
  around the camera, `noOutline`); a hidden bolt mesh for lightning (`flash(x, z)`); optional far kraken silhouette.
- **Palette:** `skyTop 0x1d1f4a, skyHorizon 0x6e5aa8, sunColor 0xbfd6ff, sunDir [0.3, 0.7, -0.4], sunIntensity 1.3,
  hemiSky 0x8a86c8, hemiGround 0x1a2033, hemiIntensity 1.2, fogColor 0x3a3a6a, fogNear 70, fogFar 300, waterDeep 0x153a5c,
  waterShallow 0x2f7f8f, waterFoam 0xd8f2ff, waveAmp 0.8, cloudColor 0x6a6890, cloudShade 0x34304e, cloudCount 18`;
  `worldRadius 140`.
- **Gameplay data:** `current: { x: 0, z: 0, r: 75, pull: 3.2, swirl: 2.8, eye: 12, eyeDps: 5 }`; `playerStart` at radius
  ≈ 95; `enemySpawns` ≥ 6 at radius 60–100 (≥ 35 from the start); `flash(x, z)`.
- **Waves:** `[['corsair', 'raider', 'corsair'], ['phantom', 'raider']]`, `nextWaveAt: 0`, `maxAttackers: 2`,
  `lead 0.7, spreadMul 0.9, grace 3, enemyRake 1, mechanics ['current'],
  bombs: { kind: 'lightning', every: [5, 8], spread: 8, radius: 5, damage: 14, warn: [1.4, 1.6] }, bonus 1000,
  scene 'maelstrom', finale: true, finaleText: 'The Phantom Galleon is yours! You are the Legend of the Seven Seas.'`.
  `mechanic: "The maelstrom pulls you in! Scatter the Phantom's ghost crew with grape shot, then board her."`
  `rumour: { title: 'The Maelstrom', lines: ['A ghost ship sails where the sea swallows itself.', "Round shot barely scratches her. Grape and cutlasses don't!"], ammo: 'grape' }`.
- **The Phantom Galleon** (boss, `ghost: true`, crew 24, grit 1.5, hp 300): while her `crewNow > strikeAt` (4): round and
  chain do ×0.5, **her hull never drops below 1** (`minHp` 1) and at 1 hp she turns **spectral** (green glow, tag/boss name
  "BOARD HER!"; balls still hit her and grape still kills ghosts, but her hull stays at 1; she keeps sailing and firing).
  Grape kills ghosts normally (×1.0 hull, 1 crew per ball, +1 on a rake).
  When her crew falls to the notch (grape or a boarding) she **strikes**: "The ghost crew is banished!" and a grapple
  captures her (625 gold + `legend` feat). Boarding her while spectral is the main route (§3.3 example 5). She can never be
  sunk; the level is won when she is captured and the rest are gone. No regen, no timers.
- **Why it is the hardest:** a constant steering budget against the current, lightning, a boss that demands ammo
  switching and boarding, plus a raider that boards you.

### 6.7 Ship types (`src/shipTypes.js`; data written in Stage 0)

Existing types gain `crew` and `grit`: cutter 8 / 1.0, privateer 12 / 1.1, prahu 9 / 1.0, junk 14 / 1.2, corsair 10 / 1.2,
manowar 20 / 1.4, inferno 24 / 1.5 + `boardable: false`. Player: no `crew` field (it comes from the armory). New:

```js
galleon: { name: 'Treasure Galleon', hp: 140, len: 14, wid: 4.6, maxSpeed: 6.5, accel: 1.8, turn: 0.5, reload: 3.2,
           guns: 2, dmg: 4, gold: 25, engage: 26, spread: 0.14, crew: 14, grit: 0.8, merchant: true },
raider:  { name: 'Frost Raider', hp: 45, len: 9, wid: 2.8, maxSpeed: 12.5, accel: 4.5, turn: 1.6, reload: 3.0,
           guns: 1, dmg: 4, gold: 5, engage: 9, spread: 0.12, crew: 12, grit: 1.1, boarder: true, shallow: true },
phantom: { name: 'The Phantom Galleon', boss: true, hp: 300, len: 17, wid: 5.4, maxSpeed: 6.5, accel: 2, turn: 0.6,
           reload: 2.6, guns: 6, dmg: 5, gold: 30, engage: 24, spread: 0.07, crew: 24, grit: 1.5, ghost: true },
```

Models (ships.js, Stage 1): **galleon** — tall gilded stern castle with three tiers of windows, cream sails with a golden
sun emblem, treasure chests and a coin heap on deck, lanterns, deck 1.4; **raider** — long low clinker hull, round
painted shields along both sides, one striped blue/white square sail, a curled serpent prow, oar banks, deck 1.0;
**phantom** — barnacled dark hull, tattered translucent teal-green sails (per-ship cloned emissive cloth), green glowing
lanterns and portholes (`glows`), a skull figurehead, green mist (`fx: 'smoke'` tinted), deck 1.8. Each ≤ the
Man-o'-War's draw calls (phantom ≤ 1.3× it).

### 6.8 Difficulty order

Expected damage taken: Europe < Bali < Volcano < Doubloon Bay < Frostbite Straits < The Maelstrom. Every level is
winnable with the stock ship; Act II expects a few upgrades. The Act I bot keeps checking "volcano > Europe"; the Act II
bot checks "Maelstrom > Doubloon Bay" (§11.3). Tuning knobs, in order of preference: `maxAttackers`, `lead`,
`spreadMul`, enemy `crew`/`grit`, `BOARD.slope`, `RAKE`, then wave composition.

---------------------------------------------------------------------------------------------------

## 7. The walkable town (Sparrow's Floating Island)

### 7.1 Flow and views

`state.mode` stays `'dock'` for the whole visit (every dock test, the context-loss handling and the P/Esc rules keep
working). `townMode.view` says what is on screen:

| view | Screen | Camera | Entered by |
|---|---|---|---|
| `'shop'` | today's shipyard panel `#dock-screen` + header button **`#dock-ashore-btn`** ("Go ashore", boot icon; reads "Back to town" when you came from the town) | today's showcase sway (`updateDockCamera`) | every `openDock()` (unchanged: focus on the Upgrades tab); the town's Shipyard place |
| `'town'` | `#town-screen` (town HUD) | third-person on the captain (§7.3) | Go ashore; Back to town |
| `'tailor'` | `#wardrobe-screen` | "mirror" pose at the podium, framed beside the panel | the tailor place |
| `'tavern'` | `#tavern-screen` | pose on the tavern porch, framed beside the panel | the tavern place |

- `#dock-ashore-btn` sits in `.dock-head` **before the tablist in DOM order**, so the tested Tab order from the Upgrades
  tab (Buy buttons → the way out) and the swatch order are unchanged; it is reached with Shift+Tab. It is not a
  `.buy-btn` or `.swatch`. Text contrast ≥ 4.5:1 (it is inside the `#dock-panel` contrast probe), ≥ 44 px.
- Go ashore: the captain is built lazily on the first visit to the town view (the shipyard view has no extra people, so
  the existing dock draw-call and people-count checks are untouched), placed at `walk.spawn`, and the camera eases 0.8 s
  from the showcase pose to behind the captain (cut under reduced motion). `#dock-screen` hides, `#town-screen` shows,
  focus moves to `#town-screen` (`tabindex="-1"`, `role="region"`, `aria-label="Sparrow's Floating Island: walking"`) and
  `#town-live` says "You're ashore. Walk with W A S D or pick a place below." (touch: "…use the stick or pick a place below.")
- From a panel back to town: focus returns to that place's button in the places bar.
- Back to the shipyard (`ctx.showShipyard()` in main): `#dock-screen` shows again, `dockLayout = null` so the showcase
  framing is recomputed, focus on the Upgrades tab. Entering any other view: `camera.clearViewOffset()` + `setLens()`
  first (townMode then applies its own framing in panel views).
- Leaving the dock (any way out) disposes the captain and hides every town screen (`townMode.close()`).

### 7.2 Captain controller (`src/town.js`, walk rules from `src/walk.js`)

- Captain = `buildPerson({ ...captainOpts(look), scale: 1.1 })`, collision radius **0.3**.
- Speeds: **jog 3.0 u/s** (default for keys and a full joystick, new `'run'` pose), **sprint 4.6 u/s** (Shift held, or
  joystick tilt > 0.9 for 0.5 s), **walk 1.4 u/s** (joystick tilt < 0.5, `'walk'` pose). Animation tempo
  `= speed / walkSpeed(captain, action, 1)` so the feet never slide; `'proud'` when idle. Acceleration 12 u/s², stop in
  ≈ 0.15 s; the body turns toward the move direction at 10 rad/s. Footsteps sfx `step` on each foot plant.
- Input = a camera-relative move vector `{ x, z, run }` from keys, the joystick or auto-walk.
- **Auto-walk:** a tap/click on the boardwalk (pointerdown → up within 250 ms and 10 px; `walk.pick` ray, then
  `walk.snap`) or a places-bar button → `walk.path` (A* + string pulling), followed at jog speed with a gold ring at the
  target; any move key or stick input cancels it. Arriving at a place **through the places bar** opens it; a tapped
  point just walks there.
- Townsfolk are soft obstacles (`env.folk()` circles r 0.35, updated each frame). Within 2.2 u the nearest one turns,
  `'wave'`s for 2 s and says one line in a DOM speech bubble ("Ahoy, Captain!", "Fine coat, Cap'n!" when a paid coat is
  worn, "Is that a parrot?!", "Heard you took a prize!" after a capture); one bubble at a time, 20 s per person
  (`env.greet(index, seconds)`).
- `?walkdebug=1` draws the walk areas, links, blockers and places as lines (author aid; tests screenshot it once).

### 7.3 Town camera

- Orbit around `captain + (0, 1.2, 0)`: distance **6.5** (7.5 when the window is portrait), pitch **0.4 rad**, FOV from
  `setLens()`. `camera.clearViewOffset()` in the walk view.
- Auto-follow: after 1.5 s without a drag, while the captain moves away from the camera (`dot > −0.3`), the yaw eases
  behind the captain at 1.5 rad/s; walking toward the camera never spins it. **C** snaps it behind.
- Drag on the canvas (mouse, or one finger outside the joystick) turns the yaw 0.006 rad/px; vertical drag changes pitch
  within 0.2–0.75 rad.
- Collision: march the boom like `collideCamera()` against blockers with `h ≥ 2` (buildings, tower, crane); shorten to
  ≥ 2.5; never below deck height + 0.9. Townsfolk within 1.0 of the lens are hidden for that frame.
- Panel views use the place's `cam` pose and frame the subject (captain on the podium, or the tavern table) in the free
  area beside the panel (above it when the panel is a bottom sheet) with `camera.setViewOffset`, the same idea as
  `dockFraming()` (helper `frameBeside()` in town.js). Drag (or ←/→ with nothing focused) turns the captain on the podium.
- Reduced motion: no auto-follow easing (the camera follows rigidly behind on C only), cuts instead of swoops.

### 7.4 Walkable area data (exported by `sparrow.build()` as `env.walk`, plain JSON-able)

`sparrow.js` builds the town from `platform(name, P)`, `rails(…)`, `bridge(a, b)` (which already returns the sag walk
curve), the garden and the stalls. The walk data is generated **from those same calls** so it always matches the art.

```js
walk: {
  areas: [   // where the captain's CENTRE may stand: each deck inset 0.65 from rails and water edges
    { id: 'pier',  kind: 'rect', x: 0, z: -4.4, w: 20.7, d: 1.3, ry: 0, y: 1.3 },          // starting values, derived
    { id: 'plaza', kind: 'rect', x: 0, z: -10.25, w: 15.7, d: 7.8, ry: 0, y: 1.3 },        //  from today's layout; the
    { id: 'tavern', kind: 'rect', x: -6.2, z: -19.6, w: 9.2, d: 7.7, ry: 0, y: 1.3 },      //  sparrow agent derives the
    { id: 'yard',  kind: 'rect', x: 16.2, z: -11.5, w: 7.1, d: 7.7, ry: 0, y: 1.3 },       //  real ones from its geometry
    { id: 's1',    kind: 'rect', x: 5.2, z: -20.8, w: 4.7, d: 3.7, ry: -0.06, y: 1.3 },
    { id: 'tower', kind: 'rect', x: -15.5, z: -27.2, w: 4.7, d: 4.7, ry: 0.15, y: 1.3 },
    { id: 'garden', kind: 'circle', x: -14.4, z: -7.6, r: 2.9, y: 1.45 },
    // portals: small rects joining areas through rail gaps or open seams, e.g. the two pier→plaza rail gaps
    // (pier-local x ∈ [-1.5, 2.5] and [-7.8, -5.4] on the 'back' edge) and the plaza↔tavern raft seam
    { id: 'pier-plaza-1', kind: 'rect', x: 0.5, z: -5.7, w: 3.4, d: 1.6, ry: 0, y: 1.3 }, …
  ],
  links: [   // rope bridges: the bridge() walk curves; the centre may stray hw from the polyline
    { id: 'plazaS1', pts: [[x, y, z], …], hw: 0.25 }, 'plazaYard', 'plazaGarden', 'tavernTower', …
  ],
  blockers: [ // static obstacles for the captain (inflated by his radius at test time); h = height for the camera
    { x, z, r, h } | { x, z, w, d, ry, h }   // stall counters (STALL_Z), the welcome sign posts, the well, benches,
  ],                                          // lamp posts, barrel stacks, the tavern building, tower legs, crane base,
                                              // the slipway boat, shacks, Polly's shop, the podium edge…
  places: [
    { id: 'ship', name: 'The Sea Biscuit', x, z, r: 1.4, face },                 // the gangplank foot on the pier
    { id: 'shipyard', name: 'The Shipyard', x, z, r: 1.8, face },               // in front of the shipwright, yard.at(-0.6, 1.6)
    { id: 'tailor', name: "Polly's Plumes & Trims", x, z, r: 1.6, face,
      podium: { x, y, z }, lineup: [{ x, y, z, h } ×3], cam: { pos: [x, y, z], target: [x, y, z] } },
    { id: 'tavern', name: 'The Salty Sparrow', x, z, r: 1.6, face, cam: { pos, target } },  // its front door
  ],
  spawn: { x, z, h },   // at the ship place, facing the town (h ≈ π)
}
```

Walkable: pier, plaza, tavern raft, tower raft (via `tavernTower`), yard (via `plazaYard`), garden (via `plazaGarden`),
`s1` (via `plazaS1`). Every other platform is scenery. The gangplank is not walkable (the ship moves); the `ship` place
sits at its foot. Water edges are walls (you can't fall in). Walkable surfaces seen from the walk camera must show no
holes or unfinished backs (the welcome sign's back, stall backs, tavern sides, Polly's shop back): add simple backs where
the stage-1 walk screenshots show gaps.

### 7.5 Places and new art in sparrow.js

| Place | Opens |
|---|---|
| `ship` | **All aboard?** modal (`#aboard-dialog`): the dock's ways out (`dockExits(dock.from)`, same labels as the shipyard footer, ids `aboard-<action>-btn`) + **Stay ashore** |
| `shipyard` | view `'shop'` (the existing panel, focus on the Upgrades tab; `#dock-ashore-btn` reads "Back to town") |
| `tailor` | view `'tailor'` |
| `tavern` | view `'tavern'` |

- **Polly's Plumes & Trims** replaces the generic shack on platform `s1` (5.2, −20.8): a narrow two-storey shop with a
  pink and teal facade, a scalloped striped awning, a big painted sign with a feather and scissors (on the sign texture
  atlas), three hats on wooden heads in the window, a mannequin in a long coat, a tall mirror on a stand (light-blue
  plane with white glints, no real reflection), a barber chair, a **spinning red-and-white barber pole** (a kept mesh
  rotated in `update`), and a round **podium** with a rug in front where the captain stands for fittings. NPCs: **Polly**
  (woman, `tool: 'tape'`, `'measure'`) and **Old Snips** (old man, `tool: 'scissors'`, `'snip'`). Baked into the statics
  like the other shacks (only the two NPCs and the pole add draw calls).
- On the plaza, the pots stall (x 4.4) gets a little "Tailor →" signpost with a hat display pointing to the `plazaS1`
  bridge, readable from the shipyard showcase camera.
- **Prize berths (cut-able):** up to 2 captured ships moored off the east arm (water near `s9` / `s18`), built with
  `buildShip(type)` for the two most valuable types in `feats.prizes`, each with a small "Prize" pennant in your flag
  look; `env.setPrizes([{ type }])`; `visible` only in the town view (so the shipyard view's draw calls are unchanged).
- `env.setCrewStyle(fn)`: rebuilds the six cleaning-crew people with `fn(role, seed, baseOpts) → opts` (roles
  `'mopA' | 'mopB' | 'polish' | 'bosun' | 'plank' | 'boat'`), keeping their tools, actions and placement on the current
  ship; disposes the old people. Called on every `openDock` and after every crew-look change. With the default crew look
  (`own`) it must reproduce today's crew exactly.
- `env.folk()` → `[{ x, z, r: 0.35, index }]` for standing/walking townsfolk on walkable areas; `env.greet(index, seconds)`
  makes that person turn to the captain and `'wave'`; `env.cull(x, z, radius)` hides townsfolk farther than `radius`
  (40) from the camera in the town view; `env.peopleCount` still counts folk + crew (Polly and Snips included).

### 7.6 Town HUD (`#town-screen`, pointer-events only on its controls)

`town.css` gives `.overlay.town` (and the wardrobe/tavern screens) `background: none; pointer-events: none` like
`.overlay.dock`, with `pointer-events: auto` on the controls and panels, so the canvas below still gets drags and taps.

| Control | Position | Notes |
|---|---|---|
| `#town-chest` | top-left | "Treasure chest: 340 gold", `aria-live="polite"` like `#dock-chest` |
| `#town-menu-btn` (☰ "Harbour menu"), `#town-mute` | top-right | 48 px; mute shares `toggleMute()` and stays in sync |
| `#town-places` | bottom centre | 4 buttons `data-place="shipyard\|tailor\|tavern\|ship"`: icon + label "Shipyard", "Tailor", "Tavern", "Set sail"; below 480 px icon-only with `aria-label` ("Walk to the tailor") |
| `#town-prompt` | above the places bar | a real button: "Polly's Plumes & Trims — Enter ⏎" (touch: "Go in") when within a place's `r`; announced politely |
| `#town-action` | bottom-right, **touch only** | 76 px round "Go in" (place icon), enabled only at a place |
| `#town-joystick` | bottom-left, **touch only** | the base (128 px) appears where the left thumb lands in the left 45 % of the screen; knob 56 px; dead zone 0.15; pointer capture; `aria-hidden="true"` (the places bar is the accessible equivalent) |
| `#town-keys` | bottom-left, desktop only | "Walk WASD · Sprint Shift · Go in E · Camera C · Menu Esc" |
| `#town-live` | sr-only, polite | arrivals, prompts, purchases |

Layout at 320×480, 360×640, 390×844, 844×390, 568×320, 1024×600 and 1280×720: no page scroll, nothing overlapping,
every control ≥ 44 px, small text ≥ 4.5:1.

**Harbour menu** (`#harbour-dialog`, `openModal`, P/Esc in the walk view or ☰): **Keep walking** · Shipyard · Tailor ·
Tavern · the ways out (`dockExits`). Every place is one keypress away for keyboard and screen-reader users. Esc closes it
(main must route Esc to it: in the dock the generic `togglePause()` does nothing).

### 7.7 Polly's Plumes & Trims — the wardrobe panel (`#wardrobe-screen`)

Same parchment look as the shipyard (`.panel.dock-panel` classes, its own ids, **outside `#dock-panel`**); side panel on
wide screens, bottom sheet in portrait.

- Header: kicker "Tailor & Barber", title "Polly's Plumes & Trims", `#wardrobe-chest` (aria-live).
- Tabs (`role="tablist"`, same keyboard model as the shipyard: ←/→/Home/End): **Captain** | **Crew**.
- Captain groups (`role="group"` + `h3`): Hat · Coat · Beard · Hair colour · Hairstyle · Skin · Body · Pet · Eyepatch.
  Crew groups: Shirts · Headgear · Sash + a **Match the ship's paint** button (sets crew shirt `paint`).
- Each item: a swatch-style button ≥ 44 px (icon or colour chip + name + a state line: "Free", "Owned", "120 gold",
  "Need 30 more gold", "Locked: capture 10 ships"); `aria-pressed` on the worn item.
- **Free / owned item:** worn at once (saved, captain or crew rebuilt, `'cheer'`, announced "Hat: Bandana").
- **Priced, not owned: try-on.** The 3D preview wears it, the item reads "Trying on", and a **Buy** button appears at
  the top of that group: "Buy Cavalier's plume — 180 gold" (`aria-disabled` + "Need 30 more gold" when too poor; focus
  stays put). Buying spends the treasure chest, owns + wears + saves, coin sound, gold sparkle, Polly `'cheer'`s,
  announced. Leaving the tab or the panel without buying puts the last owned choice back ("The plume goes back on the
  rack"). A double-click or held Enter buys once (400 ms guard).
- **Trophy item not earned:** stays focusable with `aria-disabled` and its unlock text.
- Footer: **Surprise me!** (randomises the free options of the current tab, saved) and **Back to town** (primary).
- 3D: the captain turns slowly on the podium (`'proud'`), drag to spin. On the **Crew** tab the camera pans to the
  **crew line-up**: three of your sailors (seeds 1–3, the line-up spots) who walk out of the shop door and stand in a row
  wearing the uniform. Every change rebuilds the affected people (dispose the old) and calls `env.setCrewStyle()` so the
  cleaning crew on the docked ship changes too.

### 7.8 The Salty Sparrow — the tavern panel (`#tavern-screen`)

- The four armory rows (§4) in `#tavern-up-list`, built by townMode with the **same markup and CSS classes** as the
  shipyard rows (`.up-row`, `.buy-btn`, pips, `aria-disabled` reasons) but **outside `#dock-panel`**.
- **Rumour board** `#tavern-rumour`: the next level's `rumour` (title, 2 lines, recommended ammo) — the next level is
  `state.level + 1` after a cleared level, the level to retry after a shipwreck, else the highest unlocked level.
- **Captain's log** `#tavern-log`: captures, boardings, rakes, crits, and the trophies still to win with their progress
  ("Admiral's white coat: 3 of 10 captures").
- Footer: **Back to town**. Buying works like the shipyard (`buyArmory(id)` in main: spend, save, announce); `grapple`
  purchases rebuild the docked ship (coiled grapples on the rail).

### 7.9 Cosmetic catalogue — `src/cosmetics.js` (pure)

Item id = `"<slot>.<key>"`; slot names are unique across captain and crew. Prices are treasure-chest gold; trophies unlock
by feats. **Defaults in bold** (every slot has exactly one default and it is free).

**Captain**

| Slot | Free | Paid | Trophy |
|---|---|---|---|
| `hat` | **tricorn** (black, gold trim), bandana (scarlet), straw, none | bicorne "Admiral's bicorne" 120, plume "Cavalier's plume" (tricorn + red feather) 180 | crown "Pirate King's crown" — `legend ≥ 1` |
| `coat` | **crimson** (long coat, gold buttons), navy, none (striped shirt and vest) | black 60, emerald 60, plum 60 | admiral "Admiral's white" — `captures ≥ 10` |
| `beard` | **full**, goatee, stubble, none | braids "Blackbeard braids" 80, handlebar "Curly moustache" 40 | — |
| `hair` (colour) | **brown**, black, ginger, blonde, grey | sea "Sea-blue dye" 50, coral "Coral-pink dye" 50 | — |
| `hairstyle` | **crop**, long, ponytail, bald | — | — |
| `skin` | `s1`…`s7` = people.js `SKIN[0..6]`, default **`s3`** | — | — |
| `body` | **broad** (pirate build), slim (woman build in pirate clothes: trousers and boots, never a skirt) | — | — |
| `pet` | **none** | parrot "Red parrot" 150, macaw "Blue macaw" 150 | golden "Golden parrot" — `rakes ≥ 50` |
| `patch` | **off**, on | — | — |

**Crew uniform** (every friendly sailor: cleaning crew, boarding party, line-up)

| Slot | Free | Paid | Trophy |
|---|---|---|---|
| `shirt` | **own** (each sailor's own clothes), red stripes, blue stripes, black stripes, teal, paint ("Match the ship's paint": shirt = the hull paint's `top`, stripes = its `bottom`) | navy "Navy jackets" 60, sunset "Sunset stripes" 60 | — |
| `head` | **mixed** (each sailor's own hat), bandanas, caps | tricorns 80 | skull "Skull bandanas" — `boardings ≥ 15` |
| `sash` | **own**, gold, red, teal, purple | — | — |

Buying everything costs **1,200 gold**. With the defaults the crew looks exactly as today. Enemy crews are not
customisable: `enemyCrewOpts(typeName, seed)` gives each faction a look — cutter/privateer: mixed pirates in black and
red bandanas; prahu/junk: straw hats and kerchiefs; corsair: red bandanas, dark vests; man-o'-war: navy coats and
tricorns (marines); galleon: caps, yellow/red shirts (`man` build); raider: **horned helmets**, beards, fur-brown vests;
phantom: pale green skin `0x9fe0c0`, dark grey rags, no hats.

`captainOpts(look)` returns buildPerson opts: `{ kind: 'pirate' | 'woman', outfit: 'pirate', seed: 7, hat, coat: hex|null,
coatTrim: hex, beard: 'full'|'goatee'|'stubble'|'none'|'braids'|'handlebar', hair: hex, hairStyle, skin: hex,
eyepatch: bool, earring: true, pet: 'none'|'parrot', petColor: { body, wing, head }, shirt, stripes, shirt2, accent (sash),
pants, tool: 'none' }` — only hex values from cosmetics' own palette. `crewOpts(look, seed, baseOpts, hullPaint)` merges
the uniform over a sailor's own opts (`own`/`mixed` leave the base untouched). `hullPaint` is the `LOOKS.hull` entry main
passes in (cosmetics.js stays import-free).

### 7.10 How the looks are drawn — `src/people.js` extensions

All options optional; every existing call keeps its look (the determinism rule, §0.1). Still ONE SkinnedMesh per
person with ≤ 3 material groups (4 with a lantern); captain ≤ 12k triangles.

| New option | Effect |
|---|---|
| `outfit: 'pirate'` | pirate clothes on any body kind (trousers, boots, sash; no skirt/apron) |
| `hat`: `'bicorne' \| 'plumed' \| 'crown' \| 'horned'`, `hatColor` | bicorne (crescent worn sideways, cockade), plumed (tricorn + 3-blob curled feather), crown (gold, jewels in vertex colour), horned (Viking helmet) |
| `coat: hex \| null`, `coatTrim: hex` | coat painted on the torso lathe (open front strip), lapels and cuffs in the trim colour, 6 gold buttons, **coat tails** on the `skirt` bone (knee length, swing when walking/running) |
| `beard` (a string) | `'full' \| 'goatee' \| 'stubble' (painted) \| 'braids' (two braid tails with gold beads) \| 'handlebar' (big curled moustache) \| 'none'`; booleans still accepted |
| `hair: hex`, `hairStyle` | hair colour and style (`crop`, `long`, `ponytail`, `bald` for any kind) |
| `stripes: bool`, `shirt2: hex` | exposes what `resolveLook` already does |
| `pet: 'parrot'`, `petColor` | a parrot on the left shoulder on a new `pet` bone under `torso`; head bob every 3 s, wing flap in `'cheer'` and `'run'` |
| `tool`: `'cutlass' \| 'tape' \| 'scissors'` | curved blade with a brass guard; tailor's tape; barber's scissors |
| `share: true` | geometry taken from a cache keyed by the resolved look; only new bones and a `Skeleton` are built; `disposePerson` decrements a reference count; `releaseSharedPeople()` empties the cache (main calls it on level change) |

New actions (deterministic, transform-only, added to `ACTIONS`): `'run'` (stride 0.8 rad, lean 0.2, arms pumping;
`walkSpeed(p, 'run', tempo)` supported), `'proud'` (hands on hips, chin up), `'steer'` (hands on wheel spokes,
`opts.turn` −1..1 turns them and leans the body), `'point'` (right arm thrust forward: "Fire!"), `'swing'` (both hands
up on a rope, knees tucked; the caller moves the group along the arc), `'fight'` (1.0 s guard → slash → recover loop with a
lunge, `opts.phase`), `'fall'` (flailing tumble, `opts.since`; the caller moves/rotates the group), `'surrender'` (hands up,
head down), `'haul'` (hand-over-hand on a rope), `'measure'`, `'snip'`.

### 7.11 Where the looks appear

| Where | Who | How |
|---|---|---|
| Town | the captain you walk | town.js |
| Polly's | captain on the podium + 3-sailor line-up | townMode |
| Dock | the six cleaning-crew sailors on your ship | `env.setCrewStyle()` |
| Battle | **your captain at the helm** of the Sea Biscuit (`userData.helm`), visible from the chase camera: `'steer'` with the turn input, `'point'` for 0.6 s after each player broadside, `'cheer'` for 1.5 s on SUNK!/CAPTURED! (+5 draw calls) | main; built at `startLevel`, child of `player.mesh`, **detached and `disposePerson`'d before `disposeShip`** |
| Battle | **every boarding party**: captain + up to 4 uniformed sailors with cutlasses | boarding.js |
| Battle | sailors tumbling overboard (enemy looks) | overboard.js |

---------------------------------------------------------------------------------------------------

## 8. Persistence (all new records validated like `parseShipConfig`; storage blocked → defaults for the visit)

| Key | Format | Validation (module) |
|---|---|---|
| `pirates-ahoy-ship` | **unchanged** | upgrades.js, unchanged (its tests are untouched) |
| `pirates-ahoy-unlocked` | integer | `loadInt(PROGRESS_KEY, 1, LEVELS.length, 1)` → max 6 once Act II is in; old saves stay valid (a player who already beat the volcano replays it once to open Act II — README says so) |
| `pirates-ahoy-armory` (new) | `{"up":{"boarders":0,"cutlass":0,"grapple":0,"gunner":0}}` | `parseArmoryConfig(raw)` (armory.js): same rules as `parseShipConfig` — ≤ 64 KB, JSON + the plain-integer reviver, tiers plain integers clamped to `[0, maxTier]`, own properties only, hostile objects count as missing, unknown fields dropped, never throws |
| `pirates-ahoy-look` (new) | `{"v":1,"cap":{"hat":"tricorn","coat":"crimson","beard":"full","hair":"brown","hairstyle":"crop","skin":"s3","body":"broad","pet":"none","patch":"off"},"crew":{"shirt":"own","head":"mixed","sash":"own"},"own":["hat.plume","coat.black"]}` | `parseLook(raw)` (cosmetics.js): ≤ 16 KB; every slot must hold a known key of that slot, else its default; `own` = known **paid** ids only, deduped, ≤ 64; a worn paid item not in `own` → default; never throws. `sanitizeLook(look, feats)`: a worn trophy not earned → default. `serializeLook` writes exactly this shape |
| `pirates-ahoy-feats` (new) | `{"captures":3,"boardings":5,"rakes":41,"crits":12,"legend":0,"prizes":{"privateer":2,"galleon":1}}` | `parseFeats(raw)` (cosmetics.js): each counter a plain integer in `[0, 1_000_000]` (`legend` in `[0, 1]`), else 0; `prizes` keys must be enemy type keys (`FEAT_PRIZE_TYPES`, cross-checked against `SHIP_TYPES` by a Node test), values plain integers `[0, 9999]`; saved on capture, at level end, on pause, when the page is hidden and when leaving to the menu |
| `pirates-ahoy-tips` (new) | plain integer bitmask | `loadInt(key, 0, 255, 0)`; bits in §5.5 |

main.js gets one generic loader used for armory, look and feats: `loadRecord(key, parse, serialize)` (the
`loadShipConfig` pattern: read, parse, rewrite when `serialize(parsed) !== raw`) and `saveRecord(key, serialize, value)`.
Feats count: `captures` (ships captured), `boardings` (boardings that reached `brawl`, either side), `rakes` (player
balls that raked), `crits` (player crits), `legend` (the Phantom captured), `prizes[type]`.

---------------------------------------------------------------------------------------------------

## 9. Architecture

### 9.1 Modules (exact exports)

**`src/combat.js`** (new, pure)

```js
export const RANGE, RAKE, CRIT, EFFECTS, STATES, AMMO, AMMO_IDS, AMMO_SWAP, GHOST, CREW, BOARD, RAIDERS, CAPTURE; // §3.8
export function mulberry32(seed) → () => number
export function rangeMul(dist) → number
export function aspectOf(vx, vz, targetH) → { aspect: 'stern' | 'bow' | null, cos }
export function hitZone(along, len) → 'bow' | 'mid' | 'stern'
export function critChance({ critBase, aspect, dist }) → number
export function ammoUnlocked(id, unlockedLevel) → boolean
export function shotResult({ ammo, base, dist, vx, vz, target: { h, len, ghost, boss }, along,
                             shooter: { player, critBase, enemyRake }, rng, force = null }) →
  { dmg, rangeMul, aspect, aspectMul, pointBlank, crit, critEffect, zone, crewKill, slow, tags }
     // force: null | 'none' | 'crit' | 'rudder' | 'mast' | 'keg' | 'routed' (tests); enemies never crit
export function effectFor({ ammo, zone }) → 'rudder' | 'mast' | 'keg' | 'routed'
export function crewNow({ crew0, hpLow, maxHp, killed }) → integer ≥ 0
export function strikeAt(crew0) → integer
export function boardingOdds(att, def, { heave = 0, enemyAttacks = false, home = false } = {}) → { P, M, D, R }
export function resolveBoarding(att, def, { heave = 0, enemyAttacks = false, home = false, playerAttacks = false,
                                            playerDefends = false } = {}) →
  { P, M, D, R, defLoss, attLoss, defLeft, attLeft, hullDmg, captured, overrun, attackerStrikes }
     // att/def: { crew, crew0, blade | grit, hpFrac }
export function previewLabel(result, { surrendered = false } = {}) → 'capture' | 'fight' | 'risky' | 'take'
export function captureGold(goldCoins) → number            // goldCoins × 20 + 25
export function plunderGold(levelGold) → number            // floor(0.25 × max(0, levelGold))
```

**`src/armory.js`** (new, pure; mirrors upgrades.js)

```js
export const ARMORY;                                       // §4 table, display order, each { id, name, blurb, stat, values, costs, extra? }
export function defaultArmoryConfig(), parseArmoryConfig(raw), serializeArmoryConfig(cfg)
export function armoryMaxTier(id), armoryNextCost(cfg, id), armoryStatText(id, tier)
export function armoryStats(cfg) → { crew, blade, grappleRange, reel, critBase }
```

**`src/cosmetics.js`** (new, pure)

```js
export const PALETTE;                                      // named hex colours used by items
export const SLOTS = { captain: ['hat','coat','beard','hair','hairstyle','skin','body','pet','patch'], crew: ['shirt','head','sash'] };
export const ITEMS;                                        // { 'hat.plume': { slot, key, name, price?, trophy?: { feat, min, text }, swatch: [hex…] }, … }
export const FEAT_IDS = ['captures','boardings','rakes','crits','legend'];
export const FEAT_PRIZE_TYPES = ['cutter','privateer','prahu','junk','corsair','manowar','inferno','galleon','raider','phantom'];
export function defaultLook(), parseLook(raw), serializeLook(look), sanitizeLook(look, feats)
export function defaultFeats(), parseFeats(raw), serializeFeats(feats)
export function itemState(look, feats, purse, id) → { worn, owned, free, price, affordable, locked, lockText, label }
export function wear(look, feats, id) → { ok, look, reason: 'unknown' | 'not-owned' | 'locked' }   // never mutates look
export function buy(look, purse, id) → { ok, look, cost, reason: 'unknown' | 'owned' | 'free' | 'trophy' | 'poor' }
export function surprise(look, group, rng) → look         // free options of 'captain' or 'crew' only
export function captainOpts(look, trial = null) → buildPerson opts      // trial: an item id worn just for the preview
export function crewOpts(look, seed, baseOpts, hullPaint, trial = null) → buildPerson opts
export function enemyCrewOpts(typeName, seed) → buildPerson opts
```

**`src/walk.js`** (new, pure)

```js
export function createWalk(data /* env.walk */) → {
  inside(x, z) → boolean,                     // centre on an area or within hw of a link polyline
  heightAt(x, z, yHint = null) → number | null,   // overlapping surfaces: the one closest to yHint
  blocked(x, z, r, dynamic = []) → boolean,   // inside a blocker inflated by r (or a dynamic {x, z, r})
  move(from /* {x, z, y} */, dx, dz, r, dynamic = []) → { x, z, y, moved },
      // full step if inside && !blocked && |Δy| ≤ 0.35; else x-only; else z-only; else stay
  nearestPlace(x, z) → { place, dist } | null,      // within place.r
  path(from, to) → [{ x, z }],                // A* over the graph + string pulling; [] when unreachable
  snap(x, z, maxDist = 3) → { x, z } | null,
  pick(origin /* [x, y, z] */, dir /* [x, y, z] */) → { x, z } | null,   // ray vs walk surfaces
  graph → { nodes: [{ x, z }], edges: [[i, j]] },  // area centres, portal centres, link ends + every 1.5 u along links, places
}
```

**`src/mechanics.js`** (new, pure) — §6.3. **`src/act2.js`** (new) — `export const ACT2_LEVELS` (levels 4–6, §6.4–6.6;
imports the three env modules). **`src/levels.js`** (new) — `export const ACT1, LEVELS, WITH_ACT2` (§6.1).

**`src/shipTypes.js`** (extended in Stage 0) — §6.7.

**`src/ships.js`** (extended)

```js
// builders: galleon, raider, phantom (§6.7)
// every ship's group.userData adds:
//   deckY, railY, deckSpots: [{ x, y, z, h }] (≥ 4, ship-local, clear of masts/props; the player keeps its 6),
//   yardTips: { port: { x, y, z }, star: { x, y, z } } (main-course yard ends: rope anchors for swings),
//   hullSide: { z0, dz, half: number[] } (half-width sampled along z at y 0.9, for holes),
//   sailInfo: [{ mesh, top: boolean }], damageLevel: 0
// player only: helm: { x, y, z, h } (behind the wheel at (0, yq, cab.z1 − 1.0) facing +z), coils by opts.armory.grapple
export function buildShip(typeKey, opts)          // opts adds armory: { grapple } (player)
export function projectileMesh(ammoId) → THREE.Mesh     // cached geometry + shared material; caller adds/removes it
export function addHole(group, { z, y, side }) → void   // side: +1 starboard, −1 port (§0.1); ≤ 8, oldest reused
export function clearHoles(group) → void
export function setShipDamage(group, { level, mast }) → void   // level 0|1|2; mast true/false (top sail drop); cheap if unchanged
export function hoistFlag(group, kind /* 'white' | 'player' | 'own' */, flagLook = null) → void
```

**`src/people.js`** (extended) — §7.10; adds `releaseSharedPeople()`, the new actions in `ACTIONS`, tools in `TOOLS`.

**`src/audio.js`** (extended) — SFX `grapple, heave, clash, cheer, capture` (stinger), `crit, rake, chain, grape, cut,
crunch, thunder, step, overboard, ghost`; scenes `doubloon, frost, maelstrom, town` (town = the menu tune with harbour
ambience: gulls, creaks); entries in `SFX_NAMES`, `SCENE_NAMES`, `SFX_CAP`, `SFX_GAIN`.

**`src/env/doubloon.js`, `frost.js`, `maelstrom.js`** (new) — the env contract of `europe.js` (`meta`, `palette`,
`build(scene, ctx)` → `{ worldRadius, colliders, playerStart, enemySpawns, reefs, update(t, dt, ctx), dispose(), group }`)
plus: doubloon `escapes`, `convoyStarts`; frost ice floes in `reefs` + `step(simTime, dt)`; maelstrom `current`, `flash(x, z)`.

**`src/env/sparrow.js`** (extended) — returns `walk`, `setCrewStyle(fn)`, `folk()`, `greet(index, seconds)`,
`cull(x, z, radius)`, `setPrizes(list)`; Polly's shop and NPCs; everything else unchanged (`view`, `berth`, `setShip`,
`peopleCount`, the crew placement).

**`src/tags.js`** (new)

```js
export function createTags(scene) → {
  add(ship) → tag, remove(ship),
  update(ships, camera, t, dt),   // per frame: billboard, scale, hull fill + lagging ghost, pips + notch (one InstancedMesh), icon
  dispose()
}
// reads per ship: hp, maxHp, crewShown (number, may be fractional during a brawl), crew0, strikeAt, tagIcon
//   ('capture' | 'fight' | 'risky' | 'white' | 'hot' | null), tagPulse (bool), flash, and fighting/surrendered/captured/sinking flags
```

**`src/pops.js`** (new) — `createPops(layerEl, camera, { reducedMotion }) → { pop(text, x, y, z, style), update(dt), clear(),
get count }`; styles `dmg | rake | crit | crew | info | capture | gold | bad`; ≥ 24 px white text with a 3 px ink outline
(classes in **`fx.css`**).

**`src/overboard.js`** (new) — `createOverboard(scene, { foam, sfx }) → { prepare(optsList), throwOver(ship, side, opts),
showSurrender(ship, opts), clearSurrender(ship), update(t, dt), clear(), dispose() }`: a pool of 5 people (people.js,
`share: true`, scene children placed from the ship transform each frame) that tumble off the rail (`'fall'`, 0.8 s arc)
and splash, or stand on a struck ship's `deckSpots` in `'surrender'` (at most 2 per ship, one struck ship at a time);
hidden when idle (0 draw calls).

**`src/boarding.js`** (new; THREE; imports `three`, `./people.js`, `./combat.js`)

```js
export function createBoarding(ctx) → {
  prepare({ captain, crew: [opts ×4], raiders: [opts ×4] | null }),   // level start: prebuild hidden, one per frame
  start({ kind: 'attack' | 'defend' | 'surrender' | 'counter', enemy, side, reel, getSides }) → boolean,
      // getSides() → { att, def, attIsPlayer } fresh snapshots; called at the start of 'swing'
  step(dt),            // SIMULATION time: phases, reel/glue (writes the two ships' x/z/h/speed), heave/cut timers
  render(t, dt),       // visuals only: hooks, ropes, swings, brawl poses, falls, particles
  camera() → { pos, look, blend } | null,
  heave() → number, cut() → boolean, cutHold(down /* bool */), skip(), cancel(reason),
  onResolve(fn), onResult(fn), onPip(fn), onCut(fn), onEnd(fn),
  get active, get phase, get kind, get target, get truce, get locked, get heave, get last, get counterUntil,
  dispose()
}
// ctx: { scene, player: () => player, sfx(name, x, z), particles: { puff, foam, spawnParticle }, reducedMotion(),
//        hideHelm(on), enemyCrewOpts(typeName, seed), pops }
```

**`src/town.js`** (new; THREE; imports `./walk.js`, `./people.js`)

```js
export function createTown({ scene, camera, walkData, audio, reducedMotion, env }) → {
  setCaptain(opts),                 // (re)build from buildPerson opts, disposing the old one
  enter(at = 'spawn' | placeId, { swoopFrom } = {}), exit(),
  setMove({ x, z, run }), walkTo(x, z) → boolean, goTo(placeId) → boolean, cancelAuto(),
  pick(ndcX, ndcY) → { x, z } | null, drag(dxPx, dyPx), recenter(),
  update(dt, t) → { place, arrived, moving },   // also drives the walk camera
  pose(viewName) → { pos, target } | null,
  frameBeside(panelEl, points),     // lens shift so `points` sit in the free area beside panelEl
  simulate(seconds, input),         // fixed-dt stepping for tests (no rendering)
  get captain /* { x, y, z, h, mesh } */, get walk, dispose()
}
```

**`src/townMode.js`** (new; DOM + glue for every non-shop dock view; styles in **`town.css`**)

```js
export function createTownMode(ctx) → {
  get view /* 'shop' | 'town' | 'tailor' | 'tavern' */, get active,
  ashore(), showShop(), open(placeId), back(), close(),
  onKey(e, down) → handled, onPointer(type, e) → handled,
  update(dt, t) → handlesCamera, onResize(), onContextRestored(),
  api   // test hooks used by __game.town / __game.wardrobe
}
// ctx: { scene, camera, canvas, env: () => env, ui: { townScreen, wardrobeScreen, tavernScreen, harbourDialog, aboardDialog,
//        dockScreen, ashoreBtn },
//   look: { get(), set(look) }, feats: () => feats, wardrobe: { wear(id), buy(id) },     // persistence lives in main
//   purse: () => state.purse, armory: { config(), buy(id) }, hullPaint: () => findLook('hull', shipConfig.look.hull),
//   exits: () => [{ action, label }], leaveDock(action), showShipyard(), hideShipyard(), setLens(),
//   openModal, closeModal, activeModal, announce(text), audio, isTouch(), reducedMotion(), rumour(), log() }
```

### 9.2 What main.js gets (integration points, by function)

| Where | Change | Stage |
|---|---|---|
| imports / state | `LEVELS` from levels.js; combat, armory, cosmetics, tags, pops, overboard, boarding, mechanics (stage 2), townMode (stage 3); `state.ammo, crew, crewMax, captures, boardCooldown, counterUntil, hitStop`; `armory`, `look`, `feats`, `tips`; `combatRng = mulberry32(seed)` reseeded at `startLevel` (`n × 7919 + 13`) | 0 / 2 |
| `fighting(e)` | `e.hp > 0 && !e.captured && !e.escaped && !e.surrendered`, replacing every "still in the fight" `e.hp > 0`: `damage()` left count, `step()` attackers + alive, `updateHud` alive, `inArc`, `playerFire`, `updateCamera` side-look, `drawMinimap`, `updateHints` near. Boss bar: `boss && hp > 0 && !captured && !escaped`. Attack slots also exclude `type.merchant`. | 0 (helper), 2 |
| `createShip` | `crew0, killed: 0, hpLow, crewShown, tagIcon, tagPulse, effects: { slow, slowTurn, mast, rudder, burn }, lastEffectAt, surrendered, captured, escaped, removeAt, boardCooldown, hitsBySide: { port, star }, reloadMax: { port, star }, rise`; tag via `tags.add`; player: helm captain | 2 |
| `removeShip` | detach + `disposePerson` the helm captain before `disposeShip`; `tags.remove` | 2 |
| `fire()` | ammo (player: `state.ammo`; enemies `'round'`), range clamp, spread × `spreadMul`, `reloadMax`, `projectileMesh`, ball gets `ammo, ox, oz`; refuses while: player and `boarding.active` (except raider `threat`), enemy and (`boarding.truce`, is the boarding target, surrendered/captured, or `mechanics.holdFire(e)`) | 2 |
| `inArc(ship, e, side, range = MAX_RANGE)`, `playerFire` | ammo range; RAKE! cue computed alongside | 2 |
| `hitsShip` | per-ammo pad/top; never hits captured / surrendered / escaped ships | 2 |
| `updateBalls` | `shotResult` → `damage(s, info.dmg, x, z, src, info)` | 2 |
| `damage(ship, amount, x, z, source, info?)` | **signature kept** (tests call `damage(e, 9999)`); `hpLow`; `minHp` floor for an active ghost; with `info`: crew kills, effects (respecting the 3 s gap), slow, holes, pops, volley tags, feats, hit-stop, overboard; surrender check after any crew change; sinking → `mechanics.onSink` | 2 |
| `volleyDone` | hitmark main text + stickers; summed damage pop | 2 |
| `updatePlayer` | no turning while `boarding.locked`; turn and speed effects; wave refill +3 crew in `spawnWave` | 2 |
| `updateEnemy` | `mechanics.steer` override; effect multipliers; surrendered → drift ≤ 1.5, no AI; captured → sail for the nearest edge at 7; raider AI + boarding attempts; skipped for the boarding target during `reel..result`; `mechanics.avoid()` circles avoided | 2 |
| `speedCap`, `steerToward` | ice reefs ×0.55 for all; min-of-active effect multipliers | 2 |
| `moveShip` | `mechanics.drift`; skips the glued pair during `swing..result` | 2 |
| `separateShips` | skips captured/escaped ships and the boarding pair | 2 |
| `step()` | `env.step?.(state.time, dt)`; effects/burn ticks; `boarding.step(dt)`; `mechanics.step(dt)`; bombs paused during truce; capture sail-away and removal at `removeAt`; `e.rise` countdown; counter-board window; level clear also auto-captures surrendered ships | 0 (env.step) / 2 |
| bombs | generalised by `kind` (§6.2) | 2 |
| `spawnWave` | `mechanics.onSpawn`; +3 crew on reinforcements | 2 |
| `startLevel` | ammo reset, crew full, `boarding.prepare`, `mechanics = createMechanics(def.mechanics, ctx)` + `init`, helm captain, `releaseSharedPeople()` on level change, reseed `combatRng` | 2 |
| `finishLevel` | `def.finale`; unlock next even at a finale; prize + mechanic bonuses; summary lines; feats save | 0 (finale) / 2 |
| `syncShip` | list, sit-lower, rise offset, `setShipDamage` on thresholds; tags moved to `tags.update` | 2 |
| `updateHud` | §5.3 elements; reload bars use `reloadMax`; preview/target computation | 2 |
| `drawMinimap` | galleons gold squares, gates green rings, surrendered white, floes pale blue, vortex rings | 2 |
| input | G / R / 1–3 (§5.1); `TAP_ACTIONS.ammo/board`; hold-to-cut listeners; Space/Enter skip in `brawl` | 0 (no-op stubs) / 2 |
| `frame()` | hit-stop dt scaling; `boarding.render`; `tags.update`; `pops.update`; `overboard.update`; camera override from `boarding.camera()`; townMode | 2 / 3 |
| acts | level cards (§5.6), `#act2-btn`, won text, Enter on won, `dockExits()` | 0 (`dockExits`, finale) / 3 |
| dock / town | `#dock-ashore-btn`; key/pointer delegation to `townMode` when `view !== 'shop'` (the canvas drag of the showcase only in `'shop'`); `townMode.update` drives the camera outside `'shop'`; Esc closes the Harbour/aboard dialogs; `onContextRestored` → `townMode.onContextRestored()` outside `'shop'`; `env.setCrewStyle` on every `openDock`; `buyArmory`, `wardrobe.wear/buy` persistence | 3 |

### 9.3 Test API (`window.__game` additions; Stage 0 adds placeholders returning safe defaults)

```js
combat: { rules /* combat.js exports */, get ammo, setAmmo(id) → bool, cycleAmmo(), get unlockedAmmo,
          seed(n), forceCrit(kind | null), get log /* last 40 shot results with positions */, setCrew(ship, n) },
grapple() → { ok, reason },
boarding: { get active, get phase, get kind, get target, get heave, get last, odds(enemy) → result + label,
            heavePress(), cut(), cutHold(down), skip(), resolveNow() /* jump to and apply 'result' */ },
get crew → { crew, max },
fighting(e),
spawn(typeName, x, z, h) → enemy, place(ship, x, z, h),
mechanics: { get state },
armory: { get config, set(cfg) /* validated, saved */, buy(id) },
get feats, setFeats(f) /* validated, saved */, get look, get tips,
setShipConfig(cfg) /* validated, saved, player rebuilt at the next level */,
wardrobe: { wear(id) → { ok, reason }, buy(id) → { ok, reason } },
dock: { …existing, get view, ashore(), back() },
town: { get active, get view, get pos, get place, get walk /* the walk data */, get captain /* mesh */,
        setMove(x, z, run), walkTo(x, z), goTo(id), interact(), open(id), back(), simulate(seconds, input) },
```

---------------------------------------------------------------------------------------------------

## 10. Staged build plan (disjoint file ownership inside every stage)

Rules for every agent: read §0 and the sections your files implement; edit **only** your owned files (create new files
only if they are listed for you); test pure modules with Node (`node tests/<x>.test.cjs`) and visual work in a harness
page under `.dock-harness/` with screenshots at 1280×720 and 390×844 (SwiftShader, `?quality=low`); report draw calls for
anything that renders. If you need a change in a file you don't own, write it down in your final report as a **hook
request** (file, function, exact change); the owner of that file in the next stage applies it. **Keep every owned file
importable at all times** (`main.js` → `levels.js` → `act2.js` → the env modules load on every page, so a syntax error
in one breaks every other agent's test runs): write a module in one go, or develop it as a copy under `.dock-harness/`. Nobody edits `vendor/`,
adds dependencies, commits or pushes. A stage ends when its exit check passes; the coordinator then starts the next.

### Stage 0 — Scaffolding (1 agent, no behaviour change)

| Agent | Owns | Work |
|---|---|---|
| **0 Integrator** | `src/main.js`, `index.html`, `style.css`, `src/levels.js` (new), `src/shipTypes.js`, new **stub** files `src/act2.js` (`export const ACT2_LEVELS = []`), `src/env/doubloon.js`, `src/env/frost.js`, `src/env/maelstrom.js` (each a valid empty sea: `meta`, the §6.4–6.6 `palette`, `build()` returning `worldRadius`, no colliders, a `playerStart` and 6 `enemySpawns` on a ring of radius 75), `src/tags.js`, `src/pops.js`, `src/overboard.js`, `src/boarding.js`, `src/mechanics.js`, `src/townMode.js` (each exporting its final API from §9.1 as a null object), empty `fx.css`, `town.css` | 1. Move `LEVELS` to `src/levels.js` with the §6.1 fields (`ACT1`, `LEVELS`, `WITH_ACT2`); main uses `def.scene` and `def.finale` (identical results with 3 levels). 2. Add `fighting(e)` and use it where §9.2 says (identical results today). 3. `dockExits(from)` replaces `DOCK_EXITS[...]` lookups. 4. Call `env.step?.(state.time, dt)` in `step()`; `env.update(t, dt, { simTime: state.time, camera })`. 5. Add `crew`/`grit`/flags and the three new types to `shipTypes.js` exactly as §6.7. 6. `index.html`: every new element of §5.3, §5.2 (`.pad.act` with `#touch-ammo`, `#touch-board`), §5.6 (`#won-text`, `#act2-btn`), §7.1 (`#dock-ashore-btn` in `.dock-head` before the tablist), and the new overlays `#town-screen`, `#wardrobe-screen`, `#tavern-screen`, `#harbour-dialog`, `#aboard-dialog` (class `overlay`, `hidden`, **placed before `#recover-screen`** so the recovery dialog stays on top and so the inert `backdrops` list built at load includes them), with the ids listed in §9 and Appendix A; `<link>`s to `fx.css` and `town.css` after `style.css`. 7. `TAP_ACTIONS.ammo/board` no-op stubs. 8. `loadRecord/saveRecord`. 9. `__game` placeholders (§9.3). **Exit:** `npm test` green with **no** test edits; draw calls within ±2 of today. |

### Stage 1 — Foundations (11 agents in parallel; main.js untouched)

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **1A Combat rules** | `src/combat.js`, `tests/combat.test.cjs` | §2, §3 formulas and constants (§3.8, §9.1) | Node tests of §11.1 green; every worked example of §2.1 and §3.3 reproduced exactly |
| **1B Economy** | `src/armory.js`, `src/cosmetics.js`, `tests/armory.test.cjs`, `tests/cosmetics.test.cjs` | §4, §7.9, §8 records | Node tests green (garbage battery as thorough as `upgrades.test.cjs`) |
| **1C Characters** | `src/people.js` | §7.10 options, hats (bicorne, plumed, crown, horned), coat + tails, beards, hair styles, parrot, tools (cutlass, tape, scissors), 11 actions, `share` cache | harness grid of looks × actions at 3 zooms; existing people unchanged (seeded looks identical: a harness compares `userData.look` of seeds 1–400 before/after); ≤ 3 material groups; existing dock tests green |
| **1D Shipwright** | `src/ships.js` | §6.7 models; §9.1 userData + `projectileMesh/addHole/clearHoles/setShipDamage/hoistFlag`; helm spot; coils by `opts.armory.grapple` | harness: each new ship at 3 angles, damage levels 0–2, mast drop, holes, white/player flags; draw calls per model reported; existing ship + dock tests green (gun-port counting must still find the cannons) |
| **1E Sound** | `src/audio.js` | §9.1 SFX and scenes | offline renders finite, stereo, non-silent for every new name; existing smoke audio checks green |
| **1F Env: Doubloon Bay** | `src/env/doubloon.js` | §6.4 | harness flight from the chase-camera height; env alone ≤ 220 draw calls; layout rules of the smoke "level layouts are sane" check (spawns ≥ 6, open water, ≥ 35 from the start, inside `worldRadius − 16`); gates within 125 |
| **1G Env: Frostbite Straits** | `src/env/frost.js` | §6.5 | as 1F; floes deterministic in `simTime`, never enter colliders |
| **1H Env: The Maelstrom** | `src/env/maelstrom.js` | §6.6 | as 1F; `flash()` respects the photosensitivity caps (§13) |
| **1I Town world** | `src/env/sparrow.js`, `src/walk.js`, `tests/walk.test.cjs`, `tests/fixtures/sparrow-walk.json` (dumped by a harness from the live `env.walk`) | §7.4, §7.5 data and art, `setCrewStyle`, `folk/greet/cull/setPrizes`, `?walkdebug` lines drawn by a harness | Node walk tests green on the fixture; every place reachable from spawn; harness screenshots of the walk view from 6 spots (no holes or open backs); dock draw calls ≤ 450 in the shipyard view; existing dock tests green |
| **1J Act II rules** | `src/mechanics.js`, `src/act2.js`, `tests/mechanics.test.cjs` | §6.3 hooks (Node-tested with a mock ctx), §6.4–6.6 level definitions | Node tests: convoy picks the far gate, escapes at the gate, zig-zags, holds fire; floes crunch with cooldown; current drift formula and eye damage; bonus/objective strings |
| **1K Feedback** | `src/tags.js`, `src/pops.js`, `src/overboard.js`, `fx.css` | §5.4, §2.5 pops, overboard pool | harness with 6 fake ships: tags at all distances (pips, notch, ghost lag, icons), pops at 3 sizes and reduced motion; draw calls: +1 per tag + 1 for all pips |

### Stage 2 — Battle systems (4 agents)

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **2A Integrator (battle)** | `src/main.js`, `index.html`, `style.css`, `src/levels.js` | everything marked "2" in §9.2: damage pipeline, ammo, crew, effects, visible damage, HUD (§5.3), tags/pops/overboard wiring, hitmark, tips, captain at the helm, boarding wiring to the `boarding.js` API (works with the stub until 2B lands, then for real), raiders, capture/surrender economy, bombs by kind, mechanics hooks (Act II playable with `?act2=1`), persistence of armory/look/feats/tips, test API | **the existing `npm test` green with no test edits**; `tests/battle.cjs` (2D) green; levels 1–3 play with the new systems |
| **2B Boarding** | `src/boarding.js` | §3.4–3.6 timelines, glue/reel, visuals, camera pose, prebuild/lazy build | harness with two real ships: attack, defend (cut by taps / hold / hit, and fought), counter, surrender; screenshots of each phase at 1280×720 and 390×844; ≤ 45 extra draw calls at the peak |
| **2C Town** | `src/town.js`, `src/townMode.js`, `town.css` | §7.1–7.3, §7.6–7.8: controller, camera, joystick, tap-to-walk, places bar, prompt, Harbour menu, All aboard dialog, wardrobe (try-on, Surprise me!, line-up, Match the ship's paint), tavern | harness page with sparrow + people + cosmetics + armory and a mock ctx: walking with keys/stick/taps, every place, every panel at the 7 town sizes (no page scroll, ≥ 44 px, contrast ≥ 4.5:1); walk-view draw calls ≤ 450 at 6 spots |
| **2D Battle tests** | `tests/battle.cjs` (new), `package.json` | §11.2 battle suite against the §9.3 API; `npm test` runs the five new Node suites first, then the existing ones, then `battle.cjs` (§11.4 order without `levels`/`town`), plus `test:<name>` scripts | runs green against 2A's final work |

### Stage 3 — Act II and the town go live (5 agents)

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **3A Integrator (acts & town)** | `src/main.js`, `index.html`, `style.css` | everything marked "3" in §9.2: townMode wiring (Go ashore, views, key/pointer/camera routing, Esc for dialogs, context restore), `buyArmory`, wardrobe persistence, `setCrewStyle` on dock open, level cards in two acts, `#act2-btn`, won text, Enter on won | full suite green (with 3C's updates) |
| **3B Balance & levels** | `src/levels.js`, `src/act2.js`, `src/mechanics.js`, `src/combat.js`, `src/shipTypes.js`, `src/armory.js` | sets **`WITH_ACT2 = true`**; tunes numbers only in their tables (§6.8 order) until the Act II bot passes; updates the Node tests it breaks (`tests/combat.test.cjs`, `tests/mechanics.test.cjs`, `tests/armory.test.cjs` — it owns them this stage) | Node suites green; bot results reported |
| **3C Tests** | `tests/smoke.cjs`, `tests/controls.cjs`, `tests/battle.cjs`, `tests/town.cjs` (new), `tests/levels.cjs` (new), `package.json` | §11.3, §11.4 exactly | the whole suite green |
| **3D Town polish** | `src/env/sparrow.js`, `src/walk.js`, `src/town.js`, `src/townMode.js`, `town.css`, `tests/walk.test.cjs`, `tests/fixtures/sparrow-walk.json` | fixes from in-game walk screenshots (holes, backs, blockers), hook requests from 3A | walk tests and `tests/town.cjs` green |
| **3E Art fixes** | `src/people.js`, `src/ships.js`, `src/env/doubloon.js`, `src/env/frost.js`, `src/env/maelstrom.js`, `src/boarding.js`, `src/tags.js`, `src/pops.js`, `src/overboard.js`, `fx.css`, `src/audio.js` | fixes from in-game screenshots and the draw-call audit | budgets of §12 met |

### Stage 4 — Verification and polish (1 integrator + read-only reviewers)

One agent owns every file. Full suite; draw-call audit (every level start, a boarding on each level, the town at 6
spots, Polly's, the tavern); accessibility audit (§13); small-screen layouts; cut decisions (§15); **README**: levels,
Act II, controls (battle + town), the tavern and tailor tables, saves, tests.

### Dependency graph

```
Stage 0 ─▶ everything.
1A ─▶ 2A, 2B, 2D        1B ─▶ 2A, 2C        1C ─▶ 2B, 2C, (1I optional tools)      1D ─▶ 2A, 2B
1E ─▶ 2A                1F–1H ─▶ 1J (file names only), 2A (?act2=1)                  1I ─▶ 2C
1J ─▶ 2A                1K ─▶ 2A
2A, 2B ─▶ 2D's final run;   2A, 2B, 2C ─▶ 3A, 3C;   2C ─▶ 3D
```

---------------------------------------------------------------------------------------------------

## 11. Test plan

Browser suites load `?quality=low`, freeze the real-time loop and drive the
simulation with `G.step(1/120)` like `smoke.cjs` (render only for screenshots and draw counts), use `G.combat.seed()` /
`forceCrit()` for determinism, and stay under ~6 minutes each on SwiftShader. Every new suite watches page errors like
the existing ones.

### 11.1 Node (fast, first in `npm test`)

- **`tests/combat.test.cjs`** — `rangeMul` at 0, 10, 12, 14, 24, 26, 29, 30, 34, 40 (values in §2.1); `aspectOf` at 0°, 36°,
  37.5°, 90°, 143°, 180° (stern / boundary / broadside / bow); `hitZone` boundaries at ±len/6; `critChance` sums and the
  0.35 cap; `shotResult` for each ammo (hull factors, grape crew 1 / 2 on a rake, chain `slow`), enemy shots never crit and
  scale by `enemyRake`, ghost ×0.5 for round/chain and ×1 for grape; `force` values; seeded RNG deterministic;
  `crewNow` never below 0, never resurrects (uses `hpLow`), hull alone never takes more than half; `strikeAt` for 8, 12,
  24; `resolveBoarding`: **every worked example of §3.3 exactly** (P, M, D, R to 3 decimals; losses; captured / overrun /
  attackerStrikes), monotonicity (lower defender hp → `defLoss` never smaller; more crew or blade → never smaller), caps
  (player never loses the whole crew, attacking or defending), `R = ∞` for a 0-crew defender; `previewLabel` at
  R 1.199 / 1.2 and on the capture boundary; `captureGold` table (§3.7); `plunderGold`; finite results for garbage input.
- **`tests/armory.test.cjs`** — table, defaults, max tiers, costs (total 4,600), `armoryStats` at every tier,
  `armoryStatText`, and the full hostile-storage battery from `upgrades.test.cjs` (cut JSON, arrays, `__proto__`,
  `constructor`, throwing getters and proxies, megabytes, deep nesting, `1e1`, `2.0`, `2.5`, `Infinity`, negative, `null`,
  digit strings) → valid config field by field, never a throw; round trips.
- **`tests/cosmetics.test.cjs`** — ids unique and `slot.key`-shaped; every slot exactly one free default; paid total
  1,200; every trophy names a `FEAT_IDS` entry; `FEAT_PRIZE_TYPES` equals the enemy keys of `SHIP_TYPES` (loads
  shipTypes.js too); `parseLook` / `parseFeats` with the same garbage battery; wearing an unowned paid item or an
  unearned trophy refused and sanitised away on load; `buy` refuses when poor / owned / free / trophy; `surprise` touches
  free options of one group only; `captainOpts` / `crewOpts` / `enemyCrewOpts` emit only option names and values people.js
  accepts (a hard-coded list mirrored from §7.10) and only hex numbers; the default crew look leaves base opts unchanged.
- **`tests/walk.test.cjs`** — on `tests/fixtures/sparrow-walk.json`: spawn and every place inside; every place reachable
  from spawn and from each other (`path` non-empty, continuous, every 0.25 u inside and unblocked); 10,000 seeded random
  `move` calls never leave the walk, never enter a blocker, never step more than 0.35 in y; `pick` hits and misses;
  synthetic shapes: an L-shaped pair of rects, a rotated rect, a circle, a sagging bridge (height interpolated), two
  islands (`path` → `[]`).
- **`tests/mechanics.test.cjs`** — with a mock ctx: convoy gate choice, cruise/flee speeds, zig-zag period, hold-fire rule,
  escape at the gate, objective/summary/bonus strings; floes crunch once per 1.5 s and only above speed 6; current drift
  at d 20, 40, 74, 76 (zero outside r), eye damage 5 hp/s, ghosts ignored, `avoid()` circle.

### 11.2 `tests/battle.cjs` (new, Stage 2; runs on levels 1–3; raiders, galleons and the Phantom are spawned with `G.spawn`)

- **Damage variety:** with the seed fixed and `forceCrit('none')`, a target stern-on takes 2.0× the beam-on damage at the
  same range, bow-on 1.5×; range multipliers recorded in `G.combat.log` at 8 / 18 / 30 u are 1.25 / 1.0 / 0.85; a forced
  crit applies its effect (rudder: turn ×0.25 for 6 s; mast: speed cap halved, `damageLevel`/top sail dropped; keg: +12
  then burn ticks; routed: +2 crew killed); an enemy's stern rake on the player on L1 is ×1.4.
- **Ammo:** locked before progress (keys ignored with the hint reason, cells hidden), unlocked with `state.unlocked`;
  R cycles, 1/2/3 pick, the touch Ammo pill cycles; swap sets reload ≥ 0.5; chain slows the target's cap to 55 % for 6 s;
  grape kills `guns` crew per full volley at ≤ 20 u (+1 per ball on a rake) and barely dents the hull; ranges enforced;
  "port broadside fires N balls" still true for every ammo.
- **Crew:** `crewNow` follows the hull (half at most); the tag's pip count equals `10 × crewNow / crew0` (read from the
  pip InstancedMesh colours); grape to the notch → surrender (white flag, out of `fighting()`, balls pass through, minimap
  white); level clear auto-captures it; +3 crew on reinforcements; full crew at a new level.
- **Boarding:** each refusal reason (range, cooldown, crew, immune Molten Maw, busy); G and a tapped Board pill (exactly
  one grapple per tap; Enter/Space on the focused pill too) start it; phases in order with the §3.4 durations (± one
  substep); the target ends alongside and parallel; **no enemy ball is fired and no bomb advances during the truce**;
  outcome equals `G.boarding.odds()` for the same state with the presses made (heave 3 presses → 0.12; repeats ignored);
  hull drop `2 × defLoss`; the battered-privateer capture pays exactly **145** (sinking the same type pays 60); the
  captured ship leaves `fighting()`, waves still advance, it is removed after 5 s; surrender capture without a brawl;
  context loss during a brawl pauses it and Continue resumes at the same phase; Esc pauses; `separateShips` never pushes
  the glued pair apart; reduced motion (`emulateMedia`): the camera jumps (no intermediate poses).
- **Raiders (spawned with `G.spawn`):** 3 G presses cut; holding G 0.8 s cuts; a cannonball hit cuts; otherwise the
  defence result matches §3.3 examples 3/4 (crew, hull, plunder); counter-board window works for 3 s; a beaten raider at
  its notch is captured.
- **Phantom (spawned):** round shot ×0.5 while her crew stands; hull floors at 1 (spectral) and never sinks; grape to the
  notch → banished/surrendered → a grapple captures her (625 gold, `legend` feat saved).
- **HUD and layout:** crew chip text and aria-label; Board tag labels for capture/fight/risky; RAKE! tag when a target is
  end-on; boarding strip during a set-piece; the F01 layout probe at the 10 sizes still passes with the act pad and the new
  gun-card cells visible (chain unlocked); contrast ≥ 4.5:1 for the new small texts; a pop appears at an impact;
  `#game-live` announces a capture.
- **Audio:** offline renders of every new SFX are finite, stereo, not silent.
- **Draw calls:** ≤ 450 during a boarding on level 1 with wave 2 alive (two frames after `brawl` starts); screenshots
  `boarding-swing.png`, `boarding-brawl.png`, `damage-states.png`.

### 11.3 Stage-3 suites

**`tests/levels.cjs`** (new)
- 6 level cards in two act groups; only level 1 unlocked on a fresh profile; labels Easy…Legendary; card 4 locked text.
- Beating level 3 still gives `'won'` + the Victory screen; `#act2-btn` and Enter start level 4 with the voyage gold;
  the won screen's dock exits read "Set sail for Doubloon Bay | Back to the title"; after level 6 the legend text shows and
  `#act2-btn` is hidden.
- Per level: Doubloon Bay — galleons head for the far gate, a galleon placed at its gate escapes (removed, no gold,
  objective line updates), capturing one adds 525 + 150 at level end; Frostbite Straits — floes move with sim time, a
  fast ship crunching a floe takes 6 once per 1.5 s, ice slows a raider; The Maelstrom — a ship at r 40 drifts by the §6.3
  formula, a ship in the eye loses 5 hp/s, the Phantom rises, lightning warns then strikes (≤ 1 flash per 3 s; none under
  reduced motion).
- **Act II bot** (bot v2): mid-game profile set through `G.setShipConfig` (guns 1, shot 2, crew 2, hull 2, sails 1,
  carpenter 1) and `G.armory.set` (boarders 1, cutlass 1); it chases galleons first, uses chain beyond 18 u on fleeing
  ships, grape within 16 u on targets above their notch + 2, grapples when the preview says capture or the target
  surrendered, cuts ropes (3 presses), keeps out of r < 30 of the vortex, dodges warning rings like lava. Checks: levels
  4–6 each cleared within 900 s sim (a second try allowed), each fights back, **Maelstrom damage taken > Doubloon Bay**,
  never inside land.
- Draw calls at each Act II level start ≤ 310 and during a boarding ≤ 450; screenshots `doubloon.png`, `frost.png`,
  `maelstrom.png`.

**`tests/town.cjs`** (new)
- Shipyard → `#dock-ashore-btn` → view `'town'`, captain at spawn, camera behind, focus on `#town-screen`; Shift+Tab
  from the Upgrades tab reaches the button; from the town's Shipyard place back to `'shop'` with "Back to town".
- WASD and arrows move camera-relative; Shift sprints (speed ratio ≈ 4.6/3.0); 30 s of random keys and taps never leave
  the walk; the tavern building blocks.
- Each places-bar button walks to and opens its place (shipyard panel, tavern, wardrobe, All aboard dialog); a move key
  cancels auto-walk; E / Enter / Space at a place open it only when no button is focused; P/Esc open the Harbour menu
  (modal: labelled, Tab trapped, focus returns, Esc closes); the All aboard exits do what the shipyard's do for each origin.
- Touch: joystick drag moves, tap-to-walk moves, the action button opens the place; every town control ≥ 44 px.
- Wardrobe: wearing a free item rebuilds the captain (`userData.look` shows it) and saves `pirates-ahoy-look`; try-on of a
  priced item shows the Buy button and reverts on leaving; buying deducts the chest, saves, wears; poor → `aria-disabled`
  + reason, focus kept; double-click buys once; trophies locked until `G.setFeats` grants them; Surprise me! changes only
  free options; Match the ship's paint uses the hull paint; the cleaning crew on the docked ship changes shirts
  (vertex colours contain the shirt hex) and the default crew look leaves them exactly as before.
- Tavern: buying `boarders` raises `G.crew.max` at the next level start; `grapple` adds coils to the docked ship; rumour
  board names the next level; captain's log counts.
- The captain's look appears at the helm in battle and in the boarding party (look values on those people).
- Persistence: corrupt `pirates-ahoy-look` / `-feats` / `-armory` / `-tips` fall back and are rewritten; storage blocked
  still works for the visit.
- Layout at the 7 town sizes for the town HUD, wardrobe and tavern panels: no page scroll, nothing overlapping, ≥ 44 px,
  small text ≥ 4.5:1 (reuse the dock probes with the new roots); draw calls in the walk view ≤ 450 at 6 spots and in
  Polly's view; context loss in town returns focus to the town HUD; `M` mutes; screenshots `town.png`, `tailor.png`,
  `tavern.png`.

### 11.4 Existing assertions that change (Stage 3, agent 3C) — and only these

| File:line (today) | Today | Becomes |
|---|---|---|
| `tests/smoke.cjs:115` | `cards.length === 3` | `cards.length === 6` (message "6 level cards") |
| `tests/smoke.cjs:116` | `!cards[0].locked && cards[1].locked && cards[2].locked` | `!cards[0].locked && cards.slice(1).every((c) => c.locked)` |
| `tests/smoke.cjs:117` | Easy / Medium / Hard on cards 0–2 | also `/Tricky/`, `/Tough/`, `/Legendary/` on cards 3–5 |
| `tests/smoke.cjs:496` | `dock.exits === 'Back to the title'` | `dock.exits === 'Set sail for Doubloon Bay \| Back to the title'` |
| `tests/smoke.cjs:527` | draw-call loop `n <= 3` | `n <= G.LEVELS.length` (the `< 1600` check unchanged) |
| `tests/smoke.cjs:541` | bot loop `n <= G.LEVELS.length` | `n <= 3` (the Act I regression bot; Act II has its own bot in `tests/levels.cjs`) |
| `tests/smoke.cjs:613` | `unlockedCards === 3` | `unlockedCards === 4` (winning the Act I finale opens Doubloon Bay; the smoke run never clears Act II) |
| `tests/controls.cjs:369` | `'too large'`: `unlocked: 3` | `unlocked: 6` (a stored `'7'` clamps to `LEVELS.length`) |

**Additions** (no existing check changes): `tests/controls.cjs` `dockLayoutProbe` also `reach()`es `#dock-ashore-btn`;
the smoke "level layouts are sane" loop covers levels 4–6 automatically (it already iterates `LEVELS.length`).
**Unchanged and must pass as they are:** the tutorial hints, broadside count, HIT marker, loot value, reefs, pause/mute,
audio probes, the AI-hits check, retries, the 'won' after the Molten Maw (`smoke.cjs:469–472`), the finished-voyage test
(`controls.cjs:398–421`), `quit.unlocked === 3` (`controls.cjs:991`), the whole shipyard suite including its Tab orders
(`controls.cjs:1019–1021`, `1060`), the ship-config battery (`controls.cjs:1066–1133`, the v1 record is unchanged), the
layout counts `exits 2, buys 6, swatches 16` (`controls.cjs:1154`; the tavern and wardrobe live outside `#dock-panel`),
F01–F07, `tests/upgrades.test.cjs`, `tests/server.test.cjs`.

`package.json` `"test"`: `node tests/combat.test.cjs && node tests/armory.test.cjs && node tests/cosmetics.test.cjs &&
node tests/walk.test.cjs && node tests/mechanics.test.cjs && node tests/upgrades.test.cjs && node tests/server.test.cjs &&
node tests/smoke.cjs && node tests/controls.cjs && node tests/battle.cjs && node tests/levels.cjs && node tests/town.cjs`,
plus a `test:<name>` script for each.

---------------------------------------------------------------------------------------------------

## 12. Performance budgets (draw calls = `renderInfo.calls`, both outline passes, `?quality=low`, 1280×720)

| Scene | Budget | Today | Planned additions |
|---|---|---|---|
| Act I level start | ≤ 320 | 175–309 | helm captain +5, tags +1 each + 1 (pips) |
| L1 busiest (wave 2 + a boarding + damage states) | **≤ 450** | 309 | captain 5, boarding ≤ 45 (9 people) + ropes/hooks ≤ 6, tags ≤ 6 + 1 + icons ≤ 3, holes ≤ 6, overboard/surrender pool ≤ 25 → ≈ 406 worst case |
| Act II env alone | ≤ 220 | — | statics merged (`mergeStatic` / the sparrow vertex-colour bake); snow/rain one InstancedMesh each; aurora 3 meshes |
| Act II level start | ≤ 310 | — | env ≤ 220 + ships + captain + tags |
| Act II busiest | **≤ 450** | — | as L1; the phantom ≤ 1.3× a man-o'-war |
| Dock, shipyard view | ≤ 450 (existing test) | 298–300 | Polly's shop baked (+≤ 3), Polly + Snips +10, barber pole +2; no captain; prize ships hidden |
| Town walk view (6 spots) | **≤ 450** | — | captain 5, prize ships ≤ 50, townsfolk culled beyond 40 u |
| Polly's view | ≤ 450 | — | captain + 3 line-up sailors + 2 NPCs ≈ 30 |
| Per new ship model | ≤ the Man-o'-War's calls (phantom ≤ 1.3×) | — | — |
| Per person | 3 material groups (4 with a lantern); captain ≤ 12k triangles | — | `share: true` for repeated looks |

CPU: prebuild boarding people during the level fly-in (one per frame) and defenders during the reel (one per frame);
pips are one InstancedMesh; pops are DOM (0 calls); never raycast per ball (holes are placed analytically from
`hullSide`). If a budget is exceeded, drop in this order: prize ships, overboard tumblers, townsfolk beyond 30 u, rain
density, hole decals on far ships.

---------------------------------------------------------------------------------------------------

## 13. Accessibility requirements (checked in Stage 4)

- Every new control is a real `<button>` (or a tab) with a name, a visible focus ring (`:focus-visible` outline as today)
  and ≥ 44×44 px; states use icon + text + colour, never colour alone; out-of-reach buttons stay focusable with
  `aria-disabled` and a described reason (the shipyard pattern).
- Small text ≥ 4.5:1 (the `--*-text` tokens on paper); pop text ≥ 24 px white with a 3 px ink outline (large text ≥ 3:1 on
  any background); RAKE! is ink on gold (≈ 11:1).
- Live regions: `#game-live` (battle), `#town-live`, `#wardrobe-live`, `#tavern-live`, `#dock-live` — polite, throttled,
  de-duplicated like `announce()`.
- Modal dialogs (Harbour menu, All aboard) use `openModal/closeModal` (inert background, Tab trap, focus return);
  panels (wardrobe, tavern) are non-modal like the shipyard, with focus moved to their first tab on open.
- Keyboard and screen-reader users reach every place without free movement (places bar, Harbour menu) and every battle
  action by key; **mashing is never required** (heave is a bonus; cutting ropes also works by holding; the counter-board
  is optional).
- `prefers-reduced-motion`: camera cuts instead of swoops/eases (boarding, Go ashore, town follow), no shake, no hit-stop,
  pops fade without rising, the swing still plays (it is the content); lightning flashes become a slow sky tint.
- **Photosensitivity:** lightning flash overlay ≤ 0.25 opacity, ≤ 1 flash per 3 s, no strobing anywhere.
- Context loss anywhere in the dock returns focus to the open panel's first tab or to `#town-screen`.
- Touch layouts pass at 320×480, 360×480/640, 390×844, 568×320, 640×360, 844×390, 1024×600, 1280×720.

---------------------------------------------------------------------------------------------------

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| main.js (3,300 lines) is a single-owner bottleneck | Stage 0 seams (levels.js, `fighting`, `dockExits`, `env.step`, DOM skeleton, stubs with final APIs); logic lives in modules; the integrator role is split: battle (Stage 2), acts & town (Stage 3); others send hook requests |
| Balance: rakes, crits and captures flatten Act I, or capture always wins | enemy rakes scaled 0.4/0.6/0.8 on Act I; full-hull boardings show RISKY and cost crew; 6 s cooldown; enemies never crit; the Act I bot keeps "volcano > Europe"; tuning in one table per number (§6.8) |
| Truce used to dodge fire | truce only from `swing` (steering locked), cannonballs in flight still land, other enemies keep closing, cooldown 6 s, the target is reloaded only if it is still fighting |
| Glued ships fight `separateShips` / land | the pair is skipped in `separateShips`; boarding writes their positions during `swing..result`; "She broke free!" when land blocks the reel |
| Shared person geometry disposed by `disposeShip` | boarding/overboard people are scene children; the helm captain does not use `share` and is detached before `disposeShip` |
| Test churn | the shipyard still opens first; `#dock-ashore-btn` sits before the tablist; armory has its own key; level 3 stays a finale; the exact list in §11.4 |
| Act II bot can't win | mid-game profile, boarding API, tuning in Stage 3; no fail states in Act II |
| Draw calls / SwiftShader stalls | §12 budgets checked by tests; `share` cache; one-per-frame prebuilds; DOM pops; one InstancedMesh for pips |
| Town seen from new angles shows holes | the walk area is curated; Stage 1 walk screenshots from 6 spots; Stage 3 town polish agent |
| People look changes for existing townsfolk | the determinism rule (§0.1) and the 400-seed comparison in 1C's exit check |
| Mobile crowding | the act pad mirrors the sail pad at the same height; gun-card cells hidden on touch; F01 probe at 10 sizes |
| Moving obstacles vs baked shore foam | floes are reefs (not colliders) with their own foam ring; icebergs are static colliders |

---------------------------------------------------------------------------------------------------

## 15. Cut list (cut from the top; each cut leaves a consistent game)

1. Prize ships moored in town (§7.5).
2. Hands-up sailors on struck ships (the white flag stays).
3. Townsfolk greetings and speech bubbles.
4. Lightning in the Maelstrom (remove `bombs` from L6).
5. Tap-to-walk (keys, joystick and the places bar stay).
6. Polly's and Snips' tools and the `measure`/`snip` actions (they idle and wave instead).
7. The Phantom's rise animation (she spawns on the surface).
8. Drifting ice floes → static floes (raiders stay).
9. Shoulder pets and the crown model (hats, coats, barber, body, crew uniform stay).
10. Sailors tumbling overboard outside boardings (pips + splash puffs show the loss).
11. Crit effects (keep CRIT ×1.75 and its pop).
12. Hull hole decals (smoke, fire, list and sail droop stay).
13. The counter-board window.
14. Chain shot (Round + Grape stay: crew is the heart of boarding).
15. New level music (reuse the volcano/menu scenes; keep the new SFX).
16. Level 5 entirely: Act II becomes Doubloon Bay + The Maelstrom, with one raider pair moved into the Maelstrom's first
    wave so enemy boarding still ships.

Never cut: see §1.

---------------------------------------------------------------------------------------------------

## 16. Open questions for the user (defaults are built unless you say otherwise)

1. **The Molten Maw finale.** Default: beating it still shows the big Victory screen, now with "Sail on to the Far Seas".
   Would you rather the voyage just carry on to level 4 with a normal "level cleared" card?
2. **Enemy boarders and your gold.** Default: if raiders win a fight on your deck they grab 25 % of the gold you have
   plundered in that level (never your treasure chest, and they can never sink you or end the run). OK, or should they
   only cost you crew?
3. **Cosmetics prices.** Default: fancy hats, coats, dyes and parrots cost treasure-chest gold (1,200 for everything),
   most options are free and four trophies are earned by feats. Or should every cosmetic be free?

---------------------------------------------------------------------------------------------------

## Appendix A — DOM ids added in Stage 0 (all start `hidden`)

Battle (`#hud`): `#crew-chip` (in `#hull-card`), `#objective`, `#boss-crew` + `#boss-crew-fill` (in `#boss`),
`#boarding-strip`, `#pops`, `#game-live`, `#gun-ammo` + `#ammo-name`, `#gun-board` + `#board-tag`; touch `.pad.act` with
`#touch-ammo` (`data-tap="ammo"`) and `#touch-board` (`data-tap="board"`).
Screens: `#won-text` (the won paragraph), `#act2-btn` (first button of the won panel); `#dock-ashore-btn` (in `.dock-head`).
Town (`.overlay`, before `#recover-screen`): `#town-screen` (`tabindex="-1"`, `role="region"`) with `#town-chest`,
`#town-menu-btn`, `#town-mute`, `#town-places` (4 `button[data-place]`), `#town-prompt`, `#town-action`, `#town-joystick`,
`#town-keys`, `#town-live`; `#wardrobe-screen` with `#wardrobe-panel`, `#wardrobe-title`, `#wardrobe-chest`,
`#wardrobe-tab-captain`, `#wardrobe-tab-crew`, `#wardrobe-captain`, `#wardrobe-crew`, `#wardrobe-surprise-btn`,
`#wardrobe-back-btn`, `#wardrobe-live`; `#tavern-screen` with `#tavern-panel`, `#tavern-title`, `#tavern-chest`,
`#tavern-up-list`, `#tavern-rumour`, `#tavern-log`, `#tavern-back-btn`, `#tavern-live`; `#harbour-dialog` (`role="dialog"`,
`aria-modal="true"`, `aria-labelledby="harbour-title"`) with `#harbour-walk-btn`, `#harbour-shipyard-btn`,
`#harbour-tailor-btn`, `#harbour-tavern-btn`, `#harbour-exits`; `#aboard-dialog` (dialog, `aria-labelledby="aboard-title"`)
with `#aboard-exits`, `#aboard-stay-btn`.

## Appendix B — How the three designs were merged

Base: **arcade** (one deterministic boarding formula played as a ~5 s set-piece, level 3 kept as a finale, DOM pops, the
hook button states, hold-to-cut, places bar + Harbour menu, the tavern upgrades, faction looks, Frostbite Straits).
From **depth**: stern ×2 / bow ×1.5 rakes with per-level `enemyRake`; 10 normalised crew pips as one InstancedMesh;
odds previews with expected losses; Stage 0 scaffolding (levels.js, `fighting()`, hooks, DOM ids, placeholders); a
separate armory key; per-module draw-call budgets; seeded RNG / `forceCrit` / `G.spawn`; walk data generated from the
builders with a random-walk test and `?walkdebug`; the tavern rumour board; the stave-church village touches.
From **spectacle**: holes where balls land, sail drop on MAST DOWN, struck colours and your flag going up, sailors
tumbling overboard; ammo unlocked by progress (chain after L1, grape after L2); a finale whose last blow is a boarding
(merged into the Phantom without the mend timer or shimmer); enemy boarding that never ends the run (plunder) and the
counter-board window; try-on, Surprise me!, the crew line-up and Match the ship's paint; Polly's Plumes & Trims on `s1`;
the captain steering at the helm; the surrender notch; the shared person-geometry cache; the golden-hour harbour palette
(Doubloon Bay replaces arcade's Bali-like cove); lightning caps under reduced motion.
Changed from arcade on the judges' advice: the truce is narrowed to `swing..result`; the tavern upgrades left
`upgrades.js`; `separateShips` skips the grappled pair; the corrected list of test changes (§11.4); the Act I bot stays
on levels 1–3 and Act II gets its own bot. Hands-up crews on struck ships come from depth via judge 3.
**Conflict resolved — can the Phantom be sunk?** Judges 1 and 3 wanted the finale's last blow to be a boarding; judge 2
wanted her sinkable so the old bot loop over `LEVELS.length` stays winnable. Resolution: she cannot be sunk (the last
blow is a boarding or a grape-forced surrender), the old bot loop is limited to Act I, and a boarding-capable Act II bot
proves levels 4–6 winnable (§11.3).
**Other conflicts resolved:** surrender happens at a 20 % notch (spectacle/depth) instead of arcade's 0 crew, so the
crew row has a visible goal; the boarding outcome stays arcade's single deterministic formula (judge 2) but the preview
shows expected losses (judge 1); crits are ×1.75 with arcade's zone effects plus spectacle's ammo flavour; enemies never
crit (arcade; fewer frustration sources); the tailor sits on `s1` (spectacle/depth) with a signpost on arcade's plaza stall.
