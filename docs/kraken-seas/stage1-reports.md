# Kraken Seas, Stage 1 reports

Stage 1 built every new module of SPEC3 behind `WITH_KRAKEN` (false in the live game; `?kraken=1` shows Voyage III). Fifteen agents in three groups (light, heavyA, heavyB); several were cut off by usage limits and resumed from their work in progress, and the last five rows (1C, 1D, 1F, 1I, 1J) were closed out by short check-and-report agents. Each row's own report follows, verbatim apart from formatting.

## Coordinator changes outside the rows

- `src/townMode.js`: the four Kraken Seas trophies (`KRAKEN_ITEMS`: mortarboard, Governor's coat, baby kraken, rainbow macaw) are kept out of Polly's wardrobe and the captain's log unless the town ctx has `withKraken` (3A sets it). Without this the live wardrobe would list four locked trophies for features that are not in the game yet (1F's first hook request).
- `package.json`: the six new Node suites (specials, mechanics3, kraken, island, quiz, settings) join `npm test` in the order of SPEC3 §13.5, each with a `test:<name>` script. The browser suites `voyage3` and `ashore` are added by 3C later.

## Rows

| Row | Name | Files |
|---|---|---|
| 1A | Special ammo | src/specials.js, src/combat.js, tests/specials.test.cjs, tests/combat.test.cjs |
| 1B | Voyage III rules | (published by an earlier attempt; see the report) |
| 1C | Kraken rules | src/kraken.js, tests/kraken.test.cjs |
| 1D | Island & settings | src/island.js, src/settings.js, tests/island.test.cjs, tests/settings.test.cjs |
| 1E | Quiz | src/quiz.js, src/quizBank.js, tests/quiz.test.cjs |
| 1F | Economy & looks data | src/upgrades.js, src/cosmetics.js, tests/upgrades.test.cjs, tests/cosmetics.test.cjs |
| 1G | Characters | src/people.js |
| 1H | Shipwright | src/ships.js |
| 1I | Status & Kraken art | (published by an earlier attempt; see the report) |
| 1J | Sound | (published by an earlier attempt; see the report) |
| 1K | Env: Turtle Atolls | (published by an earlier attempt; see the report) |
| 1L | Env: Cape of Storms | src/env/cape.js |
| 1M | Env: Kraken's Deep | src/env/deep.js |
| 1N | Town world | src/env/sparrow.js, tests/walk.test.cjs, tests/fixtures/sparrow-walk.json |
| 1O | Ashore panels | src/quizPanel.js, src/buildPanel.js, town.css |

## 1A Special ammo

_Workflow run wf_12ac3fbb-a06._

### Summary

Row 1A (Special ammo) is done. Its exit check passes: every Node suite is green, and §2.1's worked example comes out exactly. The previous attempt had already published all four owned files, and the live copies are byte-identical to its dev copies in /home/user/First-project/.dock-harness/kraken/1A/. I audited that work against SPEC3 §2, §6.1–6.5, §10.1–10.2, §11.1 and §13.1 and found nothing that needed changing, so I only verified it.

What is in place:
- /home/user/First-project/src/specials.js: a pure module (imports nothing) with every §11.1 export, the §2 tables, the status rules (including KA-BOOM, FIRE OUT, the two immunities and the clothes-peg window), loads, crates, the §10.1 powder record and buyRecipe.
- /home/user/First-project/src/combat.js: only `armourMul` was added. No existing table or function changed.
- /home/user/First-project/tests/specials.test.cjs (new): 110 checks.
- /home/user/First-project/tests/combat.test.cjs: 5 checks appended, none edited.

While WITH_KRAKEN is false the live game behaves as today. A null status gives speed 1, turn 1 and noFire false from statusMuls, and defaultPowder, parsePowder and serializePowder give the default record.

Verification: I ran the whole `npm test` sequence on a mirror of HEAD e73279b with only 1A's four files swapped in. Every suite passed: 1,219 checks, which is the 1,214 baseline plus the 5 new combat checks. The mutation re-runs caught 74 of 75 mutants; the one missed is equivalent on every reachable status record.

### Files

- /home/user/First-project/src/specials.js
- /home/user/First-project/src/combat.js
- /home/user/First-project/tests/specials.test.cjs
- /home/user/First-project/tests/combat.test.cjs

### API notes

specials.js exports every name §11.1 lists, with the exact §2 values:
- Tables: SPECIAL_IDS, ALL_AMMO, SPECIAL, RECIPES, LOADS, STATUS, IMMUNE, WORDS3. All are deep-frozen.
- Functions: isSpecial, onSale, specialShot, newStatus, applyStatus, stepStatus, statusMuls, douse, startLoads, spendLoad, crateLoad, defaultPowder, parsePowder, serializePowder, buyRecipe.

Additions beyond §11.1 (none breaks a §11.1 call):
1. Extra helpers:
   - `isImmune(typeKey, id)`.
   - `mergeBurn(cur{rate,hp}, next{rate,time})` gives `{rate,hp,time,took}`. It is §2.2's "one burn per ship": the burn with more hp left to burn wins, and a tie goes to the new one.
   - `ammoReady(id, {powder, loads, unlocked})` gives `{ok, reason: null|'unknown'|'locked'|'notOwned'|'empty', word}`, for keys 4–6, R and the tray.
   - `mergePowder(a, b)`: the two-tab storage rule, so owned recipes only ever go up.
2. `applyStatus` returns more than the spec's `{st, events, burst, burn}`:
   - It also returns `stopBurn`, `pop` (the WORDS3 pop word), `why` (the immunity reason for #game-live) and `sfx` ('ignite'|'freeze'|'stink'|'blast'|'sizzle').
   - Its opts also take an optional `burning` flag (main's shared burn is running, e.g. a POWDER KEG). With it, frost and douse put that fire out too.
   - Events: 'applied', 'extended', 'kaboom', 'fireOut', 'immune', 'pegs'. Frost already at its cap with no fire gives []. Stink on a stinky ship gives [].
3. While stinky, the status record also carries `pegs` (10 s, a boss 20 s). It is the clothes-peg window the stink leaves behind, since stepStatus is told nothing about the ship. Records without it read 10 s. tags.js and mechanics3 only read id, t and max, so they are unaffected.
4. `statusMuls` returns the spec's 8 fields plus `noRegen` (fire) and `decel` (stink 2 = coast to a stop at 2× her accel). It returns shared frozen objects, so a 1/120 s step allocates nothing.
5. `douse(st, opts?)` takes an optional `{burning}`.
6. `specialShot` also sets `special` (the id) and `hullMul` on its fresh copy. Its dmg is rounded to 1e-9, so 12 × 0.7 is exactly 8.4.
7. `combat.armourMul(aspect, armour, crit?)` has an optional 3rd argument. With `crit === true` it returns 1, because §4.2 says crits do full damage. The two-argument call of §2.6 / §11.1 behaves exactly as specified. An armour that isn't a number in [0, 1] counts as none.
8. WORDS3 holds every special-ammo word: pops; immunity reasons and powder tips; boarding words (hot, hotShip, ropes, stinkBoard, boardHot(t), boardPill); ammo cell, count, loaded, buy, locked, empty, out and crate words; Powder room blurbs; #game-live templates; and the §6.5 tips for bits 256/512/1024, in keyboard and touch forms.
9. parsePowder follows the house rule of upgrades.js and armory.js: a stored flag may be a plain integer or a digit string ("1"), and anything else is 0.

No other deviations.

### Verification

Node suites on the live tree, run in this session, all exit 0:
- combat 107 (102 before + 5 appended)
- specials 110
- armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server 14

§2.1's worked example is reproduced exactly through combat.shotResult + specialShot + armourMul + the burn:
- Round 48; Frost 28.8 and 5 s at ×0.5 speed; Fire 33.6 + 18 = 51.6, can't board her while she burns; Stink 9.6 and still for 4 s; a stern rake 96.
- On an Iron Turtle's beam: round 24, Fire 16.8 + 18 = 34.8.
- The burn's 18th hp lands at step 720 of 1/120 s, the same step ON FIRE! ends.

Full `npm test` sequence: I built a mirror of HEAD e73279b (git archive) with only the four 1A files copied in, and ran each suite one at a time with NODE_PATH=/opt/node22/lib/node_modules. Load average was 14–32 because other agents were running. Logs: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1A/r5/summary.log. Every suite exited 0 with no failures:
- combat 107, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server 14
- smoke 94, controls 232, audio 50, battle 182, levels 73, town 130
- Total 1,219 checks: the 1,214 baseline plus the 5 new combat checks. Specials' 110 run on top; they join `npm test` only when 3C edits package.json.

After the run I confirmed the four live files were still byte-identical to the mirror.

Mutation re-run on the current files (scratch mutate.cjs): specials set A caught 52/52, set B 15/16, words 3/3; armourMul via combat.test 4/4. The one miss, "stepStatus wears pegs while stinky", is equivalent for every reachable record: applyStatus always sets immune to 0 when a stink takes hold, and a stink's end replaces immune with its pegs.

Nothing in this row renders, so there are no screenshots or draw calls to report.

### Hook requests

- src/main.js ballHit (2A): call `info.dmg *= combat.armourMul(info.aspect, s.type.armour, info.crit)`, passing info.crit as the 3rd argument, so a beam crit on an Iron Turtle does full damage as §4.2 says. With the bare two-argument call of §2.6 a crit would also be halved.
- src/main.js damage(), once per volley per target (2A): call `specials.applyStatus(s.status, info.status, { typeKey: s.typeKey, boss: !!s.type.boss, burning: <the shared burn is running> })`. Then set s.status = r.st; deal r.burst at once, bypassing armourMul; merge r.burn into the ship's one burn with `specials.mergeBurn({ rate, hp: hp left to burn }, r.burn)`, where the keg's burn is `{ rate: EFFECTS.keg.dps, time }`; stop the burn on r.stopBurn; and use r.pop, r.why and r.sfx for the pop, #game-live and the sound. Without this, KA-BOOM, FIRE OUT, IMMUNE! and the shared keg/fire burn are not applied.
- src/main.js updateEffects, enemy speed and canGrapple (2A): call `specials.stepStatus(s.status, dt)` in step(), but not on a glued boarding pair (stinks pause from the hook, burns from the swing, §2.4). Coast a stinky ship to a stop at `statusMuls(st).decel` × her accel. In canGrapple, refuse a target whose `statusMuls(st).noGrapple` is true with `specials.WORDS3.hot`. In boardingSides, multiply the defender's grit by `statusMuls(st).grit`. Reset s.status to `specials.newStatus()` on strike, capture, escape or flee.
- src/main.js fire(), key 4–6, R and tray handlers (2A): test with `specials.ammoReady(id, { powder: state.powder, loads: state.loads, unlocked })` and show its `word` as the hint. Each side that fires a special calls `specials.spendLoad(state.loads, id)`. When it returns ok false, set `state.ammo = 'round'` directly and show `specials.WORDS3.out(id)` (§2.5). Crates use `specials.crateLoad`, and level starts use `specials.startLoads(state.powder, windmillTier)`.
- src/main.js saves (2A): load 'pirates-ahoy-powder' with loadRecord, using specials.parsePowder and specials.serializePowder. A stored record that needed fixing serializes differently, so loadRecord rewrites it. The storage listener merges with `specials.mergePowder(mine, theirs)`.
- src/townMode.js Powder room (2B): use specials.RECIPES, onSale, buyRecipe, WORDS3.blurb, WORDS3.powderTip (once that recipe is owned) and WORDS3.locked/buy. Write the record first and the chest second (§0.1); buyRecipe never moves gold itself.

### Open issues

- specials.test.cjs reads 1D's src/island.js to check the Powder Windmill's perk against LOADS.windmill (0/1/2/3). It reads perks() when that varies by tier, falls back to the PLOTS windmill row, and skips if neither is there. It passes today through PLOTS. If 1D changes the Windmill's +1/+2/+3, this check will fail on purpose, because §8.1 and §2.5 must agree.
- package.json does not run tests/specials.test.cjs yet. Per §13.4, 3C adds it to `npm test` in Stage 3, and package.json is not 1A's file.

## 1B Voyage III rules

_Workflow run wf_12ac3fbb-a06._

### Summary

Row 1B (Voyage III rules) is finished. The exit check passes: tests/mechanics3.test.cjs runs 162 of 162 checks green against a mock ctx, using a real createMechanics instance for the composeMechanics checks. The previous attempt had already published src/mechanics3.js, src/act3.js and tests/mechanics3.test.cjs. They are byte-identical to the dev copies in /home/user/First-project/.dock-harness/kraken/1B/. In this run I checked them line by line against SPEC3 §4.2, §5.3, §5.4–5.6, §11.1 and §13.1, and against the modules other agents have landed since (specials.js status shape, the atolls/cape/deep hazard readers, tags.js RAM icon, main.js Stage 0 seams). I found no defect, so nothing was republished.

composeMechanics is byte-identical to Stage 0's (diffed against HEAD:src/mechanics3.js). act3.js matches §5.4–5.6 field for field. With WITH_KRAKEN false the game behaves as before: a seeded replay of levels 1–6 (Math.random seeded, loop frozen, 45 s per level) gives IDENTICAL output with and without the 1B files on today's tree (58 samples, 0 errors). The full set of npm test suites is green on the current tree, plus the new Node suites.

### Files

(none changed in the reporting run)

### API notes

Nothing changed this run. What is published (src/mechanics3.js 76f3361b…, src/act3.js 77bbfb34…, tests/mechanics3.test.cjs e64e340e…) delivers this API:

- **mechanics3.js exports, exactly as §11.1:** MECHANIC3_IDS = ['spouts','rogue','flagship']; the tables SPOUTS, ROGUE, RAM, MORTAR, FIRESHIP, INK, FLEE; createMechanics3(ids, ctx); composeMechanics(parts).
- **Instance hooks:** init, onSpawn(e, waveIndex), onCapture, onSink, onRemove, step(dt), steer(e) → {h, speed} | null, holdFire, drift → {vx, vz} | null, avoid, shipMods (one frozen identity object when nothing applies), objective (null), minimap, summary ([]), bonus (0), visuals() → { spouts, rogue, slicks, rams, fireRings, shells }, addSlick(x, z), getters krakenDue and state, dispose.
- **Test hooks for §11.3:** wave(angle) and spout(x, z) on the instance.
- **act3.js:** exports ACT3_LEVELS (L7 with lockText 'Beat the Phantom Galleon'; L8 and L9 without one, so their cards read "Locked"; L9 has the geyser bombs, kraken: true, finale, finaleText, victoryLine) and ACT3_TEASER. It imports only the three env modules.

Deviations and additions (all optional or documented in the module header):
1. **Extra table numbers:** SPOUTS.stagger 4, near 70, spacing 20; ROGUE.bowIn 100, past 10, maxLife 40; RAM.windupSpeed 0.4 and after 0.3; MORTAR.slant 0.6, cruise 0.6, muzzle 2.5; FIRESHIP.touch 0.25; INK.lead 1, muzzle 4, slick.fade 1.
2. **Fire ship reach:** "within 4 u of any hull" means her centre within 4 u of the other hull, or touching it (contact distance + 0.25). The blast falls off from her centre to each hull, so the ship that set her off always takes at least 11.
3. **Ram and mortar wait for an attack slot.** A shark rams, and a ketch keeps range and lobs, only while it holds one of main's slots (ctx.attacking, default true). Fire ships and the Inkheart's ink need no slot.
4. **Optional ctx members**, each with a safe default: hold() (default false), attacking(e) (true), boarding() (false), capture(e) (no-op), turnRate(ship) (type.turn).
5. **Fire ship flags:** a fire ship that blew up gets e.exploded = true before main drops coins. A fire ship that strikes by losing crew has her fuse put out.
6. **The flagship's fall** triggers only from onSink or onCapture of a flagship type on a level with the 'flagship' id.

### Verification

All commands ran on the current tree (other agents kept publishing during the run; my three files were confirmed unchanged at the end by cmp and md5).

**Node suites** (NODE_PATH=/opt/node22/lib/node_modules node tests/<name>.test.cjs): combat 107/107, specials 110/110, armory 35/35, cosmetics 70/70, walk 74/74, mechanics 121/121, mechanics3 162/162 (the 1B exit check, mock ctx), quiz 85/85, upgrades 37/37, server 14/14. All exit 0. mechanics3 and mechanics were re-run at the end: 162 and 121, green.

**Mutation check** (mutate3.py, 35 single-line breaks of mechanics3.js / act3.js run against the test): 35/35 caught (log: scratchpad/kraken/build/1B/mutate6.log).

**No behaviour change on today's levels** (sameprobe.cjs): snapshot snapE = today's tree with Stage 0's mechanics3.js and act3.js (git HEAD); snapF = today's tree as published. Seeded play of levels 1–6, 45 s each: "IDENTICAL (58 samples)", errors A: 0, B: 0, exit 0.

**Browser suites, run in sequence on the repo** (load 10–27 from other agents):
- smoke 94/94 (draw calls per frame 301, 231, 107, 243, 191, 228; dock 297 of 450)
- battle 182/182
- levels 73/73
- controls 232/232
- town 130/130
- audio 50/50

All exit 0. Together with the npm-test Node parts (458 checks) that is 1219 checks green.

**Live game with ?kraken=1:**
- **liveprobe2.cjs, 1280x720 and 390x844, loop frozen and stepped:** all PASS, no page errors or audio warnings. L7: spouts form and ride (4 formed, nearest 16 u). L8: the first rogue wave rolls at 30 s (side-on 1, rode 1). L9: the Inkheart lobs ink pots (4). Draw calls, 1280: L7 94/119, L8 195, L9 165; 390: L7 109/119, L8 188, L9 157.
- **clearprobe.cjs:** with ships sunk on cue, L7 and L8 reach levelDone and L9 reaches won. L8 had one fire ship lit and blowing up. No errors.
- **clearprobe9.cjs:** the Inkheart sunk while a skiff still sails. Fall at 16.0 s, the skiff flees and escapes at 21.0 s, krakenDue true, Victory (won). No errors.
- **roguecam.cjs (L8, 390x844):** frames as the crest reaches the captain show SURF'S UP!, SPLASH! and RODE IT! at the same time. Calls 157–191.

**Rules harness** (.dock-harness/kraken/1B/rules.html, the game's own scenery.js renderer, real envs and ships; rulesshot.cjs at 1280x720 and 390x844): 0 errors on any level or size. Draw calls:
- L7: 137/92/112/127 at 1280, 139/98/89/127 at 390
- L8: 162/159/133/92 at 1280, 150/160/111/95 at 390
- L9: 114/103 at 1280, 122/106 at 390

**Screenshots looked at in three critique rounds:**
1. rules4 at 1280: ram wind-up and surge toward you, spouts near the fight, the mortar ring ahead of your bow, the rogue crest from the open sea, a fire ship lit then blowing up when she reaches you, ink pots, slicks, the flee map.
2. rules4 at 390.
3. live6 and roguecam in-game views with the hazards drawn.

No rules defect was found in any round.

### Hook requests

- src/main.js startLevel(), the ctx3 literal (~line 1327): add these members, all optional for mechanics3: hold: () => state.intro > 0 || boarding.truce (hazards, rams, mortars, ink, fuses and flee timers wait during the fly-in and the truce, as bombs do; today mechanics3's clock and grace count the fly-in); attacking: (e) => attackSet.has(e) (hoist step()'s local `attackers` Set, ~line 3373, into a module-level `attackSet` so a shark rams and a ketch lobs only while she holds an attack slot); boarding: () => boarding.active (krakenDue waits for any boarding); capture: (e) => captureShip(e, 'auto') (struck ships taken at the Inkheart's fall; without it krakenDue never turns true while a struck ship floats); turnRate: (s) => turnRate(s) (mortar and ink lead with the real turn rate). Fill in the Stage 0 no-ops: flee(e) sets e.fleeing = true and clears e.status; explode(x, z, r, dmg, src) gives the blast its look and sound only (mechanics3 deals the damage through ctx.damage); douse(e) applies specials.douse to e.status and pops FIRE OUT! when doused; surrender(e) strikes her colours as checkSurrender does (white flag, banner), without the crew test.
- src/main.js fighting() (~line 1552): add `&& !e.fleeing`. In separateShips(), skip ships with e.fleeing (§11.2). updateEnemy already asks mechanics.steer before the attack logic, so fleeing ships get their heading for the world edge.
- src/main.js startLevel() and __game.mechanics3 (~line 6953): keep the createMechanics3 instance, e.g. `m3 = mechanics3.createMechanics3(ids, ctx3); mechanics = composeMechanics([createMechanics(ids, ctx), m3])`. Wire `wave: (a) => m3.wave(a), spout: (x, z) => m3.spout(x, z)`. composeMechanics does not pass these test hooks through, and must stay as Stage 0 wrote it.
- src/main.js frame() (~line 6664): before env.update, set `envFrame.hazards = mechanics.visuals();`. atolls.js reads .spouts, cape.js .rogue, deep.js .slicks. Today the envs never see the hazards; my probes had to patch env.update to draw them.
- src/main.js moveShip() (~line 3000): apply the spout spin after the drift: `const spin = mechanics.shipMods(s).spin; if (spin) s.h = wrapAngle(s.h + spin * dt);` (not for the boarding-held pair).
- src/main.js damage(), the sink branch (~line 2565): mechanics.onSink(ship) already runs before the coin drop. Skip dropping her coins when `ship.exploded` is set (a fire ship sunk while lit explodes: no coins, §4.2).
- src/main.js updateBombs(): add the kinds 'shell' (orange ring with fuse sparks) and 'ink' (dark-violet ring). When an 'ink' bomb lands, call `mechanics.addSlick(b.tx, b.tz)`; the Kraken's ink blob does the same.
- src/main.js frame()/updateHud: set the tag's RAM icon for ships whose id is in mechanics.visuals().rams (tags.js ICONS.ram). Draw a lit fire ship's red ring from visuals().fireRings and show ships.js userData.fuse flames while she is lit.
- src/main.js step() clear check (~line 3439), for def.kraken: when alive === 0 on the last wave, run the struck-ship auto-capture first. captureShip calls mechanics.onCapture, which is the Inkheart's fall if she struck and was never boarded. Only then gate the clear on kraken.done. Start the dread when mechanics.krakenDue turns true. Stop def.bombs (the geysers) once the flagship has sunk or been captured: check ship.type.flagship in the onSink/onCapture paths, or read mechanics.state.m3.flagship.fallen once (do not read state every step; it builds a full snapshot).
- src/main.js canGrapple(): a fire ship that has not struck answers 'immune' with "Too hot to board! Freeze her first." (§4.2). mechanics3 makes a frozen fire ship strike through ctx.surrender.

### Open issues

- package.json does not yet run tests/mechanics3.test.cjs (or specials and quiz). §13 has 3C add them to "test" (Node order: ... mechanics, mechanics3, kraken ...); I don't own package.json.
- Until 2A fills ctx3 (hook requests), today's ?kraken=1 game uses the Stage 0 no-ops. A fleeing ship stays in main's fighting() for its 5 s, though mechanics3 steers it to the edge and it holds fire. Fire-ship blasts have no look of their own. A frozen fire ship doesn't really strike (ctx.surrender is a no-op), but her fuse is out and she never explodes. Hazards are drawn only when the env gets visuals(). Levels 7–9 still clear without errors (clearprobe).
- Without ctx.capture, a struck ship left afloat after the Inkheart's fall keeps krakenDue false. That is harmless now (no Kraken until 1C/2A), but 2A must pass capture (hook request).
- Visual note for 1L/3E (cape.js / camera, not 1B): in the live L8 shot at 390x844 and 34.0 s, while a rogue crest rolls past from behind, the crest and its foam fill the view and the player's ship is briefly hidden (live6/L8-rogue-390x844.png). Half a second later it is visible again (roguecam/rogue-3, rogue-5).
- Balance numbers are SPEC3's starting values. 3B tunes them with bot v3 (§5.9), so nothing is recorded in §19 yet.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L7-1280x720-1-ram-windup.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L7-1280x720-3-ram-surge.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L7-1280x720-4-spout.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L7-1280x720-5-shell.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L7-1280x720-6-fight-map.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L8-1280x720-1-rogue-warning-map.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L8-1280x720-3-rogue-crest.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L8-1280x720-5-fireship-lit.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L8-1280x720-7-after-map.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L9-1280x720-3-slicks.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L9-1280x720-5-fall-map.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1B/rules4/L7-390x844-4-spout.png
- …

## 1C Kraken rules

_Workflow run wf_bf5ab9e4-ea7._

### Summary

I closed out row 1C (Kraken rules). The audit of the published src/kraken.js against §5.7, §5.8, §11.1 and §13.1 found one real defect, which I fixed. The tentacle warning played 'bombWhistle'. audio.js defines that as a falling tone, but §5.7.3 asks for a rising tone, and 1J has since published a 'tentacle' warning sound that rises and ends in a surge. The warning now plays 'tentacle' and passes the warning's length as an optional 4th sfx argument { duration: W }, so the surge lands on the slam. Nothing else changed in the code: the visuals and state are identical to the previous copy (2400 frames over 6 seeds). I added 2 checks to tests/kraken.test.cjs: every sound in KRAKEN.sfx is in audio.js SFX_NAMES, and a warning plays the tentacle tone for as long as it lasts (1.8 s in phase 1). Both checks fail on the previous copy. I published atomically (cp to a temp name, then mv). The published Node suite passes 154 of 154 checks, all four EXIT checks included. With WITH_KRAKEN false the live game is unaffected: main.js only imports kraken.js as a namespace and never creates a Kraken (`let kraken = null` is never reassigned; every use is guarded).

### Files

- /home/user/First-project/src/kraken.js
- /home/user/First-project/tests/kraken.test.cjs

### API notes

Exports: `KRAKEN` (the table) and `createKraken(ctx)`. The module imports nothing.

createKraken(ctx) gives the full §11.1 API:
- rise(x, z, { short }), step(dt), targets() → [{ id, kind: 'eye'|'head'|'tentacle', x, z, r, y0, y1, hp }] (raised parts only; the eye comes first)
- hits(id, x, y, z), hit(id, info) → { dmg, word } | null, special(id, ammo) → word | null
- cut() → boolean, cutHold(down), playerMods() → { speedMul, turnMul, dps, vx, vz }
- getters bar { name: 'THE KRAKEN', frac, notches: [0.667, 0.333] }, phase, hp, grabbed, rising, done
- visuals() → { shadow, head, eye, tentacles: [{ id, x, z, h, t, state, tx?, tz? }], rings: [{ x, z, r, t, T, grab, kind, from? }], boil, pearl, rise, burn }
- get state, dispose()

ctx is as §11.1. Tables come from ctx.tables (specials.js STATUS, mechanics3.js INK, combat.js RAIDERS); no number from them is copied into KRAKEN.

Additions beyond §11.1:
- rise() returns a boolean.
- skip() ends the rise (it is skippable).
- setHp(n), used by G.kraken.setHp and phase.
- `get status` → { id, t, max, immune } for #boss-status.
- `get over` (the Pearl has been taken).
- playerMods().vx / vz: the phase-3 pull, 2 u/s toward the head within 50 u, stopping 18 u from it.
- Optional ctx.pearl(gold), called once when the Pearl is taken.
- Optional ctx.tables.WORDS3.
- NEW this session: ctx.sfx(name, x, z, opts) gets a 4th argument { duration } on the tentacle warning only. A 3-argument sfx still works.

Interpretations, unchanged from the earlier attempts and covered by tests:
- KRAKEN.grabRest and restGap sit at the top level, matching §5.7.3's `KRAKEN.grabRest` (§11.1's comment lists them under grab).
- In phase 3 the first tentacle of each attack aims at your predicted spot ±6 u. This lets the "first tentacle grabs" rule work in phase 3. The other three rise anywhere 10–40 u from you, but never in the line from your ship to the eye.
- While the head is up in phases 1–2, the shadow's 14 u trigger pauses. The 12 s cut-off still applies.
- Tentacle rings keep 10 u from the head's centre, and the head never surfaces on a tentacle.
- The Pearl drifts to you after 4 s and speeds up as it goes, so it always reaches you.

### Exit check

1. Node tests green: MET. Published `node tests/kraken.test.cjs` exits 0 with 154 of 154 passed (pub_test7.log, 2026-10-21 ~19:19 UTC).
2. Every warning ≥ 1.5 s: MET. "EXIT: every warning ≥ 1.5 s (tentacle rings in 30 runs and ink blobs; shortest 1.50 s)". Per-phase checks also pass (1.8 / 1.6 / 1.5 s, + Lighthouse bonus, + 0.5 s frozen), and the 'short-warn' and 'no-bonus' mutants were caught (mutate6.log).
3. A scripted fleeing player still gets an attack within 12 s + warning: MET. "9 runs × 300 s in phases 1–3, 295 attacks, 145 cut-offs; worst margin 0.00 s". The 'no-cutoff' mutant was caught.
4. Never more than 4 tentacles up: MET. "30 runs, max 4", plus the 600 s-per-phase check and the hard-cap retire check. The 'no-cap' mutant was caught.
5. A standing player is never grabbed within 8 s of a release: MET. "467 releases; soonest regrab 8.01 s", plus "first rings ≥ 8 u after a release". The 'no-grab-rest-all' and 'no-rest-gap' mutants were caught.

### Verification

This session (2026-10-21, UTC):
- 19:13: `node tests/kraken.test.cjs` on the then-published copy (md5 de17e712…) passed 152 of 152.
- Dev copy, run with KRAKEN_JS pointing at the dev kraken.js: 154 of 154 passed. Log: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/dev_test7.log
- The new test against the previous published copy fails exactly the 2 new checks. A mutant that drops { duration: W } (/home/user/First-project/.dock-harness/kraken/1C/mut/sfx-nodur.js) fails 1.
- ~19:19: published by cp to a temp name + mv. `node tests/kraken.test.cjs` exits 0 with "All kraken checks passed (154)". Log: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/pub_test7.log. The dev copy (/home/user/First-project/.dock-harness/kraken/1C/dev/) is byte-identical to the published files.
- Equivalence probe, previous copy vs new: visuals() and state are identical over 2400 frames (6 seeds × 200 s, with sailing, standing, phase changes, frost, fire, hits and cuts). The sfx sequences are identical except that the 57 'bombWhistle' warnings became 57 'tentacle:<duration>'. Probe: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/r7/equiv.mjs, output r7/equiv.log; the previous copy is reconstructed at r7/kraken.r6pub.js (md5 matches de17e712…).
- All 10 KRAKEN.sfx names are in audio.js SFX_NAMES.
- main.js: kraken.js is only imported as a namespace (krakenRules, unused) and `kraken` stays null, so with WITH_KRAKEN false nothing from kraken.js runs.

Earlier attempts' evidence (checked, not re-run):
- Mutation run, /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/mutate6.log (2026-10-19 03:56 UTC): 33 of 33 mutants caught, 0 'PATTERN MISSING'. The test it used (.dock-harness/kraken/1C/mir/tests/kraken.test.cjs) was byte-identical to the then-published test. My edit only adds checks (the mock's sfx also records the 4th argument), so every mutant still fails.
- Harness round 6: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/r6/ and r6.log (2026-10-19 03:48–03:51 UTC), 17 poses at 1280x720 and 390x844. It ran after the last dev edit (03:44), on a copy identical to the pre-fix published file, and the equivalence probe shows my fix changes nothing visible, so I did not re-run it.
- Draw calls in round 6: 90–111 per frame in total, of which the Kraken is 4–12.
- I looked at d_10_last_stand, p_10c_last_stand, d_09_after_release and p_02_warn. The head with its eyes is clear of the tentacles in the last stand at both sizes. The grabbing tentacle stands beside the hull. After a release the rings sit away from the hull.
- In r6.log, frostT [1.8, 1.8] is a harness timing artifact, not a defect. The harness re-froze every 2 s, but a boss re-hit adds only frost.add × bossMul = 1 s, so the frost lapsed for 0.5 s and the attack started in that gap. The Node check "frozen, every warning is 0.5 s longer" passes.

Not run by me (coordinator's job): npm test and the browser suites. kraken.test.cjs is not in package.json's test script yet (3C adds it in Stage 3).

### Hook requests

- src/main.js (Stage 2A), the ctx passed to createKraken: forward sfx's optional 4th argument to the audio call, e.g. sfx: (name, x, z, o) => <main's positional sfx helper>(name, x, z, o && o.duration ? { duration: o.duration } : undefined). Why: audio.js 'tentacle' is a rising tone that defaults to 1.6 s; given the ring's warning time (1.5 to about 2.3 s with the Lighthouse or frost), its surge comes with the slam (§5.7.3).
- src/main.js (2A), step(), L9 clear check: wait for kraken.over, not kraken.done, and pass ctx.pearl = (gold) => { state.gold += gold; }. Why: §5.7.1 step 5 adds the Pearl's 1,000 to state.gold when it is collected, so finishLevel banks it. The Pearl bobs up about 2.6 s after done and is collected 3.5 to about 12 s after done, so clearing on done would lose it.
- src/main.js (2A), input during the rise: any key or tap calls kraken.skip(). Why: §5.7.1 step 3 makes the rise skippable.
- src/main.js (2A), updatePlayer: apply kraken.playerMods() each step: multiply speed and turn by speedMul / turnMul; while grabbed, apply dps × dt to the hull; add (vx, vz) × dt to the player's position. Why: §5.7.3 grab (speed and turn 0, 2 hp/s) and the phase-3 pull (2 u/s toward the head within 50 u).
- src/main.js (2A), HUD: read kraken.status for the #boss-status badge, and take the #grab-strip, CUT! and 'You can't board a sea monster!' texts and the banners from KRAKEN.words (strip, stripTouch, cutButton, noBoard, banner.rise / how / howStink / off), so every screen says the same thing.

### Open issues

- I did not run npm test or the browser suites (the coordinator's job). The earlier attempts' runs of 2026-10-19 (scratchpad/kraken/build/1C/suite_*.log, smoke2.log) had smoke and controls timeouts and a levels section crash while the machine was loaded; battle (182/0) and audio passed. kraken.js never runs in the live game in Stage 1, but I have not verified those failures myself; the coordinator's current run decides.
- tests/kraken.test.cjs is not yet in package.json's "test" script; per §12/§13.4 the 3C owner adds it in Stage 3.
- The warning sound now relies on audio.js (1J) keeping the 'tentacle' name in SFX_NAMES. The new kraken test check fails if it is renamed or dropped.
- main.js still has to use the API additions (skip, over plus ctx.pearl, the vx/vz pull, status, the sfx { duration }); they are listed as hook requests for 2A.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/r6/d_10_last_stand.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/r6/p_10c_last_stand.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/r6/d_09_after_release.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/r6/p_02_warn.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/r6/d_07_grab.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1C/r6/d_01_rise.png

## 1D Island & settings

_Workflow run wf_ea2433f2-028._

### Summary

I've closed out row 1D (Island & settings). The four owned files were published by the earlier attempts on 2026-10-18 at 23:09:10 UTC. I checked them against SPEC3 §8.1, §3.2, §10.1, §10.2 and §11.1 and found no real defects, so I made no edits in this session. Each file is byte-identical to its dev copy in /home/user/First-project/.dock-harness/kraken/1D/, and none has changed since it was published. Both parts of the exit check are met: the island and settings Node tests pass (52 and 16 checks), and the totals come to 3,400 / 8,400 / 11,800. With WITH_KRAKEN false the live game behaves as today. main.js only uses these modules to set its starting defaults (defaultSettings and defaultIsland) and in the window.__game test API. Nothing writes pirates-ahoy-island or pirates-ahoy-settings, and the earlier live probe confirms this.

### Files

- /home/user/First-project/src/island.js (published by earlier 1D attempts 2026-10-18 23:09:10 UTC; not edited this session)
- /home/user/First-project/src/settings.js (same)
- /home/user/First-project/tests/island.test.cjs (new; same)
- /home/user/First-project/tests/settings.test.cjs (new; same)

### API notes

src/island.js (pure, imports nothing):
- Constants: PLOTS (10 rows in panel order homeA, homeB, homeC, homeD, bakery, windmill, lighthouse, market, school, park). Each row has { id, name, platform, x, z, kind 'home'|'amenity', tiers[3], costs[3], perk: { <key>: [t1, t2, t3] }, height }. Perk keys: villagers [2,4,6], wavePatch [0.45,0.55,0.65], extraLoads [1,2,3], warnBonus [0.3,0.6,0.9], marketPct [5,10,15], hints [1,2,3], giftMul [1.25,1.5,2].
- RANKS [{name, from}]: Hamlet 0, Village 5, Town 12, Harbour Town 20, Pirate Capital 30.
- GIFT { perVillager: 5, cap: 240 }, MARKET { cap: 300 }, VILLAGER_CAP 8.
- Record functions: defaultIsland(), parseIsland(raw), serializeIsland(s). tierOf(s, id) and nextCost(s, id), which returns null when maxed or unknown. totals() returns { homes: 3400, amenities: 8400, all: 11800 }.
- plotState(s, purse, id) returns { tier, cost, affordable, maxed, label, now, next }. Labels: "Build Cottage — 100 gold", "Upgrade to Townhouse — 250 gold", "Need N more gold", "Fully built". `now` at tier 0 is "a little shack"; `next` when maxed is "all done!".
- build(s, purse, id) returns { ok, island, cost, reason }. Reasons are checked in the order 'unknown', 'maxed', 'poor'; on failure cost is 0 and the island is unchanged; on success reason is null. It never mutates its input.
- perks(s) returns { wavePatch, extraLoads, warnBonus, marketPct, hints, giftMul }; with nothing built it gives { 0.35, 0, 0, 0, 0, 1 }, and 0.35 is today's WAVE_REPAIR.
- Also villagers(s), tiersBuilt(s), rank(s) → { name, tiers, next }, gift(s), market(s, banked).
- Rounding: gift is round(5 × villagers × giftMul) capped at 240. market is round(banked × pct / 100) capped at 300, after banked is floored to whole gold (junk or negative counts as 0).

settings.js (pure): STEER_MODES = ['buttons', 'wheel'] (frozen), defaultSettings() → { v: 1, steer: 'buttons' }, parseSettings(raw) and serializeSettings(s).

Deviations from §11.1, all additive or harmless:
(1) One extra export, island.js mergeIsland(a, b), which keeps the larger tier of each plot for the two-tab storage listener of §10.2.
(2) PLOTS, RANKS, GIFT, MARKET and STEER_MODES are deep-frozen. The consumers (sparrow.js, buildPanel.js, quizPanel.js, main.js and the walk, cosmetics and specials tests) only read them; I grep-checked this and their suites pass.
(3) Record validation follows parseShipConfig's rules. A tier may be a plain integer or a digit string, clamped to 0..3. Number literals like 1e0 or 2.0 are rejected through the reviver. Only own properties and known plot ids are read, records are capped at 4 KB (settings at 1 KB), "v" is ignored and written back as 1, and the functions never throw. A record that needed fixing serializes to different text, so main rewrites it.

### Exit check

1. Node tests green: met. island 52/52 and settings 16/16 passed in this session. The consumer suites specials (110) and cosmetics (83) also pass, and the coordinator's log npmtest-s1.log shows the earlier Node suites passing.
2. Totals 3,400 / 8,400 / 11,800: met. `totals()` returns { homes: 3400, amenities: 8400, all: 11800 }. The test sums the §8.1 table independently and gets 3400 / 8400 / 11800, and building all 30 tiers costs exactly 11,800 (seen in the island test output this session).

### Verification

This session, 2026-10-21 from about 19:13 UTC:
(a) `cmp` shows src/island.js, src/settings.js, tests/island.test.cjs and tests/settings.test.cjs are byte-identical to the dev copies in /home/user/First-project/.dock-harness/kraken/1D/. All four have mtime 2026-10-18 23:09:10 UTC, so nothing changed after the earlier evidence was taken.
(b) `node tests/island.test.cjs` printed "All island checks passed (52)". This includes the exact §8.1 table, "totals: homes 3400, amenities 8400, the island 11800", the whole island building for exactly 11,800 in 51 orders (11,799 leaves the last tier 'poor'), build order and reasons, perks at every tier, villagers 2/4/6 up to 24, the gift capped at 240, the market capped at 300, ranks at 0/4/5/11/12/19/20/29/30, the garbage battery and round trips.
(c) `node tests/settings.test.cjs` printed "All settings checks passed (16)".
(d) I re-ran the earlier mutation script, /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1D/mutate.cjs; the log is mutate-close.log in the same folder. 45 of 48 mutants were killed. The 3 survivors don't change behaviour:
  - 'gift uncapped': the table can never go over 240, since 24 villagers × 5 × 2 = 240.
  - 'tier -0': Math.max(0, -0) already gives +0.
  - 'isRecord unguarded': the outer try in parseIsland still returns the default for a revoked proxy.
(e) Consumer Node suites that load island.js: `node tests/specials.test.cjs` printed "All specials checks passed (110)", including the Windmill perk matching LOADS.windmill. `node tests/cosmetics.test.cjs` printed "All cosmetics checks passed (83)", including trophy minimums matching island.js's 30 tiers. Logs: close-specials.log and close-cosmetics.log in the 1D scratch folder.
(f) Audit by reading the code: §11.1 exports, §8.1 numbers, §10.1 record format and limits, §3.2 modes, the kid rules (every refusal reason is given as panel text), and how main.js, sparrow.js, buildPanel.js and quizPanel.js use these modules.

Earlier attempts' evidence, which I opened and looked at:
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1D/live.log (2026-10-18 23:24, after the publish). Run without the flag (WITH_KRAKEN false) at 1280x720 and with ?kraken=1 at 390x844. The `__game.settings` and `__game.island` get/set round trips sanitise correctly, and junk gives the defaults. No pirates-ahoy-island or settings keys were written. Level start and town both worked, with no page errors. Draw calls were 216 (no flag) and 158 (kraken, 390).
- Screenshots in the shots/ folder there: I viewed live-noflag-1280.png (today's town), live-kraken-390.png, r1-1280-mixed.png and r1-390-amenities.png. They show the build panel using the real plotState and rank texts ("Fully built", "Need 240 more gold", "Build Bread oven — 200 gold", "Now: a little shack", "Villagers 12 · Town") rendering correctly.

I ran no browser suites and no npm test, as instructed.

### Open issues

- Earlier browser-suite runs (2026-10-19, logs suite-levels-1/2.log and suite-town-1/2.log in the 1D scratch folder) had failures. Most were page.goto/click timeouts under machine load of about 20, plus one Act II bot balance check that failed once (Maelstrom 47 > 54) and passed when that section was re-run in levels-sec-1.log (189 > 38). None involve island.js or settings.js: with WITH_KRAKEN false, main.js only uses them for its starting defaults and the window.__game test API. The coordinator's current full npm test run is the authority on this.
- The earlier attempt's panel probe round 2 (panel-r2.log, 2026-10-19 03:51) hit a screenshot timeout. Its round-1 panel screenshots exist and look right. Round 2 is not part of 1D's exit check (the panel belongs to 1O), so I did not re-run it.
- No one consumes mergeIsland yet. It is there for 3A's storage listener (§10.2: each plot keeps the larger tier); 3A can also inline the merge.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1D/shots/live-noflag-1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1D/shots/live-kraken-390.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1D/shots/r1-1280-mixed.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1D/shots/r1-390-amenities.png

## 1E Quiz

_Workflow run wf_12ac3fbb-a06._

### Summary

I finished row 1E Quiz from the previous attempt's work in /home/user/First-project/.dock-harness/kraken/1E/, after checking it and fixing what was wrong. The three files are published to the repo atomically (copied to a temp name, then moved).

- src/quiz.js: the full §7 rules.
  - The nine islands of §7.2.
  - Seeded mulberry32 rng and validateBank.
  - sumQuestion for bands 1–3 (§7.6), with the five themes and near-miss wrong answers.
  - makeRound: five questions, one per category, in a shuffled order, with the island's band and number of answers. It respects the seas gating, the seen and recent lists, and puts the answers in a seeded order.
  - stars, the lifebuoy hint, and the gold functions reward / markPaid / owed. Gold is paid only for stars not yet paid; gold that couldn't be saved stays owed and is paid once.
  - openLevels, passed, totalStars, noteSeen.
  - parseQuiz / serializeQuiz with the full validation of §10.1: plain integers, the star chain, paid ≤ stars, known seen ids, 8 KB cap, never throws.
  - One extra export, mergeQuiz, for the two-tab rule of §10.2.
- src/quizBank.js: 120 questions, exactly 10 per category per band.
  - All 72 starters of §7.5, 69 of them word for word, plus 48 new ones.
  - Questions about real geography (seas: 0): 6, 5 and 4 in bands 1, 2 and 3.
- tests/quiz.test.cjs (new): 85 checks covering everything §13.1 asks of quiz.test.cjs.

What I fixed from the previous attempt:
- The hint now takes the first wrong answer left when no rng is given.
- One test expected a lifebuoy to leave a single answer; I corrected it. Every question always keeps two answers to choose from.
- The "Aye" fact ended with a quote mark.
- A "Math.random" mention in a comment tripped the purity check.

Content review: I re-checked every question, answer, fact and sum by hand for truth, kindness, British spelling and ages 7–12, and tightened seven of the new questions:
- sea-more-sea: "of the Earth's surface".
- sea-salt: now asks where the salt that rivers carry comes from, since "most of the salt in the sea" is debatable.
- life-sea-otter: "sometimes hold paws".
- life-pufferfish: no longer says "prickly", because not all pufferfish are.
- life-albatross: the pelican was a near-miss wrong answer, so it is now the seagull.
- places-map-north: clearer fact.
- pirates-aye: new fact.

Sum wording: "gulls on 6 masts" became "rocks", and the band-1 addition fact now says "Start at the bigger number and count on".

Exit check, all met:
- The bank validates.
- The Node tests pass (85/85).
- Gold totals are 2,610 + 90 = 2,700. Random play-throughs of every island pay exactly 2,610 star gold plus nine Good-try bonuses, and nothing after that.
- 28 of 28 deliberately broken copies of the code and bank were caught by the tests.
- The game loads with the real modules, with and without ?kraken=1, with no page errors.
- The smoke suite passes 94/94.

### Files

- /home/user/First-project/src/quiz.js
- /home/user/First-project/src/quizBank.js
- /home/user/First-project/tests/quiz.test.cjs

### API notes

EXPORTS
quiz.js: QUIZ_LEVELS, CATS, ROUND, PASS, GOOD_TRY, SEEN_MAX, rng, validateBank, sumQuestion, makeRound, stars, hint, reward, markPaid, owed, openLevels, passed, totalStars, noteSeen, defaultQuiz, parseQuiz, serializeQuiz, plus one extra: mergeQuiz. Every §11.1 name is exported. quiz.js imports nothing.
quizBank.js: QUESTIONS (120 questions, imports nothing).

TABLES
- QUIZ_LEVELS rows are { name, band, answers, first, later }, as Stage 0 left them.
- CATS ['sea','life','places','pirates']; ROUND 5; PASS [3,4,5]; GOOD_TRY 10; SEEN_MAX 60.

ISLAND INDEXING (spec ambiguity resolved)
- `level` is the 0-based index into QUIZ_LEVELS: 0 is Shallow Shoals, 8 is Professor's Peak. The record's arrays use the same index.
- openLevels(rec) returns a count (1..9). Island i is open when i < openLevels(rec).
- passed(rec) gives islands with ≥ 1 star (0..9, the feat `quiz`); totalStars(rec) gives 0..27 (the feat `stars`).

ROUNDS
makeRound(bank, level, seed, { unlocked, seen, recent }) returns 5 items of { id, cat, q, options, right, fact }:
- options are the answer texts in display order (3, or 4 on band-3 islands).
- right is the INDEX of the right answer in options.
- unlocked is the highest battle level reached (1..9); junk or missing counts as 1. A places question with seas n is asked only when n ≤ unlocked.
- seen is the record's list, oldest first. recent is ids asked since the record was saved; they count as newest.
- An unseen question is preferred. When a whole pool has been seen, the one seen longest ago comes back.
- Fallbacks exist only for a broken bank: if a category/band pool is empty, the nearest band is used; if a category has nothing at all, an extra sum fills the slot.
- An unknown island gives [].

SUMS
sumQuestion(band, rand) returns { id, cat: 'sums', q, right, wrong, fact }:
- right and wrong are digit strings: 2 wrong in bands 1–2, 3 in band 3.
- The id is 'sums-<band>-<kind>-<theme>-<a>-<b>'. Sums are never stored in seen.
- Every number in a sum is ≥ 2, so every noun is plural.
- Band 1: add within 20; take-away answers ≥ 2.
- Band 2: add / take within 100; ×2, ×5, ×10.
- Band 3: times tables 2..10 × 2..10; exact sharing with 2..10 each.
- Wrong answers come from ±1, ±2 (bands 2–3 also ±10; band 3 also the swapped digits). They are distinct, never negative, never the right answer, and never 0 for sharing.
- Facts use the Unicode signs − × ÷.

STARS AND HINT
- stars(correct): numbers only; anything else gives 0.
- hint(question, removed, rand): `removed` is an array or a Set of indexes already taken away. It returns a wrong-answer index, or null when only one wrong answer is left, so a question always keeps 2 answers. With 3 answers that means 1 lifebuoy per question; with 4 answers, 2. Without an rng it returns the first wrong answer left.

GOLD
- reward(rec, level, starsWon) returns { gold, rec, newStars, goodTry }.
  - It raises stars[level] only (never lowers them) and does not change paid or tried.
  - gold = owed(new rec) + 10 if tried[level] is 0.
  - On a locked or unknown island: gold = owed only, no stars, goodTry false.
  - starsWon must be an integer; it is clamped to 0..3, and junk counts as 0.
- markPaid(rec, level, goodTry) sets paid = stars on EVERY island, and tried[level] = 1 only when goodTry === true and level is valid.
- To pay owed gold when the panel opens: gold = owed(rec); then markPaid(rec, null, false).
- The §10.2 flow:
  - r1 = reward().rec; r2 = markPaid(r1, level, goodTry).
  - Write r2, then the chest.
  - If the chest write fails, write r1 back and keep r1 in memory; otherwise keep r2.

RECORD
- parseQuiz(raw, knownIds): raw may be a storage string, an object or anything else; it never throws.
  - Strings over 8 KB are refused (gives the default).
  - Values must be plain integers, digit strings allowed, as parseShipConfig does; 1e1 / 2.0 literals are rejected where the engine exposes source text.
  - Own properties only; unknown fields are dropped; v is always 1.
  - The star chain applies; paid ≤ stars; tried is 0/1.
  - seen keeps known ids only, the newest copy of each, at most 60, the oldest dropped; at most 512 entries are scanned.
  - knownIds may be an array of ids, a Set, or the bank array itself. Without it, any well-formed bank id is kept.
- serializeQuiz validates first and writes a fixed field order. The §10.1 example round-trips byte for byte.
- noteSeen(rec, ids) accepts ids, a single id, or a round (it reads x.id) and moves repeats to the newest end.
- mergeQuiz(mine, theirs): stars and paid take the larger, tried is or-ed, seen is merged with this tab's ids counted as newer, then capped.
- Every record function returns a new record and never mutates its input (checked on deep-frozen input).

DEVIATIONS FROM SPEC3
1. Three of the 72 §7.5 starters were changed for correctness. The other 69 are field-for-field identical (checked by parsing the spec block).
   - sea-lighthouse: wrong answers "different colours / ring different bells" became "different flags / play different tunes". Lights do use colours and fog signals, so the old wrong answers were partly right.
   - life-crab: wrong answer "On tiptoe" became "Upside down". Crabs really do walk on the tips of their legs.
   - life-blue-whale: the fact "heart as big as a small car" (a known exaggeration; it is closer to a bumper car) became "Blue whales eat tiny shrimp-like krill: tonnes of them every day!"
2. validateBank is stricter than §7.4: unknown fields are an error; the id must be cat-word, start with its own category and be ≤ 48 characters (this keeps a full 60-id seen list well under 8 KB); no spaces at either end of a text; seas only on places questions, as an integer 0..9.
3. mergeQuiz is an extra export, for §10.2's storage listener.

Bank stats: longest question 73 characters (limit 90), answer 26 (limit 28), fact 90 (limit 120). Every places gate 0..8 is used.

### Verification

All Node commands were run from /home/user/First-project after publishing:
- `node tests/quiz.test.cjs`: exit 0, 85 PASS, 0 FAIL ("All quiz checks passed (85)"). It printed: longest question 73, answer 26, fact 90; places gates used 0..8; seas:0 per band 6/5/4; 120 questions, 10 per category per band. sumQuestion was checked for 10,000 seeds in each band. makeRound was checked over 9,720 rounds. The right-answer position counts were island 1 1774/1839/1787 and island 9 1398/1337/1325/1340. Five random play-throughs each paid 2700 = 2610 star gold + 9 × 10 Good try, and 0 after.
- The other Node suites, all exit 0 with 0 FAIL: combat 107 PASS (it now includes 1A's appended checks), armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server 14.
- Mutation check (scratch mutate.cjs, run on the harness copy, which is byte-identical to the published files per cmp): 28 of 28 mutants caught. Examples: paying already-paid stars, a Good try every round, no star chain, paid not capped, sums out of range, negative or 0 near misses, seas, seen or band ignored, the right answer always first, a hint that removes the right answer or leaves one answer, no per-band minimum, uncapped seen, later stars priced as the first, a locked island earning, stars lowered, 2.5 accepted, no size cap, a fixed category order, a band-3 question with 2 wrong answers, a dropped starter, American spelling.
- startercmp.cjs (parses the SPEC3 §7.5 block): 72 starters, exactly 3 field differences (the documented ones), 48 new questions.
- Browser probe (scratch probe.cjs, Playwright with SwiftShader args, NODE_PATH=/opt/node22/lib/node_modules, tests/server.cjs serve) on the real game, at ?quality=low (1280x720) and ?quality=low&kraken=1 (390x844): 12/12 PASS.
  - The bank validates in the browser and a Storm Cape round has 4 answers per question.
  - __game.quiz.record starts as the default record.
  - __game.quiz.set applies the star chain and paid ≤ stars.
  - The title screen shows 6 and 9 levels respectively, with no page errors.
- I looked at both screenshots: the title renders normally, with 6 cards at 1280x720 and the one-column phone layout at 390x844.
- `node tests/smoke.cjs`: exit 0, 94 PASS, "All checks passed".
- Not run: the full npm test (about 51 min, with other Stage 1 agents editing concurrently). No existing test reads the quiz modules, and main.js only calls defaultQuiz at load plus parseQuiz/serializeQuiz through __game.quiz, which the smoke run and the probe covered.
- Draw calls: none reported, because nothing here renders (both modules are pure).

### Hook requests

- package.json (owner 3C, Stage 3; or the coordinator earlier): in scripts.test, insert `node tests/quiz.test.cjs && ` after `node tests/upgrades.test.cjs && ` (the Node suites run first), and add the script "test:quiz": "node tests/quiz.test.cjs". Why: the new suite (85 checks, about 4 s) is not in npm test yet.
- src/main.js (owner 2A/3A), the `__game.quiz.set` placeholder and the future loadRecord of `pirates-ahoy-quiz`: import QUESTIONS from ./quizBank.js and call `quizRules.parseQuiz(raw, QUESTIONS)` instead of `parseQuiz(rec)`. Why: only then does `seen` keep only ids that exist in the bank (§10.1). Also use `quizRules.mergeQuiz(mine, theirs)` in the storage listener for `-quiz` (§10.2), and pay owed gold on panel open as `gold = owed(rec)` then `markPaid(rec, null, false)`, only after both writes succeed.
- src/quizPanel.js (owner 1O, Stage 1b re-check): build against these real shapes. A round item is { id, cat, q, options: string[3|4], right: index, fact }. `level` is the 0-based island index, and island i is open when i < openLevels(rec). hint(question, removedIndexes, rng) returns null once only two answers remain. Sum answers are digit strings.
- docs/kraken-seas/SPEC3.md §19 build record (coordinator / Stage 4): record that three §7.5 starters were corrected for accuracy (sea-lighthouse wrong answers, life-crab wrong answer 'On tiptoe', life-blue-whale heart fact), and that the Stage 1 additions are the 48 ids that are not in §7.5.

### Open issues

- tests/quiz.test.cjs is not in npm test until package.json is edited (hook request; package.json is owned by 3C).
- main.js's __game.quiz.set still calls parseQuiz(rec) without knownIds, so seen keeps any well-formed bank id rather than only real ones. This is harmless now and is fixed by the hook request when 2A/3A wire the record.
- The lifebuoy always leaves two answers (one useful lifebuoy per 3-answer question, two per 4-answer question). §7.2 does not say this; 1O's panel should grey out or skip the Lifebuoy button when hint() returns null.
- Stage 4's content review should re-read the 48 new questions. Every one was checked by hand for truth, tone and British spelling, but no outside source was fetched (no network).

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1E/menu-1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1E/menu-kraken-390.png

## 1F Economy & looks data

_Workflow run wf_ea2433f2-028._

### Summary

Row 1F is done and I made no edits this session. I audited the four published files against SPEC3 §3.1, §9, §10.1–10.3, §11.1, §13.1 and §13.4 and found no defect in them. upgrades.js delivers RUDDER, SHIPYARD = [...UPGRADES, RUDDER], a sparse up.rudder (read only as a plain integer 1..3, written last and only from tier 1), playerType turn = SAIL_TURN × turnMul and turnLow = RUDDER.values[t], and statText('rudder') = "50% turn when slow". UPGRADES and defaultShipConfig are unchanged. cosmetics.js delivers FEAT_IDS with kraken/quiz/stars/island (caps 1/9/27/30), the four trophies (hat.mortarboard quiz≥9, coat.governor island≥30, pet.octopus kraken≥1, pet.rainbow a parrot with rainbow petColor stars≥27) and the six new faction crews per §4.3. With WITH_KRAKEN false the ship record and the battle turning are exactly as today: at rudder tier 0, turn is 1.4/1.5/1.6 and turnLow is 0.35, which equals main's TURN_LOW, and today's ship records are already canonical. One thing is visible in the live game now, and I cannot fix it in my files: Polly's wardrobe and the captain's log list the four new trophies as locked, because they iterate ITEMS (§13.4 C6 requires the 8 trophies in ITEMS). I filed that as a hook request for townMode.js. Both Node suites pass, every existing upgrades check passes unedited, and all mutations were caught.

### Files

- /home/user/First-project/src/upgrades.js (earlier attempts, uncommitted; not edited this session)
- /home/user/First-project/src/cosmetics.js (earlier attempts, uncommitted; not edited this session)
- /home/user/First-project/tests/upgrades.test.cjs (earlier attempts: 196 lines appended, 0 removed; not edited this session)
- /home/user/First-project/tests/cosmetics.test.cjs (earlier attempts: rows C1-C10 + 2 necessary lines + appended checks; not edited this session)

### API notes

upgrades.js:
- `export const RUDDER = { id: 'rudder', name: 'Big rudder & wheel', blurb, stat: 'Turning when slow', values: [0.35, 0.5, 0.65, 0.8], turnMul: [1, 1.05, 1.1, 1.15], costs: [120, 300, 550] }` and `export const SHIPYARD = [...UPGRADES, RUDDER]`.
- The private upgrade(id) searches SHIPYARD, so nextCost, maxTier and statText know 'rudder'.
- parseShipConfig keeps up.rudder only as a plain integer ≥ 1 (clamped to 3; 0 and junk are dropped), as an own property, written after the six tiers. serializeShipConfig writes it only from tier 1.
- playerType adds `turnLow: RUDDER.values[tier]` and sets `turn: tidy(SAIL_TURN[sails] × RUDDER.turnMul[rudder])`.
- statText('rudder', t) → "35% / 50% / 65% / 80% turn when slow".
- UPGRADES and defaultShipConfig() are unchanged.

cosmetics.js:
- FEAT_IDS = the five + 'kraken', 'quiz', 'stars', 'island'. parseFeats caps them at 1 / 9 / 27 / 30, and serializeFeats writes them after legend and before prizes.
- Four trophies: hat.mortarboard "Professor's mortarboard" (quiz 9), coat.governor "Governor's coat" (white coat, gold facings and waistcoat front; island 30), pet.octopus "Baby kraken" (people.js pet 'octopus'; kraken 1), pet.rainbow "Rainbow macaw" (a parrot with a red-orange/green/blue petColor; stars 27).
- FACTION + FACTION_LOOK for shark, bombketch, ironclad, fireship, skiff and inkheart (skiff and inkheart share the Kraken Crew look).
- New PALETTE hexes: rainbowBody, rainbowWing, rainbowHead, academic, octoSucker, octoSpot, sharkGrey, mustard, turtleGreen, inkTeal.

Deviations from SPEC3:
1. Two extra exports not in §11.1:
   - `MAX_FEATS = ['legend', 'kraken', 'quiz', 'stars', 'island']`: the feats §10.2 says merge by max; for main's syncFeats.
   - `KRAKEN_ITEMS = ['hat.mortarboard', 'coat.governor', 'pet.octopus', 'pet.rainbow']`: so a screen can hide them while WITH_KRAKEN is false.
2. tests/cosmetics.test.cjs has two edited lines outside rows C1–C10:
   - :798 adds `mortarboard: 'mortarboard'` to the HAT map.
   - :818 accepts `pet === 'octopus'` for the octopus item.
   Both existing checks loop over every captain item, so they cannot pass with the new trophies otherwise; §13.4 missed them.
3. playerType rounds turn to 1e-6 (tidy) so 1.4 × 1.05 reads 1.47, not 1.4700000000000002.
4. The Bomb Ketch crew wear brown leather caps and belts with mustard shirts. §4.3 says only "mustard shirts, caps"; this was chosen in the earlier critique rounds so they don't look like the galleon's yellow crew.

### Exit check

1. "Both suites green": met. upgrades 52/52 and cosmetics 83/83 this session, and the same counts in the coordinator's 19:12 run.

2. "Every existing upgrades.test.cjs check passes untouched": met.
   - The diff is additions only: 196 added, 0 deleted, all after line 361.
   - HEAD's unmodified upgrades.test.cjs passes 37/37 against the new upgrades.js.

3. §13.4 rows C1–C10: met.
   - Each row is applied at its line: :66/:67/:73 (C8), :93–95 (C1–C3), :106 (C4), :124 (C5), :257 (C6), :269 (C7), :465 (C9), :539 (C10).
   - Two more necessary edits are at :798 and :818 (see api_notes).

### Verification

This session (2026-10-21, about 19:13–19:20 UTC):
- node tests/upgrades.test.cjs → "All upgrade checks passed (52)".
- node tests/cosmetics.test.cjs → "All cosmetics checks passed (83)", including the trophy minimums checked against quiz.js and island.js: 9 / 27 / 30.
- `git diff --numstat tests/upgrades.test.cjs` → 196 added, 0 deleted, all after line 361.
- HEAD's test file (git show HEAD:tests/upgrades.test.cjs), run against the current src through a symlinked mirror → "All upgrade checks passed (37)". So every existing check passes untouched.
- The published files are byte-identical to the earlier attempts' dev copies in /home/user/First-project/.dock-harness/kraken/1F/dev (cmp).

Mutation checks (re-run with the earlier attempt's mutate.py; outputs in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/close/):
- upgrades: all 14 mutations caught (mut-up.out). 13 show failing checks; 'upgrade() misses rudder' makes the suite crash with exit 1 and no FAIL line, because playerType throws.
- cosmetics: 25 of 28 caught (mut-cos.out). The other three patterns no longer exist after the earlier critique rounds changed the crew looks, so I wrote 5 replacement crew mutations; all 5 caught (mut-cos2.out).

Coordinator's npm test log (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/npmtest-s1.log, started about 19:12): cosmetics 83 and upgrades 52 passed. At 19:17 smoke was passing (adaptive resolution passed at scale 0.85). I did not wait for the browser suites; town.cjs, which shows the new trophies in the wardrobe and log, had not run yet.

Screenshots I opened, from the earlier attempt on 10-19:
- r1/trophies-1280.png and trophies-390.png (03:53).
- r3/factions-1280.png, crews-390.png and fight-1280.png (03:54–03:55).
- g1/dev-1280x720-wardrobe-pets.png and dev-1280x720-log.png (03:57–04:00).
The r3 crews match the published faction code: shark grey sashes, brown caps and belts on the bomb ketch, grey sash on the ironclad, purple sashes on the Kraken Crew. The only other difference between the 03:47 mutation copy and the published file is a header comment. So I did not re-run the harness.

The earlier attempt's browser runs (10-19, on the tree as it was then; other rows have changed since):
- npmtest.log (04:26): the Node suites passed; smoke failed only 'adaptive resolution (scale 1)'.
- browser.log (04:30–06:30): audio passed; battle 182/0; levels 70/1 (review4 page.goto timeout); town 119/2 (two sections crashed with page.goto timeouts); controls stopped at an #exit-btn click timeout at 04:49.
- rerun.log (06:32–06:42): levels review4 6/0 and town review4 17/0, including the captain's log trophy check and A11Y-3 on Polly's list.
I did not re-run any browser suite, as instructed.

### Hook requests

- src/townMode.js (2B, Stage 2), wardrobe builder `for (const it of Object.values(ITEMS))` (~line 289) and captain's log `const trophies = Object.values(ITEMS).filter((it) => it.trophy)` (~line 1172): import KRAKEN_ITEMS from './cosmetics.js' and skip those four ids unless ctx.withKraken is true. Why: with WITH_KRAKEN false, Polly's live wardrobe shows 'Baby kraken: Locked: drive off the Kraken', 'Rainbow macaw: Locked: win all 27 quiz stars', the mortarboard and the Governor's coat, and the captain's log counts them. These are features the live game doesn't have yet (see /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/g1/dev-1280x720-wardrobe-pets.png). Once WITH_KRAKEN is true they show as designed.
- src/main.js (2A), syncFeats (~line 417): for ids in MAX_FEATS (import from cosmetics.js) use `next[id] = Math.max(next[id] || 0, feats[id] || 0)` instead of adding `more(feats[id], featsSaved[id])`. Keep adding deltas for captures/boardings/rakes/crits and prizes. Why: §10.2 says legend/kraken/quiz/stars/island mirror progress and must merge by max between tabs; adding deltas over-counts.
- src/main.js (2A): replace `const TURN_LOW = 0.35` (~line 2760) with `RUDDER.values[0]` (import RUDDER, SHIPYARD from './upgrades.js'), per §11.1 'no second 0.35'. Also: buyUpgrade looks the id up in SHIPYARD with new tier `Math.min(maxTier(id), (shipConfig.up[id] ?? 0) + 1)` (§10.2), and the shipyard panel lists `WITH_KRAKEN ? SHIPYARD : UPGRADES`. upgrades.js already supports all of this.

### Open issues

- Live game with WITH_KRAKEN false: Polly's wardrobe and the tavern's captain's log now list the four Kraken Seas trophies as locked. Their lock texts refer to the Kraken, the quiz and island building, none of which exist in the live game yet. The trophies have to be in ITEMS (§13.4 C6 requires 8), so the fix belongs in townMode.js: see the first hook request, which uses the KRAKEN_ITEMS export. Nothing breaks: the earlier town.cjs reruns passed with them.
- Per the spec (§10.3, row C2), the feats record is now written with "kraken":0,"quiz":0,"stars":0,"island":0. So existing players' feats text gains these fields now, not at Stage 3. Older builds read the record fine, because parseFeats drops unknown fields.
- Not verified by me: the coordinator's browser suites, in particular town.cjs's wardrobe and log checks with the 8 trophies. They were still running (smoke) when I finished. The earlier attempt's controls.cjs run (10-19 04:49) stopped at an #exit-btn click timeout that looks like load-related flakiness; it was never re-run by that attempt.
- The §13.4 table misses two lines of tests/cosmetics.test.cjs (:798 HAT map, :818 pet check) that had to change with the new trophies. The coordinator may want to add them to §13.4.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/r1/trophies-1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/r1/trophies-390.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/r3/factions-1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/r3/crews-390.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/r3/fight-1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/g1/dev-1280x720-wardrobe-pets.png

## 1G Characters

_Workflow run wf_ef2b6b15-c5e._

### Summary

Row 1G (src/people.js) is finished and checked, apart from browser suites I could not get green because the machine was overloaded. The previous attempt had already written the change in its dev copy and published it to src/people.js (src/people.js is byte-identical to .dock-harness/kraken/1G/dev/src/people.js, +379/-16 lines against HEAD). I re-checked it against the live file rather than rewriting it.

New options:
- hat 'mortarboard': navy skullcap, a square board turned corner-forward, a gold button and cord, and a tassel on its own bone that hangs straight down and swings.
- pet 'octopus' (the baby kraken): a small purple octopus on the four parrot bones. It has big eyes, pink spots and pale suckers, eight swept-tube tentacles and a slow squash-and-stretch bob. In 'cheer' it hops onto the hat and waves its two front tentacles. It also rides on the hat whenever the left arm is up or busy in front.
- tool 'pointer': taps the open left palm when idle, is carried over the shoulder like the fishing rod when walking, and points in 'point'.
- One more boolean option, glasses, so Professor Barnacle can be given his round spectacles.

Exit check:
- 400-seed comparison, re-run against the live src/people.js: 2,098 option sets (seeds 1-400 as seed / kind / mixed / crew / enemy, every captain catalogue item, the 34 townsfolk). 0 differences in userData.look and parts, 0 in the geometry hash of 648 deep sets, 0 in 59,616 bone poses.
- Material groups: at most 3 (people:ink, people:thin, people:flat) across 300 builds of every new-option combination × 5 body kinds × 3 detail levels × shared and unshared. No throws or NaN bones in any of the 23 actions.
- Harness grid of the new options × actions: screenshots at 1280x720 and 390x844, looked at over three critique rounds. Nothing needed a code change.

### Files

- /home/user/First-project/src/people.js

### API notes

What src/people.js now exports and accepts (SPEC3 §11.1 row people.js):
- HATS gains 'mortarboard' at the end and TOOLS gains 'pointer' at the end. Both lists are only used for includes() checks, so no rng draw changes. The new options draw no rng() values, so every existing call builds exactly as before (proved by the 400-seed comparison).
- buildPerson({ hat: 'mortarboard' }): hatColor defaults to MORTAR 0x2c2f4a (navy); an explicit hatColor overrides it. The trim (button, cord, tassel) is L.hatTrim (gold). It covers the hair like the other hats. Adds parts.tassel, a bone on the head at the board's left corner, last in the skeleton and only with this hat.
- buildPerson({ pet: 'octopus' }): uses the parrot's bones (pet, petHead, petWingL, petWingR); for the octopus petHead and the two petWing bones sit at different rest positions. The petColor keys map to body = mantle and tentacles (default 0x8a5bd6), wing = suckers (0xffc2e0) and head = spots (0xff8fc8); leave petColor out to get these defaults.
  - 'cheer': it hops onto the hat and waves both front tentacles.
  - On the hat (OCTO_UP): cheer, surrender, swing, fall, lean, steer, fiddle and haul, plus wave when the left hand waves.
  - 'fall' with { since }: it hops from the shoulder to the hat over 0.3 s.
  - Everywhere else it sits on the left shoulder and bobs (2.6 s).
- buildPerson({ tool: 'pointer' }):
  - 'idle': grip in the right hand, the stick across the chest resting on the open left palm, tapping it twice every 2.9 s.
  - 'walk', 'run' and other stand-ins: shouldered like the rod.
  - 'point': points along the arm.
  - 'carry', 'wave' and similar: held upright like the rod and hammer.
  - Its bounds reach is 1.45, like the mop.
- Deviation: the new option glasses: true / false sets L.glasses (today only 'old' people get glasses, at random). It draws no rng(). It was added so 1N can guarantee Barnacle's "round spectacles" (§7.1).

Integration notes:
- For 1N (sparrow.js): Barnacle = { kind: 'old', hat: 'mortarboard', tool: 'pointer', beard: 'full', glasses: true, pet: 'parrot', petColor: { body: 0x2fa84f, wing: 0x2f86ea, head: 0xffc93c }, detail: 'low' }, posed 'idle' (palm taps) or 'point'. Bess = { kind: 'woman', hat: 'bandana', tool: 'hammer', detail: 'low' }.
- For 1F (cosmetics.js): hat.mortarboard opts { hat: 'mortarboard', hatColor: <navy> }; pet.octopus opts { pet: 'octopus' }, optionally with the petColor above.

Draw calls: every person still costs 5 (23 people = 115 calls in the grid; 4 people plus a deck = 22). The new options add none.

Triangles: Barnacle at low detail 4,544. The captain at mid detail wearing every catalogue item plus mortarboard and octopus stays at or under 10,218, inside the 12k captain rule. The highest of all combinations at default (high) detail is 14,936.

### Verification

Look comparison: `node compare.cjs 'b=/src/people.js'` (harness /home/user/First-project/.dock-harness/kraken/1G/compare.html; base = HEAD people.js, confirmed with cmp) gave {sets 2098, looks 2098, geos 648, poses 59616, bad 0}.

Material groups: /home/user/First-project/.dock-harness/kraken/1G/groups.html gave {builds 300, maxGroups 3, mats [people:ink, people:thin, people:flat], maxTris 14936, maxCaptainMid 10218, bad 0}.

Draw calls (grid.html / scene.html, game renderer from src/scenery.js): 115 calls for 23 people; 70 for 14; 50 for 10; 30 for 6; town-distance scene 22 (4 people + deck).

Node suites run now, all green: combat 107, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server passed.

Browser suites run now on the live tree, with load average 24-35 on 4 cores from the other agents:
- town.cjs full run: 119 passed, 2 failed. The 2 are the review4 and review4-world sections crashing on page.goto timeouts (120 s).
- TOWN_ONLY=review4-world alone: 9/9 passed, including 'walking into a townsperson on a narrow rope bridge never walls the captain in: 10 of 10 runs get across', LOOK-2, TOWN-3 (48 runs, 0 stopped), PERF-1/2/3.
- TOWN_ONLY=review4 alone: 6 passed, 1 failed (page.goto timeout on its second page, the 390x844 touch page). Run side by side with a mirror of the tree using the base people.js, and on a pure `git archive HEAD` tree, it failed identically each time. So this failure comes from the load, not from people.js.
- smoke.cjs: 15 passed, then failed at the 'adaptive resolution' check, and the run then stopped on a 120 s timeout (the intro / a screenshot). A pure-HEAD mirror run at the same time failed at the same point with the same 15 passes.

Earlier runs by the previous attempt with this same people.js (file mtime 2026-10-17 21:40, before all of these logs):
- npm test at 23:06: Node suites, smoke 'All checks passed', controls and audio green; battle had 1 browser-closed crash.
- Later single-suite reruns: controls 232/0, audio 50/0, battle 182/0, levels 73/0.

Screenshots: about 20 PNGs at 1280x720 and 390x844, every one opened and inspected with Read (paths in the screenshots field).

### Hook requests

- src/townMode.js (Stage 2 owner 2B), function greetLine: replace `if (look.cap && look.cap.pet && look.cap.pet !== 'none') lines.push('Is that a parrot?!', 'Is that a parrot?!', 'Is that a parrot?!');` with `const pet = look.cap && look.cap.pet; if (pet === 'octopus') lines.push('Is that a baby kraken?!', 'Is that a baby kraken?!', 'Is that a baby kraken?!'); else if (pet && pet !== 'none') lines.push('Is that a parrot?!', 'Is that a parrot?!', 'Is that a parrot?!');`. Why: once 1F adds the pet.octopus trophy, townsfolk would greet a captain wearing the baby kraken with 'Is that a parrot?!'.

### Open issues

- Browser suites could not be shown green in this session: the machine ran at load average 24-35 on 4 cores. smoke.cjs and town.cjs review4 fail with 120 s timeouts, and they fail identically on a pure `git archive HEAD` tree run at the same time. Re-run smoke.cjs and town.cjs (and battle/levels/controls) on a quieter machine before Stage 1 closes. The earlier runs with this same people.js were green.
- Cosmetic and minor: during the 0.3 s 'fall' hop (only with opts.since) the baby kraken briefly passes through a wide tricorn brim on its way to the hat. Only overboard tumblers use 'fall' with since, and they never carry the octopus pet. It could be tuned in Stage 3E (the arc constants in octoPose).
- The mortarboard's tassel hangs straight down in the person's own space. On a rolling deck or a tumbling body it hangs along the person's down, not the world's. This is the same kind of simplification the existing worn parts make.
- At town distance the baby kraken on the shoulder reads as a small purple shape, about the size of the parrot pet. That matches 'a tiny purple octopus'; it was already drawn at 1.25x (OCTO_Z) to help it read.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/barnAct.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/phoneBarn.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/phoneOcto.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/hatsCheer.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/kinds.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/octoClose.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/mortarClose.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/mortarCap.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/sceneWide.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v1/scenePhone.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v2/octoSide.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1G/v2/octoBack.png
- …

## 1H Shipwright

_Workflow run wf_de71420f-ae3._

### Summary

I picked up the previous attempt's work and checked it: row 1H's src/ships.js was already published (sha1 87560bbcf5995d244e00642091aa581c1caad834, 5,971 lines, the same as the dev copy). I made no further code changes because nothing failed review.

It contains:
- **The six new ships (§4.3):**
  - Shark Raider: toothy grin, fin sail, iron ram, tail.
  - Bomb Ketch: mustard hull, two short masts, a bronze mortar that jumps and blows a smoke ring.
  - Iron Turtle: riveted hexagon shell over the deck, turtle-head figurehead and flippers.
  - Fire Ship: tarred sloop piled with barrels; once lit, flames climb her rigging with shape flicker and embers, never brightness.
  - Squid Skiff: a purple variant of the raider builder with a squid prow and googly eyes.
  - Inkheart: purple-black three-master, gold scales on her stern castle, a carved kraken on the bowsprit with amber eyes, tattered violet sails with a painted eye.
- **Special projectiles:** fire, frost and stink, plus a mortar shell and an ink pot. Geometry is cached and the material shared.
- **Player props:** Big rudder & wheel tiers 1–3 and the keg rack. Both are baked into one vertex-coloured mesh and show only when a tier is above 0 or a recipe is owned.
- **userData.statusAnchors** on every ship, kept current by addHole and clearHoles.
- **The fire ship's fuse** (userData.fuse) and a mortar hook (userData.mortar) on the ketch and the Inkheart.

The existing player model and every existing ship are byte-identical to HEAD: 115 of 115 fingerprints match. Every model's draw calls are within budget.

I did one more critique round myself, looking at every previous sheet and close-up plus two new renders at 1280x720 and 390x844. I found no defects. One small polish note is under open issues.

Browser tests are not all green on this machine. Nine suites were running at once from other agents (load 15–34 on 4 CPUs), and every failure I saw was a timeout. Each failing spot fails the same way on an untouched copy of HEAD, so none comes from ships.js. A full npm test still needs to run on a quiet machine.

### Files

- /home/user/First-project/src/ships.js (published by the previous attempt on Oct 17 22:12 and verified unchanged in this session, sha1 87560bbcf5995d244e00642091aa581c1caad834; no new edits this session)
- /home/user/First-project/.dock-harness/kraken/1H/view.html, fp.html, base/, dev/ (harness, git-ignored; previous attempt)
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/j_calls2.cjs, j_lineup.cjs, chainA-D.sh (new scratch probes and runners this session)

### API notes

src/ships.js exports are unchanged in name and signature: buildShip, animateShip, disposeShip, projectileMesh, addHole, clearHoles, setShipDamage, hoistFlag. Additions as specified in §11.1:

- **buildShip(type) for the new types:** shark, bombketch, ironclad, fireship, skiff, inkheart (internal BUILDERS keys). It no longer throws for them.
- **The Squid Skiff** comes from the same longship builder as the raider (raiderBoat with RAIDER_LOOK or SKIFF_LOOK). The raider is fingerprint-identical.
- **buildShip('player', { ..., upgrades: { ..., rudder }, powder }):**
  - rudder is sparse: missing or junk reads as 0, and the value is clamped to 0..3 inside ships.js, so it does not depend on upgrades.js.
  - Tier 1 adds a big rudder blade. Tier 2 swaps in a bigger, gold-trimmed wheel. Tier 3 adds a brass wheel and a compass binnacle (the stock wheel is skipped from tier 2).
  - powder accepts the specials.js record { v, own: { fire, frost, stink } } (1 or true = owned) or a bare { fire, frost, stink }. Owned recipes show as kegs on a tray beside the main hatch, each in its special's colour with a white icon on the lid, plus a deck blocker.
  - All of these props are one baked vertex-coloured mesh, at most +2 draw calls.
  - At rudder 0 with no recipes the model is exactly today's.
- **userData.statusAnchors** on every ship: { rail: [{x, y, z}] (8 points per side, starboard first, along the waist cap rails), deck: {x, y, z}, holes: [{x, y, z, side}] newest first, at most 8 }. Ship-local, +x = port. addHole unshifts and clearHoles empties.
- **userData.fuse** (fire ship only): { lit, level, k }. Set lit = true and the flames bloom on her cargo, then climb to the masthead in 1.6 s; lit = false and they die down in 0.5 s. level (0..1) drives them directly; null follows lit. Driven inside animateShip on visual time.
- **projectileMesh:** 'fire', 'frost' and 'stink' as specified. Each is one vertex-coloured mesh on a shared outlined toon material ('ship:special-shot'), with geometry cached and never disposed. Visual wobble or flicker runs in onBeforeRender, like the chain shot's spin.

Deviations, all additive:
1. projectileMesh also takes 'shell' (the ketch's iron shell with fuse and spark) and 'ink' (the Inkheart's ink pot), for launchBomb kinds shell and ink.
2. userData.mortar on the Bomb Ketch and the Inkheart, which the spec's art asks for but §11.1 does not name: { muzzle: {x, y, z}, dir: {x, y, z}, fire(t) }. fire(t) takes the visual time animateShip gets and makes the mortar hop and blow a smoke ring for 1.15 s.
3. sternCastle records S.castle (no geometry), so the rail anchors start past the stern castle.

The fingerprint harness ignores the new userData keys (statusAnchors, fuse, mortar); everything else, including all geometry and materials, is compared.

### Verification

All results below are for src/ships.js sha1 87560bb…, the same file throughout.

**Harness checks (game renderer, SwiftShader, 1280x720):**
- **Fingerprint** (fp.cjs, HEAD copy against the dev copy, which cmp shows equals src/ships.js): 115 keys, 115 identical, 0 different. It covers 9 existing enemy types, the player with every look, every upgrade tier, grapples 0–2, rudder 0 with no powder and junk options, each model put through damage levels 1–2, mast down, white and player flags, 10 holes, animateShip, clearHoles, and the round, chain and grape projectiles.
- **Gun ports** (j_ports.cjs, the exact counter from tests/controls.cjs): 48 player models (guns 0–2 × rudder 0–3 × powder none/all × hull 0/3), 0 mismatches. For example, guns tier 0 counts 3 a side and the fully upgraded model with rudder 3 and all three kegs counts 5 a side.
- **Draw calls per model** (j_calls.cjs, model alone with lights, both outline passes; whole / wrecked with 3 holes and the fuse lit):

| Model | Calls | Wrecked | Triangles |
|---|---|---|---|
| Man-o'-War (budget reference) | 26 | 39 | 69,116 |
| shark | 12 | 17 | 23,980 |
| bombketch | 25 | 32 | 41,244 |
| ironclad | 18 | 27 | 70,028 |
| fireship | 14 | 26 | 41,524 |
| skiff | 12 | 17 | 61,168 |
| inkheart | 29 | 42 | 111,848 |

  All six are at or under the Man-o'-War's 26 / 39; the Inkheart is under her 1.3× cap of 33.8 / 50.7.
- **Player props** (j_calls2.cjs): stock 58 calls; any rudder tier from 1 or any recipe owned gives 60 (one mesh). §14 allows today + 4.
- **Projectile triangles:** round 168, chain 480, grape 720, fire 888, frost 176, stink 2,080, shell 268, ink 984.

**Screenshots:** I looked at all six sheets at 1280x720 (3 angles × sound / battered / wrecked with mast down and white flag), the Inkheart sheet at 390x844, the close-ups, the fuse stages, the mortar frames, the projectiles, the prize flags, the anchors, the keg corner, the player chase view at both sizes, and the in-game spawn and boarding grid. I also rendered and looked at a new round: all six new ships beside the Man-o'-War and raider at a fixed 24 u, at 1280x720 (159 calls for 8 panels) and 390x844, plus a detail sheet (lit fire ship, shark head-on, ketch mid-fire, turtle from above; 85 calls) at both sizes. No defects found.

**Node suites:** combat 107, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server: all passed.

**Browser suites on the live tree** (load average 15–34 from other agents' suites):
- **battle.cjs:** 182 PASS, 0 FAIL, exit 0.
- **town.cjs:** 119 PASS, 2 FAIL. review4 and review4-world crash with "page.goto: Timeout 120000ms" when a second page opens (town.cjs:1390 and :1455). The same crash happens on the pure HEAD tree (TOWN_ONLY=review4: 6 PASS, 1 FAIL at the same line).
- **levels.cjs:** 70 PASS, 1 FAIL. review4 crashes with a page.goto timeout opening a second tab (levels.cjs:1208); the same on the pure HEAD tree.
- **controls.cjs:** never completed.
  - Run 1: 133 PASS, 0 FAIL, then a page.reload 30 s timeout at :1356. All four gun-port checks passed: 3 a side on the stock ship, 4 after buying, 5 at the second tier, and 5 / 5 on the model at sea.
  - Run 2: 103 PASS, 0 FAIL, then a click timeout at :1018.
  - CONTROLS_ONLY=phone 21 PASS, 0 FAIL. CONTROLS_ONLY=review2 19 PASS, 0 FAIL.
  - CONTROLS_ONLY=storage: 1 PASS, then a reload timeout at :2076; the pure HEAD tree does the same.
- **smoke.cjs:** never completed.
  - Run 1: 3 PASS, then 1 FAIL (adaptive resolution, scale 1), then a screenshot timeout.
  - Run 2: 15 PASS, 1 FAIL (adaptive), then a timeout waiting for the real-time fly-in at :133.
  - Run 3: 16 PASS, 0 FAIL, then the same :133 timeout.
  - Pure HEAD tree: 15 PASS, 1 FAIL (adaptive), then the same :133 timeout.
  - adapt.cjs, alternating HEAD and live twice each: all four FAIL (scale 1), because the adaptive logic undoes a step down that doesn't help a CPU-bound renderer.

**Earlier runs of the same file** (the previous attempt, logs2): smoke 94/0, controls 232/0.

**Not run this session:** a full npm test, audio.cjs, and the remainder of controls past :1387 apart from the phone and review2 sections.

### Hook requests

- src/main.js (2A), buildPlayerMesh() line 914: pass the powder record so the keg rack shows: buildShip('player', { type, look: shipConfig.look, upgrades: shipConfig.up, armory: { grapple: armoryCfg.up.grapple }, powder: state.powder }). shipConfig.up already carries the sparse rudder tier once 1F lands it. Why: SPEC3 §2.7 and §3.1, the model shows the kegs and the rudder tiers.
- src/main.js (2A), where mechanics3 reports a fire ship lit (FIRESHIP, within 30 u) or doused or struck: set e.mesh.userData.fuse.lit = true or false (or fuse.level = 0..1 to follow the arming timer exactly). Why: §4.2, the flames climbing her rigging are her telegraph of at least 1.6 s; ships.js animates them inside animateShip.
- src/main.js (2A), launchBomb(spec) for kind 'shell' or 'ink' fired by a Bomb Ketch or the Inkheart: call from.mesh.userData.mortar.fire(t) with the visual time passed to animateShip, start the shell at from.mesh.localToWorld(new THREE.Vector3(m.muzzle.x, m.muzzle.y, m.muzzle.z)) where m = from.mesh.userData.mortar, and use projectileMesh('shell') or projectileMesh('ink') as the flying shell. Why: §4.3, the mortar jumps and puffs a smoke ring when it fires.
- src/main.js fire() (2A): no change is needed for specials; projectileMesh(b.ammo) already returns the fire, frost and stink balls when given those ids.
- src/townMode.js and main.js (2B/3A): when a Powder-room recipe is bought, rebuild the docked ship (today PERF-1 rebuilds it only for grapples) so the new keg appears on deck. Why: §2.7, the kegs are shown for the recipes owned.

### Open issues

- No full npm test ran green in this session. Nine browser suites from other agents kept the 4-CPU machine at load 15–34. Every failure was a timeout: town review4 / review4-world and levels review4 (a second page's goto), controls (reload or click, 30 s), smoke (the real-time fly-in at :133, and the adaptive-resolution check). Each reproduces identically on an untouched copy of HEAD at /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/headtree, so none is caused by ships.js. The coordinator should run the full npm test on a quiet machine. Logs: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/logs3/.
- Polish for 3E: the white flame icon on the fire keg's lid reads a little like a 'G' at a steep close angle. It is only a few pixels from the chase camera and the keg colours already tell the three apart, so I left it.
- Triangle counts: the Inkheart is 112k triangles across both outline passes (the Phantom is 97k); the skiff is 61k against the raider's 48k because of its squid prow tentacles. Both are within the draw-call budgets. Worth watching in the 3E phone draw-call audit.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/r4_lineup_1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/r4_lineup_390x844.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/r4_detail_1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/r4_detail_390x844.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/sheet_shark_1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/sheet_bombketch_1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/sheet_ironclad_1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/sheet_fireship_1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/sheet_skiff_1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/sheet_inkheart_1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/sheet_inkheart_390x844.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1H/shots/fuse_a.png
- …

## 1I Status & Kraken art

_Workflow run wf_bf5ab9e4-ea7._

### Summary

I closed out row 1I without editing anything. The audit of the five published files (src/statusfx.js, src/krakenView.js, src/tags.js, src/pops.js, fx.css) against SPEC3 §2.7, §5.7.1–5.7.2, §6.3–6.4 and §11.1 found no real defects. Each file is identical to its harness dev copy, and all four JS modules pass a syntax check.

With WITH_KRAKEN false the live game should behave as today. main.js only imports statusfx and krakenView as namespaces and never calls them. The new tags.js code runs only when ship.status is an object whose id is 'fire', 'frost' or 'stink'; a string or junk status draws no badge. pops.js only adds new styles. The #boss-status rules in fx.css cannot show the badge because style.css has `.hidden { display: none !important; }`.

The earlier attempts left the harness evidence, and I looked at their screenshots. One gap remained: 1C changed src/kraken.js on 2026-10-19 at 03:52, after 1I's last run against the real simulation. I ran one new harness round with the current kraken.js driving the published krakenView and statusfx through the whole fight (rise, phase 1, phase 2 ink, fire, stink sneeze, a grab, phase 3, driven off, the Pearl) at 1280x720 and 390x844. It ran with no page errors and no NaN matrices. Draw calls stayed within budget and the screenshots look right.

### Files

(none changed in the reporting run)

### API notes

Delivered (unchanged this session):
- src/statusfx.js: `createStatusFx(scene, { reducedMotion, seaY }) → { sync(ships, t, dt), clear(ship), read(), get meshes, dispose() }`, plus `export const STATUS_IDS`. It reads ship.status and mesh.userData.statusAnchors (real 1H anchors; ships without anchors get some made from their size).
  - Deviation: §11.1 asks for 6 InstancedMeshes with caps 120/36/48/60/24/16. It has 5, all noOutline: one sprite mesh from an atlas (flames, sail chars, flakes, stink lines, swirls, flies; cap 128), icicles (128), plates and rail snow (64), puffs (60), and the puffs' ink twin. Worst case is 5 draw calls, inside both the ≤ 6 and the ≤ 8 limit.
  - Additions: the `seaY` option (ice plates ride the waves) and the `read()` and `meshes` test hooks.
- src/krakenView.js: `createKrakenView(scene, { reducedMotion, foamColor, seaY, rings }) → { prepare(), get ready, update(visuals, t, dt), riseCamera(k, from?), statusShip(status), read(), dispose() }`.
  - Body: one rigidly skinned SkinnedMesh with 3 material groups. Also: up to 4 skinned tentacles in one SkinnedMesh, noOutline eyes, the shadow decal, and bubbles, rings and fills as InstancedMeshes. The pearl only shows after the fight. Worst case is 18 draw calls.
  - Additions beyond §11.1:
    - `riseCamera`'s optional `from` ({ x, z, h, duration }).
    - `statusShip(status)`, which returns a ship-like object for statusfx so the Kraken's status shows on the part that burns, the head, or the shadow.
    - `read()`.
    - The `seaY` and `rings` options.
  - Input: it accepts kraken.js's current visuals() shape exactly (shadow, head, eye, tentacles, rings with kind/from, boil, pearl, rise, burn), checked against kraken.js as of 2026-10-19 03:52.
- src/tags.js:
  - Status badge (flame, snowflake or stink cloud cut-outs) at the left end of the hull bar. It replaces the chain badge while a status shows, so there is still one badge per tag.
  - Ring of 8 time dots in the existing pip InstancedMesh (still 1 draw call for the fleet).
  - RAM chevrons icon: tagIcon 'ram'.
  - read() gains `status: { id, dots } | null`.
  - Deviation: PER_TAG = 23 (today's 15 + 8 dots). §6.4's "10 + 3 = 13, so 21" used a stale count of today's instances.
  - The atlas is now 4×5 cells (512×640).
- src/pops.js: styles 'fire', 'frost', 'stink', 'kraken'.
  - They count as important (they jump the queue).
  - "<WORD!> <more>" splits into two lines, e.g. FIRE OUT! / SSSS!.
  - Mod classes 'kaboom' (KA-BOOM!) and 'eye' (BULLSEYE!).
  - Deviation: §2.7 says pop text is "white ≥ 24 px". The new styles use light tints of their effect colour (#ffc46b, #c9f1ff, #c6f27a, #efc4ff, #ffd166, #ffe14d), with white second lines and the 3 px ink outline. All are ≥ 24 px; the smallest measured is 28 px at 568×320.
- fx.css: pop styles, plus the #boss-status badge. main sets `data-status="fire|frost|stink"`, the word as its text, and `--left` (0..1) for the 8-dot ring. Phone portrait shows the shape only; landscape phones hook it outside the bar. The `.hidden` class (with !important) always wins.

### Exit check

1. Harness: 6 fake ships with every status at 3 zooms and under reduced motion — met. Evidence:
   - shots/r3_fx_{1280,390}_{close,mid,far}[_rm].png (2026-10-18 23:14–23:15) and r3/fxr.log. The ships are 1H's real models with real statusAnchors.
   - Viewed today as r4_fx_sheet1280.png and r4_fx_sheet390.png. Reduced motion: rmMoved 0.
   - statusfx and ships.js have not changed since.
2. The Kraken in every pose — met:
   - c1: 24 poses × 2 sizes plus rise 0.3/0.8 (23:20–23:24).
   - c2, krm3 and c3: the poses rendered after the last krakenView edit at 23:27:37 (max high/chase, rise, live game).
   - New r4 run with the current kraken.js through the whole fight at both sizes (19:17–19:21 today): no errors, max 4 tentacles.
3. statusfx ≤ 8 calls — met: 5 at most (fxr.log: 5 meshes with every status in view), and 3 for the Kraken.
4. Kraken ≤ 30 calls — met:
   - 18 in the max pose (4 tentacles, head, shadow, pearl, 12 rings): k_c2.log and krm3.log
   - 15 in the live game: live.log
   - ≤ 12 sampled in the real-sim run: r4/realfull.log
5. Tags +1 per badge — met. fxr TAGCALLS (chain slow cleared): delta 6 with 6 badges at 1280, and 3 for 3 at 390. In tags.log the delta is badges minus 1 because one ship's status badge replaces its chain badge, as one badge per tag requires.
6. The eye's glow ≤ 1 Hz — met. GLOW probe in fxr.log: square-wave inputs from 0.25 to 30 Hz give at most 0.8 cycles/s, with turns ≥ 0.617 s apart.

Stage 1b: re-checked against the landed 1H ships.js (fx.html and the live game use the real anchors) and the current 1C kraken.js (the r4 run).

### Verification

This session (2026-10-21, about 19:13–19:23 UTC):
1. Checksums. The published files equal the harness dev copies in /home/user/First-project/.dock-harness/kraken/1I/game:
   - tags dea1e935…
   - pops 3c4aa733…
   - statusfx b794cf69…
   - krakenView 77268b72…
   - fx.css 7e4090b2…

   None of them has changed since round 3: last edit krakenView 2026-10-18 23:27:37, the others earlier. Of the dependencies, ships.js (10-17 22:12), specials, mechanics3, deep.js and main.js are unchanged. kraken.js changed (2026-10-19 03:52, md5 3086c8e3…).
2. Syntax check: `node --input-type=module --check` passes for all four JS files.
3. Code audit against §2.7, §5.7.2, §6.3, §6.4 and §11.1, and the git diffs of tags.js, pops.js and fx.css against HEAD (what the live game loads). Every change is guarded by a status, style or class that today's game never sets.
4. New harness run (one round). Script: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/j4_realfull.cjs. Log: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r4/realfull.log (19:21). SwiftShader at 1280x720 and 390x844, simulated time only (kraken.step at 1/120 s).
   - Run order: the real current kraken.js rises, then:
     - tentacles in phase 1 (11.05 s)
     - an ink ring in phase 2
     - fire on a tentacle: 'ON FIRE!', statusShip stands on the tentacle, statusfx draws 6 flames in 1 call
     - stink: 'ACHOO!', and every tentacle drops
     - a grab happened
     - phase 3 with the head up and 4 tentacles
     - setHp(0): driven off, the Pearl shows, `over` is true at 144.5 s
   - Results:
     - errors []
     - NaN matrices 0
     - Kraken draw calls in 23 samples: max 12
     - tentacles drawn: max 4
     - statusfx: max 3 calls
     - no page errors
   - I looked at the contact sheets r4/sheet_real1280.png and r4/sheet_real390.png. Every stage looks right.
5. Looked at the earlier attempts' screenshots with Read:
   - r3/sheet_c3_live1280.png and sheet_c3_live390.png (real game, ?kraken=1 L9, 2026-10-18 23:30–23:35)
   - r3/sheet_c2.png and sheet_c1_status1280.png
   - a new sheet of the c1 poses at 1280 (r4_c1_poses1280.png, from shots taken 23:20–23:24)
   - r3/sheet_c1_390.png, sheet_rise.png, sheet_tagclose.png, sheet_boss.png
   - shots/c3_pops_1280.png
   - new sheets of the statusfx fleet shots r3_fx_* (23:14–23:15): r4_fx_sheet1280.png and r4_fx_sheet390.png

   Everything renders as the spec describes.
6. Logs read from the earlier runs:
   - r3/fxr.log: statusfx 5 calls at every zoom and size; under reduced motion rmMoved 0 (live 90); TAGCALLS delta 6 = 6 badges.
   - r3/tags.log
   - r3/k_c2.log and krm3.log: max pose = 18 Kraken calls; the rise camera cuts at k 0.37–0.62 under reduced motion.
   - r3/live.log
   - r3/rise.log
   - r3/bossfit.log: 12 sizes, BAD 0.
   - r3/pops.log: every new pop ≥ 28 px.
   - GLOW (in fxr.log): ≤ 0.8 cycles/s even with a 30 Hz input.

Not run (as instructed): npm test and the browser suites. The coordinator's run (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/npmtest-s1.log) had every Node suite passing. At 19:22 it was in smoke with 604 PASS and 0 FAIL. From the earlier attempt (npm3, 2026-10-18 23:16–23:29, same tags, pops and fx.css): smoke passed 94/94. Its controls run was killed mid-run (the browser closed when the attempt was cut off); it had no FAIL lines.

### Hook requests

- src/main.js (Stage 2A, integration): create `statusFx.createStatusFx(scene, { reducedMotion, seaY: (x, z, t) => ocean.heightAt(x, z, t) })`. Each frame, after ships are placed, call `fx.sync(liveShips, visualT, dt)` (dt = 0 while paused). Call `fx.clear(ship)` when a ship is removed or captured. During the Kraken fight, append `kv.statusShip(kraken.status)` to the list passed to sync. Why: statusfx draws nothing until main calls it.
- src/main.js (Stage 2A): create `krakenView.createKrakenView(scene, { reducedMotion, foamColor: level.palette.waterFoam, seaY })` on L9. Call `kv.prepare()` once per frame during the fly-in until it returns true. Each frame call `kv.update(kraken.visuals(), visualT, dt)`. During the rise, use `kv.riseCamera(k, { x, z, h, duration })` (null = keep main's own camera). Why: prepare() splits the build and warm-up over frames so the rise never stalls.
- src/main.js (Stage 2A): #boss-status: remove .hidden while the boss has a status. Set `dataset.status = st.id`, textContent = the WORDS3 badge word (ON FIRE / FROZEN / STINKY), and `style.setProperty('--left', st.t / st.max)`. Why: fx.css draws the shape and the dot ring from these (§6.3).
- src/main.js (Stage 2A): pops. Use pop(text, x, y, z, 'fire' | 'frost' | 'stink' | 'kraken'), with mod 'kaboom' for KA-BOOM! and 'eye' for BULLSEYE!. Set tagIcon 'ram' by §6.4's priority (white > ram > hook > hot). Why: these are the classes and icons 1I provides.

### Open issues

- I didn't wait for the coordinator's full npm test, which started about 19:12. At 19:22 it was in smoke with 604 PASS and 0 FAIL, so 1I's live files (tags.js, pops.js, fx.css) still need that run's controls, battle, levels and town results. The earlier 1I attempt's own controls run was killed mid-run when that attempt was cut off, not by a failure.
- Pop colour: §2.7 says the new pop words are 'white ≥ 24 px'. They are light tints of each effect's colour with a 3 px ink outline and white second lines. Leave as is or switch to pure white is a call for 3E or the spec owner.
- statusfx uses 5 InstancedMeshes with caps 128/128/64/60 instead of §11.1's 6 meshes with caps 120/36/48/60/24/16. It is within the draw-call budget; the per-ship numbers are in the file's header.
- Under reduced motion the Kraken's bubble trail still gains entries as the shadow moves, because they follow its path. Bubbles themselves hold still, and the warning-ring bubbles change size with warning progress. I judged this acceptable, not motion.
- The real-sim run used a stationary player with stub ctx callbacks (damage, pop, sfx). Hits, damage numbers and announcements in the real game are Stage 2A's to wire and check.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r4/sheet_real1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r4/sheet_real390.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r4_fx_sheet1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r4_fx_sheet390.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r4_c1_poses1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r3/sheet_c1_390.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r3/sheet_c1_status1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r3/sheet_c2.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r3/sheet_c3_live1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r3/sheet_c3_live390.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r3/sheet_rise.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1I/r3/sheet_tagclose.png
- …

## 1J Sound

_Workflow run wf_bf5ab9e4-ea7._

### Summary

I closed out row 1J (Sound). I found no defects, so I changed no files. The published src/audio.js is byte-identical to the earlier attempt's dev copy (.dock-harness/kraken/1J/src/audio.js; it has not changed since 2026-10-19 04:22 UTC). It meets §11.1:
- all 25 SFX names from §11.1, plus 2 extra telegraph sounds (`tentacle`, `geyser`)
- the 5 new scenes (quiz plays the town tune)
- every name is in SFX_NAMES, SCENE_NAMES, SFX_CAP and SFX_GAIN
- the Kraken's dread drone has harmonics at 80, 120, 160 and 240 Hz

I re-ran the 1J exit-check harness on the published file and all 12 checks passed. The coordinator's full run passed tests/audio.cjs ("all audio checks passed", log line 920) and smoke's sound checks, with 0 FAIL lines so far. My own standalone render check also passed for all 30 pre-existing sounds and 9 scenes. I checked the git diff by hand: all 7 lines it removes or replaces only add the new names, and the sound code that existed before is untouched. So with WITH_KRAKEN false the game sounds exactly as it does today.

### Files

(none changed in the reporting run)

### API notes

src/audio.js now provides:
- SFX_NAMES adds `ignite crackle sizzle freeze stink blast clang ram mortar fuse spout horn rogue surf ink krakenRise slam grab gurgle sneeze bell bonk squawk build crate` (§11.1's list) plus `tentacle` and `geyser`.
- SCENE_NAMES adds `atolls cape deep kraken quiz`. The quiz scene plays the town's music: MUSIC_OF and TUNE_OF map quiz to menu, so going between town and quiz keeps the music playing.
- Every new name has an entry in SFX_CAP, SFX_GAIN and SCENE_GAIN. `crackle` is capped at 2 voices (§2.7).

Deviations from §11.1, all additive:
1. Two extra sound names, `tentacle` and `geyser`. These are the telegraph sounds §5.3 and §5.7.3 describe but §11.1 leaves unnamed. kraken.js already maps its warning to `tentacle` (KRAKEN.sfx.warn).
2. Loops: `crackle` and `spout` are loop sounds. They start even when out of earshot, so the handle's set({ distance }) can bring them in as the ship gets closer. They also take opts.duration, and handle.stop() ends them early.
3. Timed sounds: `fuse`, `tentacle` and `geyser` take opts.duration. The warnings reach their loudest point on that duration, so the sound lands with the hit.
4. A new public method, `audio.setMusicPhase(n)`, which only the kraken scene uses:
   - 0: the dread (the drone plus a heartbeat)
   - 1 and 2: the theme
   - 3: the theme about 22% faster
   - 4: driven off
   A change lands on the next bar line. If nobody calls it, the theme starts after 10 s.
5. stats() gains musicPhase, musicMode and musicStep.
6. __audioTest gains validateTables(); renderOffline gains the `phases` and `phase` options. The engine gains `names`.

Nothing else in the existing API changed.

### Exit check

1. "Offline renders of every new name are finite, stereo and non-silent": MET. All 27 new sounds pass at 1 s and at 4 s (finite, 2 channels, peak between 0.01 and 1, both channels above 1e-3). Peaks at 1 s range from 0.133 (geyser) to 0.893 (clang). All 5 new scenes' music and ambience pass: atolls 0.41/0.091, cape 0.44/0.133, deep 0.233/0.075, kraken 0.223/0.131, quiz 0.391/0.078. Every Kraken music phase renders: 0 dread, 1–3 theme (step 0.25 s, 0.205 s in phase 3), 4 done. Evidence: check-close.log.
2. "The drone has energy above 80 Hz": MET. Measured relative to the 40 Hz partial: 80 Hz +1.7 dB, 120 Hz −1.9 dB, 160 Hz −2.5 dB, 240 Hz −4.7 dB. 62% of the energy is at 75 Hz and up. Through a simulated phone speaker (150 Hz high-pass) the dread still plays at −36.5 dB against −28 dB full range. Evidence: check-close.log.
3. "Existing audio checks green": MET for everything finished so far. In the coordinator's run on this tree, tests/audio.cjs passed (npmtest-s1.log line 920) and smoke's sound checks passed (lines 584–589, smoke total at line 634). My standalone check (old-sfx.log) also passed on all 30 older sounds and 9 older scenes, using battle.cjs's audio test. battle.cjs's own audio section had not run yet when I finished.

### Verification

Done in this session (2026-10-21, UTC):
1. Published vs dev copy: `cmp` of .dock-harness/kraken/1J/src/audio.js and src/audio.js shows they are identical. The published file has not changed since 2026-10-19 04:22 (the dev copy since 04:06).
2. Code review: I read `git diff src/audio.js` (+1641/−7) against §11.1, §2.7, §5.3, §5.6, §5.7.1 and §15. Every removed or replaced line was reviewed (SCENE_NAMES, MUSIC_OF, TUNE_OF, the early return now skipping loops, the __audioTest export), and all large hunks add new code only. I also checked integration:
   - the names mechanics3.js emits (crunch, ram, mortar, fuse, ink, horn, surf, rogue) all exist
   - kraken.js's KRAKEN.sfx table maps to existing names (krakenRise, tentacle, slam, grab, sneeze, gurgle, …)
   - specials.js's sounds (ignite, freeze, stink, blast, sizzle) exist
   - quizPanel's (bell, squawk, bonk) and buildPanel's (build) exist
   - warning lengths fit the duration limits (tentacle up to 2.5 s within 4; geyser up to 3.1 s within 5)
3. Exit-check harness: NODE_PATH=/opt/node22/lib/node_modules node .dock-harness/kraken/1J/check.cjs on the published file passed all 12 checks, exit 0, finishing about 19:23. Log: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1J/check-close.log
4. Older sounds: a standalone script (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1J/close/old-sfx.cjs) applies the same test battle.cjs and smoke.cjs use to every older sound and scene. All 30 older sounds and all 9 older scenes render finite, stereo and not silent; validateScores and validateTables are clean; no page errors. Log: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1J/close/old-sfx.log
5. Coordinator's npm test run (started about 19:12, log /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/npmtest-s1.log):
   - smoke: "All checks passed" (line 634), including all its sound checks (lines 584–589)
   - controls: "All control checks passed" (line 868)
   - tests/audio.cjs: "all audio checks passed" (line 920)
   - 0 FAIL lines as of 19:53
   I did not run tests/audio.cjs again: the coordinator's pass was on the same unchanged file, and a second run would have loaded the machine while battle.cjs was running.
6. Screenshots from the earlier attempts: I looked at them with Read. They are spectrograms of the published content (made 2026-10-19 04:18–04:19, after the dev copy's last change at 04:06):
   - spec-r3-sfx-1280.png: all 27 new sounds have plausible shapes (for example stink's falling slide, bell's ring, crackle and spout as steady loops)
   - spec-r3-scenes-390.png: atolls, cape, deep, kraken (dread then theme) and quiz
   - spec-r2-kraken.png
   Because the file has not changed, I did no new critique round.

Not run in this session:
- .dock-harness/kraken/1J/game.cjs, the live-game probe (?kraken=1 scenes on levels 7–9, all new sounds through the real-time engine, the Kraken's music phases live, levels 1–6 unchanged). Neither the earlier attempts nor this session left a log of it, and it is not an exit-check item. I skipped it to avoid loading the machine during the coordinator's run.
- battle.cjs's audio section: still pending in the coordinator's run.
- npm test, smoke, controls, battle, levels and town were not run by me, as instructed.

### Hook requests

- src/main.js (2A), where the Kraken is staged (dread, rise, fight): at the start of the dread, call audio.setMusicPhase(0) then audio.setScene('kraken'). Each frame, call audio.setMusicPhase(n): 1 or 2 during the fight, 3 in phase 3, 4 when the Kraken is driven off. Why: §5.6 and §5.7.1 need the drone and then the theme, faster in phase 3. The audio side is a new method beyond §11.1; it is cheap enough to call every frame.
- src/main.js (2A), fire(): today line 2011 does `if (ammo !== 'round') audio.play(ammo, ...)`. Limit it to chain and grape. Why: 'stink' is now a real sound name, so a stink ball would play its hit sound at the gun. §11.2 and SMALL-FACTS (f) say a special ball launches with the round shot's sound.
- src/main.js (2A), statuses: keep one handle from audio.play('crackle', sfxAt(x, z, { duration: burn time })) for the nearest burning ship (at most 2 voices). Update it each frame with handle.set({ distance, pan }), and call handle.stop() when the fire goes out. Why: §2.7 asks for a crackle loop on the nearest burning ship.
- src/main.js (2A), spouts: for each forming or active waterspout, call audio.play('spout', sfxAt(x, z, { duration })), then handle.set({ distance }) each frame and handle.stop() when the spout ends. mechanics3 does not start this loop itself. Why: §5.3 asks for a wind loop that grows louder as you near a spout.
- src/main.js (2A), launchBomb(spec) for L9's `geyser` bombs: call audio.play('geyser', sfxAt(tx, tz, { duration: warn })) when the warning ring appears. Why: the kid rules need a sound with every warning, and its 'fwoosh' lands on the impact when it is given the warning time.

### Open issues

- `tentacle` and `geyser` are two sound names not in §11.1's list. They are deliberate (the telegraph sounds §5.3 and §5.7.3 describe), and kraken.js already uses `tentacle`. The coordinator may want SPEC3 §11.1 updated to list them, along with `audio.setMusicPhase` and the loop and duration options.
- The live-game probe (.dock-harness/kraken/1J/game.cjs) has never left a log, and I did not run it. So playing the new sounds through the real-time engine under ?kraken=1, and the Kraken's music phases live, were not checked in a real browser session. They are covered offline only. It should be run once the coordinator's suite finishes, or by 2A.
- battle.cjs's audio section (offline renders of the 15 Act II sounds) was still pending in the coordinator's run when I finished. The same test passed in my standalone run (old-sfx.log).
- Earlier attempts' smoke.cjs runs (2026-10-19) failed 'adaptive resolution kicks in on a slow renderer'. The same failure happened when HEAD's audio.js was served in place of the new one (smoke-head.log), so it was not caused by audio. The coordinator's current run passes smoke.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1J/spec-r3-sfx-1280.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1J/spec-r3-scenes-390.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1J/spec-r2-kraken.png

## 1K Env: Turtle Atolls

_Workflow run wf_de71420f-ae3._

### Summary

Row 1K (Env: Turtle Atolls) is done and meets its exit check. The previous attempt had already published the full level 7 sea to /home/user/First-project/src/env/atolls.js (2,669 lines, written 2026-10-18 05:50). It is byte-identical to its dev copy at /home/user/First-project/.dock-harness/kraken/1K/src/env/atolls.js. This session re-verified it from scratch and found nothing to change, so the file was not edited again.

What the level has (SPEC3 §5.4): a noon lagoon inside a great atoll rim of white-sand motus with leaning palms. Turtle Island (a shell hill of green plates with palms, a friendly head with big eyes, four flipper spits, a tail). Two small ring atolls with turquoise inner lagoons. A candy-striped lighthouse toppled off its coral rock. A stilt village of conch-shell-roofed huts with plank walks, ladders and canoes. A wreck heeled over on a coral reef. 7 sandbars, two with flamingo cays. Sea turtles paddling and terns wheeling (one shared mesh moved on the CPU). Far atolls and high green islands on the horizon. A bruise-purple storm wall to the east trailing rain curtains (one mesh each). The palette is exactly §5.4's, and worldRadius is 145.

Waterspouts: the level draws them from the mechanics snapshot (hazards.spouts) in up to 4 slots. Each spout is a dark cloud disc, a funnel of three twisting bands (white, pale grey, blue-grey), and a water mesh carrying the dark swirl ring of radius 6 that warns while it forms, faint pull streaks out to radius 14 and the spray skirt. Two barrels and a startled fish circle up, shared by all spouts. Nothing on a spout has an ink outline. Under reduced motion there is no sway and the twist and spin are slower.

Exit check results:
- Env alone: 12 draw calls, against a budget of 220.
- Smoke layout rules: pass in the harness and in the live game with ?kraken=1 (12 spawns, blocked 0, outside 0, spawnsInLand 0, nearest enemy 83 from the start).
- Spout loops vs colliders: every loop clears every collider by r + 24.6 or more. That is above r + 8, and also above pull zone 14 + 8 = 22. The loops come no closer than 31.4 to the player start and stay inside worldRadius − 20 (largest radius 119.8).
- Spout visuals from a fake snapshot: checked in harness views at both sizes, with junk entries ignored.

Tests: all Node suites pass (801 checks). Of the browser suites, battle (182) and audio (50) pass. smoke, controls, levels and town stopped on page timeouts. The machine was at load average 20–34 on 4 cores from other agents' browser runs. A pristine HEAD (e73279b) copy run in parallel failed smoke in exactly the same way, so these failures are environmental. The full npm test is not proven green in this session.

### Files

- src/env/atolls.js (the full level, published by the previous 1K attempt at 2026-10-18 05:50; re-verified in this session and not edited again: byte-identical to /home/user/First-project/.dock-harness/kraken/1K/src/env/atolls.js)
- .dock-harness/kraken/1K/env.html (harness page only; not a game file)

### API notes

Exports, following SPEC3 §11.1 and the SPEC2 env contract:

- `meta`: { name: 'The Turtle Atolls', subtitle }. main's place line reads "the Turtle Atolls".
- `palette`: exactly §5.4: skyTop 0x2f7fe0, skyHorizon 0xbfeff0, sunColor 0xfff4d6, sunDir [0.3,0.8,0.4], sunIntensity 2.3, hemiSky 0xd8f4ff, hemiGround 0x4a7a8a, hemiIntensity 1.3, fogColor 0xbfe8e8, fogNear 140, fogFar 380, waterDeep 0x0f7f9a, waterShallow 0x48e0d0, waterFoam 0xffffff, waveAmp 0.6, cloudColor 0xffffff, cloudShade 0xb8c8e0, cloudCount 12.
- `build(scene, ctx)` returns:
  - worldRadius: 145
  - colliders: 102 entries of { x, z, r, h }. 74 touch the arena; the rest are the rim motus just outside it, which give the rim its surf.
  - playerStart: { x: -22, z: 44, h: 2.28 } (mid-lagoon, facing north-east towards Turtle Island and the storm)
  - enemySpawns: 12, in a well-spread order with the first one ahead of the start, 58–92 u from it, clear of colliders by r+12, of sandbars by r+8 and of the spout loops by 16, inside worldRadius−16
  - reefs: 7 sandbars { x, z, r }. main's REEF_SLOW of 0.45 already applies to deep hulls.
  - crateSpots: 8, 30–100 u from the start, clear of colliders by r+8, of sandbars by r+3 and of the loops by 18, inside worldRadius−20
  - spoutLoops: 6 loops { cx, cz, rx, rz, w, phase }, with w set so each loop is ridden at 2.5 u/s
  - update(t, dt, { simTime, camera, hazards })
  - dispose()
  - group
- ctx.rng is used only for visual phases (turtles and terns). The layout is fixed and never depends on it.
- ctx.reducedMotion may be a boolean or a function read every frame; without it the module reads the prefers-reduced-motion media query.
- update draws hazards.spouts in the shape mechanics3.visuals() produces: { id, x, z, state: 'forming' | 'active' | 'collapsing', k }. It also accepts t/T or age/life in place of k, and phase/stage in place of state.
  - Each id keeps its own slot, up to 4 slots. A spout that leaves the snapshot winds down by itself in 0.8 s.
  - Junk entries are ignored, and hazards may be null.

Draw calls:
- Env alone: 12 at the start chase view and 12 from a top-down view of the whole arena (4 outlined meshes × 2 passes, plus the storm, rain, shallows and the props without an ink line).
- Each spout adds 2 calls while forming (cloud and water), then 3 once the funnel shows, plus 1 call for the shared flotsam. With 4 spouts the total is +13.
- In the harness with the player ship, views ranged from 13 to 78 calls with no spouts, and up to 89 with 3–4 spouts.
- Triangles: 451k for the env, both passes counted. That is in line with frost (519k) and doubloon (489k).
- Build time on SwiftShader: 0.6–1.0 s.

Deviations from SPEC3:
- spoutLoops carries a `phase` key. mechanics3 ignores it, because it picks where each spout forms on the loop itself, so the two stay compatible.
- 'two barrels and a startled fish' are one shared mesh moved on the CPU for all slots, so a spout costs 3 meshes (≤ 4 per §14).

### Verification

All scratch files are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/. Probes were run with `node run.cjs <probe>` and NODE_PATH=/opt/node22/lib/node_modules, in SwiftShader chromium with ?quality=low.

Harness (game renderer from src/scenery.js):
- p1: built OK with 0 errors: 102 colliders, 7 reefs, 12 spawns, 8 crates, 6 loops; 21 meshes, 4 of them outlined. At 1280x720 the env alone is 12 calls (451,286 triangles); with the player ship the frame is 72 calls.
- p2 + layout.cjs on data.json: all 27 checks PASS. Spawns stay inside worldRadius−16 and clear colliders by r+12.4 or more and sandbars by r+8.8 or more. The nearest spawn is 58.2 from the start and the first three are 140.6 apart. The start is 60.0 from land. Every crate is in open water. The 6 loops clear colliders by 25.6 / 32.4 / 26.7 / 35.7 / 24.6 / 27.0, all above 22; are 31.4 or more from the start; reach at most radius 119.8, inside 125; and are ridden at 2.50 u/s. data.json is unchanged from the previous attempt.
- p4a: 3 rebuilds, env alone 12 calls each time. After dispose, 0 'env:' objects are left and geometries fall back to the harness baseline of 2.
- p4b, the same probe on other envs for comparison: doubloon 114 calls, europe 172, frost 56, maelstrom 47, deep 39.
- p6, the fake-snapshot sequence under reduced motion, plus junk entries (null, 5, 'x', NaN or Infinity positions, {spouts:'no'}, 20 copies of one spout): forming at k 0.1 is 77 calls, forming at k 0.6 through collapsing is 79, after the spouts are gone (0.4 s and 1.4 s) it is 75, and with 20 entries it is capped at 4 slots for 88 calls. 0 errors.
- p3: 22 views each at 1280x720 and 390x844, 0 errors. I looked at these PNGs: v1-start-w, v1-start-p, v1-overview-w, v1-overview-p, v1-turtle-w, v1-village-w, v1-village-p, v1-lighthouse-w, v1-wreck-w, v1-wreckClose2-w, v1-flamingos-w, v1-atollSE-w, v1-hut-w, v1-terns1-w, v1-storm-w, v1-spoutForm-w, v1-spoutForm2-w, v1-spoutActive-w, v1-spoutActive-p, v1-spoutCollapse-w, v1-spoutClose-w, v1-spoutThree-w, and the layout map.png. This session's round found nothing to fix. The previous attempts' critique rounds r1–r5 and k1–k3 are in shots/.
- ESLint (no-undef, no-unused-vars, no-redeclare, no-dupe-keys): 0 problems.

Live game, /index.html?kraken=1&quality=low, level 7 (p7live):
- 1280x720: 9 levels. Layout: spawns 12, blocked 0, outside 0, spawnsInLand 0, nearest enemy 83, first wave shark, shark, corsair. Fly-in 103 calls. Level start after 1 s stepped: 102 calls, 617k triangles (budget 310). 9.2 s of game time with mechanics3's real spouts fed in: max 113 calls; the probe saw spout states forming and active; 2 spout slots visible; 2 spouts formed and 4 hp of spout damage.
- 390x844 touch: start 104 calls; 15.1 s of game time, max 112 calls; spouts seen forming and then active; near a spout 91 calls; 0 errors.
- I looked at live-v1w-start, live-v1w-play, live-v1w-near, live-v1p-start and live-v1p-near.

Live game without ?kraken=1 (p8nokraken): 6 levels, 6 cards, WITH_KRAKEN false, and levels 1–6 each start with 0 errors. The calls there (L1 299, L2 231, L3 107, L4 249, L5 191, L6 227) were taken 2 frames into the fly-in, so they can't be compared with the §0.2 baselines.

Node suites: combat 107, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server 14 (prints no count; 14 PASS lines), mechanics3 162, specials 110, quiz 85. All PASS, 0 FAIL.

npm test (10:39–10:57, load average about 26 on 4 cores): every Node suite passed. smoke then failed 'adaptive resolution kicks in on a slow renderer (scale 1)' and timed out at smoke.cjs:133 (the 120 s waitForFunction for the fly-in to end); exit 1.

Browser suites run one at a time afterwards (load average 20–34):
- smoke: 15 PASS, 1 FAIL (the same adaptive-resolution check), then the same timeout.
- controls: 59 PASS, 0 FAIL, then a page.reload timeout of 30 s at controls.cjs:402.
- audio: 50 PASS, exit 0.
- battle: 182 PASS, 'All battle checks passed', exit 0.
- levels: 70 PASS, 1 FAIL ('review4: the section crashed: page.goto: Timeout 120000ms exceeded').
- town: 119 PASS, 2 FAIL (review4 and review4-world, both page.goto timeouts of 120 s).

Control run: a pristine `git archive HEAD` copy (e73279b, stub atolls.js) and the working tree ran smoke in parallel at load average about 28. HEAD failed exactly like the working tree: 15 PASS, FAIL on adaptive resolution (scale 1), then the timeout at smoke.cjs:133. The working tree failed the adaptive check and timed out on page.click at line 123. main.js's trackPerformance undoes a resolution drop when fewer pixels don't help, which is what happens when the slowdown is CPU contention, so the quality stays at scale 1. Every failure is a timeout or that load-dependent check; no gameplay assertion failed.

### Hook requests

- src/main.js, frame() (Stage 2, 2A). Before `env.update(t, dt, envFrame)`, set `envFrame.hazards = mechanics && typeof mechanics.visuals === 'function' ? mechanics.visuals() : null;` and clear envFrame.hazards to null in startLevel. Why: atolls.js draws level 7's waterspouts only from hazards.spouts (§11.1: `update(t, dt, { simTime, camera, hazards })`, with hazards = mechanics.visuals()). Today envFrame is only { simTime, camera }, so the spouts' pull and core damage are live but nothing is drawn (kid rule: every threat must be telegraphed). Verified: when the probe feeds mechanics3's live list into env.update, the spouts render correctly.
- src/main.js, drawMinimap (2A). Draw white swirls for `mechanics.visuals().spouts` at radius 6 (forming dashed, active solid), per §5.3 Looks ('white swirls on the minimap').
- src/main.js plus the audio scene (2A, using 1J's `spout` SFX). Play a whistling wind loop whose volume rises as the player nears the closest active spout (§5.3 Looks).
- src/main.js, powder crates (2A). Place crates at `env.crateSpots` in their given order: 8 spots, the first ahead and to the side of the start, the rest spread so any prefix is well spaced.

### Open issues

- The full npm test was not green in this session. Under load average 20–34 on 4 cores, caused by other agents' concurrent browser suites, smoke, controls, levels and town stop on page timeouts, and smoke's adaptive-resolution check reads scale 1. A pristine HEAD (e73279b) copy run in parallel failed smoke identically, so these failures are not caused by atolls.js, which is imported but never built while WITH_KRAKEN is false. The coordinator should re-run npm test on a quiet machine.
- Until 2A sets envFrame.hazards = mechanics.visuals() (hook request 1), level 7's waterspouts are live in gameplay but invisible in the game; they only render in the harness and the probes. Today this only affects ?kraken=1.
- Spout loops 0 and 1 pass about 10 u from the edges of sandbars 5 and 6. The swirl core (radius 6) never reaches sand, but the faint pull streaks (out to radius 14) can brush a sandbar's edge. This is purely visual.
- The spout's cloud sits 22 u up, so at the landscape chase-camera distance it is above the frame while a spout forms. During the warning, the visible cue is the dark swirl ring on the water and then the funnel coming down; on portrait screens the cloud is in view.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-start-w.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-start-p.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-overview-w.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-overview-p.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-turtle-w.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-village-w.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-village-p.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-hut-w.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-lighthouse-w.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-wreck-w.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-wreckClose2-w.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1K/shots/v1-flamingos-w.png
- …

## 1L Env: Cape of Storms

_Workflow run wf_de71420f-ae3._

### Summary

Row 1L (Env: Cape of Storms) is done, and src/env/cape.js now holds the full level. I checked the previous attempt's work in .dock-harness/kraken/1L/ and the scratch folder, re-ran its probes and kept going from it. I published the file atomically (cp to src/env/.cape.js.tmp, then mv) after four rounds of screenshot critique, plus a reduced-motion round, at 1280x720 and 390x844.

What the level has (SPEC3 §5.5):
- A stormy orange-violet sunset off a green-and-ochre cape: stacked sandstone cliffs with crashing surf, a red-and-white lighthouse with a slow beam that never flashes, and the keeper's cottage.
- A conch-horn tower on its rock. Rings of sound pour from it while a rogue wave is a warning.
- Penguins on two boulder piles and the Old Man sea stack, whales spouting far out, albatrosses, a wreck, and Table Mountain on the horizon.
- A bruise-violet storm with rain curtains on the open-sea side.
- The §5.5 palette exactly, swell 0.9, worldRadius 150.

The rogue wave is drawn from hazards.rogue, the snapshot that mechanics3 visuals() gives. It is a Hokusai-style curl 120 long and 7 tall. It rises from the sea, rides the swell, dies down where it meets land (throwing spray up the rocks) and sinks away in 1.4 s once it leaves the snapshot.

Changes I made in this session:
1. **Wave colour.** The warm sunset light was turning the crest grey-green. The crest now takes only 0.7 of the scene light and adds a cool light of its own, so it shows the sea's own blues.
2. **Warning marks.** The teal band ahead of the wave was invisible on teal water. It is now a row of pale chevrons on the water, pointing the way the wave rolls. They glow at 1 Hz and hold steady under reduced motion.
3. **Claws.** They are smaller, and they draw back into the lip as it passes right by the camera. Before, they looked like giant hands grabbing the ship.
4. **Smaller polish.** The face lines wobble instead of reading as stripes, the horn rings cycle every 1.5 s, and the spray blobs are rounder.

While WITH_KRAKEN is false the module is only imported, never built, so the live game is unchanged.

### Files

- /home/user/First-project/src/env/cape.js

### API notes

Exports, as the SPEC2/SPEC3 §11.1 env contract:
- `meta`: name 'The Cape of Storms' and a subtitle.
- `palette`: the §5.5 table exactly.
- `build(scene, ctx)`, where ctx is `{ rng, reducedMotion }`; reducedMotion may be a boolean or a function, and if it is missing the media query is read. It returns:
  - `worldRadius`: 150.
  - `colliders`: 66 circles `{ x, z, r, h }`, hugging the cliffs' waterline (h 14) plus the islets.
  - `playerStart`: `{ x: 44, z: 90, h: -2.933754 }`.
  - `enemySpawns`: 12 points, 58–92 u from the start, clear of colliders by r + 12, inside R − 16, ordered so any prefix is well spread.
  - `reefs`: [].
  - `crateSpots`: 8 points, clear of colliders by r + 8, at most R − 20 from the middle.
  - `rogueDirs`: [-1.22173, -0.523599, 0.174533] (−70°, −30°, +10°). These are the bearings a wave comes FROM, in the heading convention, which is exactly how mechanics3 pickDir/launchRogue reads them.
  - `update(t, dt, { simTime, camera, hazards })`, `dispose()`, `group` (named 'env:cape').
- The fixed layout uses its own seeded rng; nothing gameplay-relevant uses Math.random.

How update reads the hazards:
- It draws `hazards.rogue`: `{ id, x, z, h, len, height, speed, t, warn, warning, ... }`, where x, z is the middle of the crest and h the heading it rolls along.
- If h is missing it falls back to `from + π`; an array snapshot is also accepted.
- Junk or missing hazards never throw (checked with 15 malformed snapshots and with NaN or missing time).

Deviations from SPEC3 and why:
1. **Extra export `isLand(x, z)`** (true on the mainland or an islet). It is used by my probes only; main can ignore it.
2. **More spawns and crate spots than the minimum** (12 spawns against ≥ 6, 8 crate spots against ≥ 4), so later waves get choice.
3. **In-world warning cues beyond §5.3.** §5.3 asks for the horn sound, the edge arrow and the minimap line, all main's job. The env adds pale chevrons on the water ahead of the crest and rings from the conch horn while `warning` is true. Both pulse at 1 Hz or slower, never flash, and hold still under reduced motion.
4. **Draw calls for the wave.** The wave itself is 4 calls (crest, outlined, so 2; spray InstancedMesh with noOutline, 1; foam on the sea, 1). The horn rings add 1 while warning.
5. **Shader warm-up.** The wave and ring meshes are drawn empty under the sea for the first 3 updates, so their shaders compile during the fly-in rather than mid-fight.

### Verification

Probes ran in the harness /home/user/First-project/.dock-harness/kraken/1L/env.html, which uses the game's own renderer from src/scenery.js, SwiftShader and quality=low. Scripts are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/.

**Layout and data (layout.cjs, identical before and after my changes)**
- 66 colliders, 0 reefs, start clear of land.
- 12 spawns: 0 outside the world, 0 in land, all clear by r + 12, 58–92 u from the start, the first ahead of the start, the first 6 at least 44 u apart.
- 8 crate spots, all clear by r + 8 and at most R − 20 from the middle.
- 3 rogueDirs. Rays along them from the middle and from the start meet no mainland within 600 u.
- From all 1586 open-water sample points, the crest's start (70 u out, and 86 u with the full Lighthouse bonus) is never on the mainland.
- 83% of the arena is open water.

**Draw calls (harness, 1280x720)**
- Env alone: 15–19 across 56 wave stills; the most I saw was 19, against the ≤ 220 budget. The wave's own meshes are 4; the horn rings add 1.
- Whole frame with the player ship: 27–85.
- Scenery views (whole frame): 15–83.

**Robustness (robust.cjs, leak.cjs)**
- 0 throws on 15 junk snapshots or odd update calls.
- When the snapshot drops a wave, it sinks away in 1.37 s.
- Three build/dispose cycles are stable: 18 geometries live, 5 after dispose (the scenery's own), 3 textures (the shared paint texture plus the scenery's).

**Speed**
- Build: 0.7–1.1 s on SwiftShader, about the same as atolls (0.9–1.5 s) and doubloon (0.75–1.9 s).
- update() with a live wave: about 0.5 ms median, the same as the previous attempt's code measured side by side.
- eslint: clean.

**Live game, ?kraken=1, level 8 (live.cjs)**
- I ran it on the dev mirror and again on the real published tree.
- Smoke layout rule: blocked 0, outside 0, spawnsInLand 0, nearest enemy 70 u (needs > 35). The opening wave is ironclad, bombketch and corsair.
- Level start (Stage 0's probe: newGame(8), intro 0, 1 s stepped, frozen, 2 frames): 111 calls at 1280x720 and 108 at 390x844, against the ≤ 310 budget. Env alone in the live game: 14 calls.
- I fast-forwarded to the first REAL rogue wave (it launched at 30.01 s of simulated time, from −70°) and fed the real snapshot into env.update. The wave drew correctly and hit the side-on ship for −10 hp (mechanics3 stats: side 1). Max during the wave: 178 calls with 3 enemy ships parked in view, at both sizes. No page errors.

**Node suites:** combat 107, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server (all passed), plus specials 110, mechanics3 162 and quiz 85. All green.

**Browser suites:**
- audio.cjs: 50 PASS, "all audio checks passed".
- smoke.cjs (in npm test and twice alone): 15 PASS, then it fails "adaptive resolution kicks in on a slow renderer (scale 1)" and a later 120 s Playwright timeout (screenshot / waitForFunction). The machine load average was 22–40 on 4 cores, with other agents' battle, town, controls and smoke runs going. The identical failure shows in this session's control run on unmodified HEAD (1K/ctrl-smoke-head.log) and in the other agents' smoke logs (1G, 1M). With WITH_KRAKEN false, cape.js is only imported, and the title screen and level 1 started normally.
- controls.cjs: 55 PASS, then `page.reload: net::ERR_ABORTED` on its repeated saved-data reloads, which hung until my 595 s timeout.
- battle, levels and town were not reached, because npm test stops at smoke's failure.
- So I could not get a clean full npm test run on this machine.

### Hook requests

- src/main.js (Stage 2, 2A), frame(): set `envFrame.hazards = mechanics.visuals();` just before `env.update(t, dt, envFrame)`. Today envFrame is only { simTime, camera }, so the env draws no rogue wave in the real game. I proved it works by feeding `G.mechanics3.state.rogue.wave` (the same object as visuals().rogue) in the live probe. This also feeds atolls' spouts and deep's slicks.
- src/main.js (Stage 2, 2A), the __game test API: `mechanics3.wave(angle)` is still a stub returning null. Point it at the composed mechanics instance's own wave(angle) hook (mechanics3 already has one), as SPEC3 §11.3 asks, so tests can start a rogue wave on demand.

### Open issues

- main.js does not pass `hazards` to env.update yet, so in the real game the rogue wave, the chevrons and the horn rings appear only once 2A applies the first hook request. The env handles missing hazards safely.
- No clean full npm test run on this machine (load average 22–40 on 4 cores from concurrent agents). smoke.cjs fails its adaptive-resolution timing check and a later 120 s timeout, the same way as this session's HEAD control run; controls.cjs hit a page.reload ERR_ABORTED. battle, levels and town were never reached. Someone needs to re-run the full npm test when the machine is quiet.
- When a wave passes the chase camera with the ship side-on, the wave's back briefly fills the lower view and hides the hull for about 0.3 s. I left it as is; 3E could raise the wave's camera-duck margin (createRogueView, the `cap` line) if play-testing says otherwise.
- The crest is not blocked by the Cape: a wave that crosses the mainland reappears in the water on the far side. This matches mechanics3, which hits every ship the crest crosses whatever land is in between. Columns over the mainland stay hidden inside the cliff mesh.
- My harness, mirror and probe scripts are kept for later stages: /home/user/First-project/.dock-harness/kraken/1L/ (env.html, plus a src mirror holding the dev cape.js, which is identical to the published file) and the scratch scripts live.cjs, wave.cjs, views.cjs, layout.cjs, robust.cjs and leak.cjs in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/live-realw-grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/live-p-grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c4w-grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c4w-gridp.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c3w-grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c3w-gridp.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c2w-grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c1w-portrait-strip.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c5r-grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c5r-gridp.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c1v-grid1.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1L/shots/c1v-grid2.png
- …

## 1M Env: Kraken's Deep

_Workflow run wf_ef2b6b15-c5e._

### Summary

1M (Kraken's Deep, src/env/deep.js) is done and published. Nothing changes in the live game: without ?kraken=1, LEVELS has 6 levels and no level ever builds the Deep.

The previous attempt had already finished and published the full level-9 sea: moonlit night under a huge low cratered moon, glowing cyan foam, three wrecks on their sides, a whale-skeleton arch you can sail through (15 u channel), and the Kraken Crew's octopus-head lair with purple torch eyes. It also has rocks with glowing barnacles, far sea stacks, and glowing jellyfish (one InstancedMesh of 89, noOutline). setDread and setDawn were already there. I re-verified all of it against the current tree, since mechanics3, act3, ships, krakenView and cape have changed since.

I did my own 3 critique rounds at 1280x720 and 390x844:
1. Every harness view.
2. The real game with ?kraken=1 on level 9.
3. The Kraken (1I's krakenView) posed in the arena under full dread, plus ink slicks under dread.

Round 3 found one defect, which I fixed. Under the dread, the shared ocean's reflection patches turned into large grey blobs, very visible on phones. Cause: the ocean paints the sun's reflection as 88% waterShallow plus 12% sunColor, and the dread's near-black waterShallow let the pale night sun colour dominate. Fix: the dread now gives the water its own dimmer sun colour (waterSunColor 0x3a4f7a, ocean uSunColor only). The lights and sky keep sunColor, so ships stay lit as before. The patches are now a faint teal shimmer. Night without dread and dawn are unchanged, and dispose() restores the palette.

I developed the fix in /home/user/First-project/.dock-harness/kraken/1M/src/env/deep.js and published it with cp to a temp name and mv. Before the copy I checked that the live file still had the expected md5.

Everything else held up: the Kraken reads very well on the dread water, the slicks stay visible thanks to their violet rim, and the jellyfish dive out of the way during the fight.

### Files

- /home/user/First-project/src/env/deep.js

### API notes

Exports (SPEC3 §11.1 env contract plus §5.6):
- meta: { name: "The Kraken's Deep", subtitle }.
- palette: exactly the §5.6 values (checked key by key).
- build(scene, ctx) returns:
  - worldRadius: 140
  - colliders: 99 entries { x, z, r, h }
  - playerStart: { x: 0, z: 48, h: π } (south, facing the lair)
  - enemySpawns: 7 entries
  - reefs: []
  - crateSpots: 5 entries
  - krakenArena: { x: 0, z: -5, r: 64 }
  - setDread(k = 1, opts?) and setDawn(k = 1, opts?)
  - dread and dawn getters (the current eased values)
  - stats: { jellies, bubbles, slicks, maxPulseHz, flashes: 0 }
  - update(t, dt, { simTime, camera, hazards })
  - dispose() and group.
- build's ctx: rng, and reducedMotion as a boolean or a function (else the media query).
- setDread eases over 2.5 s: darker water, sky and fog, bubbles boil up round the view, the jellyfish dive.
- setDawn eases over 3 s: the sky turns dawn gold, the sun rises low in the east, the moon sets, the water turns morning blue.
- Both are a cut under reduced motion.
- update draws hazards.slicks from mechanics3's visuals() snapshot ({ id, x, z, r, t, T }, or { x, z, r, k }), at most 8.
- dispose() repaints the shared sky, ocean, clouds, lights and fog with the palette.

Deviations, all additive:
- An extra export LAYOUT (arenaClear 10, moon, ease, pulseHzMax 1) for tests.
- The stats object and the dread/dawn getters.
- An optional { instant: true } on setDread and setDawn.
- 7 enemy spawns rather than the minimum of 6.

This session's only code change: DREAD.waterSunColor 0x3a4f7a, added to the dread palette keys. The water's sun colour equals sunColor unless a palette gives one (matching scenery.js), and paint() writes it to the ocean's uSunColor only.

### Verification

All runs used NODE_PATH=/opt/node22/lib/node_modules, the SwiftShader args and the tests/server.cjs server. The machine load average was 20–39 on 4 CPUs, because other agents were running.

1. Node checks of deep.js (scratch deep.test.mjs):
   - Before my change, on the published file: 51/51 pass.
   - After adding 5 checks for the water sun colour: dev copy 56/56; the old published file failed exactly the 2 new dread checks (54 passed, 2 failed), so the new checks catch the defect; the published file after the atomic publish 56/56.
   - They cover: the palette is exactly §5.6; the data contract; spawns (≥ 6, inside worldRadius − 16, > 12 from land, > 35 from the start, spread); crates; the arena (r ≥ 60, colliders ≥ 10 clear, actually 19.89; inside worldRadius − 20); the arch channel is 15.0 wide; jellyfish are one noOutline InstancedMesh ≤ 120 (89); every shader sin(uTime·k) is ≤ 1 Hz; no Math.random; no flash mesh; dread and dawn ease monotonically, are cuts under reduced motion, clamp junk and give the palette back on dispose(); slicks from a messy snapshot (cap 8, all finite); the jellyfish dive under the dread.

2. Harness layout probe: spawns 69–86 u from the start and ≥ 21.9 u from land; crates ≥ 28 u from land; arena clear 19.89, inside margin 71; 99 colliders, 0 bad.

3. Env-alone draw calls (env on minus env off, 30 spots × 8 headings at chase height):
   - Night: max 43, min 24, mean 33.9 (budget 220).
   - Dread: max 44, min 25, mean 34.9, unchanged after the fix.
   - Harness frames (both outline passes, env plus stock ship): start view 105, fly-in 107, lair 49, wrecks 35–42, arch 38–49; with the Kraken posed under dread 120.

4. Photosensitivity: luminance probe at 320x180, 15 fps of game time, whole frame plus 16 tiles; a flash = a pair of opposing ≥ 0.1 changes within 1 s.
   - Idle night view: 0 flashes; the largest 1 s swing (0.2245) also appears with noenv=1, so it comes from the harness's shared scenery, not deep.js.
   - Lair torches up close: largest per-frame change 0.0066, 0 changes.
   - Dread then dawn only 3 s apart (in the game they are minutes apart): at most 0.5 per second, before and after the fix.
   - Under reduced motion: 0 flashes (two single cuts).
   - Dread with the Kraken posed: 0.5 per second.
   - stats.maxPulseHz is 0.95; no flash overlay exists.

5. Live game (index.html?quality=low&kraken=1), after publishing:
   - The smoke layout rules pass for all 9 levels.
   - Level 9 start, by Stage 0's method: 128 draw calls at 1280x720 and 125 at 390x844 (level-start budget 310), with 2 Squid Skiffs and an Iron Turtle.
   - setDread(1) on game time reaches dread 1 with 48 bubbles (111 / 112 calls). setDawn then reaches dawn 1 (121 / 108 calls).
   - 0 page errors or warnings.

6. Without ?kraken=1 (nokraken.cjs): WITH_KRAKEN false, 6 levels; the envs built are europe, bali, volcano, doubloon, frost and maelstrom, never deep; 0 errors.

7. Node suites, all green: combat 107, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server 14.

8. tests/smoke.cjs, run twice: 15 PASS, then FAIL on 'adaptive resolution kicks in on a slow renderer (scale 1)'.
   - Run 1 then hit a 120 s page.screenshot timeout at smoke.cjs:110 (shotColours, the colour sample around line 62).
   - Run 2 hit a 120 s timeout waiting for the real-time level-1 fly-in at smoke.cjs:133.
   - The previous attempt's run on a pristine HEAD copy failed identically under load (scratch smoke-base.log), and deep.js is never built without the flag.
   - I did not run the full npm test (about 51 min on an idle machine) or controls/audio/battle/levels/town under this load.

9. Screenshots I looked at: every m1 view at 1280x720 and the phone tiles, the live m2/m5 level-9 start, dread and dawn shots at both sizes, the m3 Kraken under dread, the m3 slicks under dread at both sizes, the crops that tracked the grey patches down to the shared ocean's sun-reflection term, and the m4 before/after phone tile and m4 1280 dread shot.

### Hook requests

- src/main.js, frame() (the block that calls env.update(t, dt, envFrame), about line 6666), agent 2A: set envFrame.hazards = mechanics.visuals() before env.update(...). Why: SPEC3 §11.1 says each env draws its own hazard visuals from update(t, dt, { simTime, camera, hazards }), and deep.js draws the Inkheart's and the Kraken's ink slicks from hazards.slicks. Today envFrame carries only { simTime, camera }, so no slick is ever drawn.
- src/main.js, the level-9 sequence in step() (SPEC3 §5.7.1), agent 2A: call env.setDread?.(1) when the 4 s dread starts (it eases over 2.5 s, a cut under reduced motion). Call env.setDawn?.() when the Kraken is driven off (eases over 3 s, a cut under reduced motion). startLevel(9, { fromKraken: true }) rebuilds the env with dread at 0, so also call env.setDread?.(1) at the short rise.
- src/main.js, createKraken ctx (agent 2A, with 1C): env.krakenArena = { x: 0, z: -5, r: 64 } is open water, every collider is at least 19.9 u clear of its rim, and it lies inside worldRadius − 20 with 51 u to spare. Use it for ctx.world, the rise spot or the head's 'open water' placement as kraken.js needs. Keep ctx.land(x, z, r) testing against main's colliders for attack spots. kraken.js is still the Stage 0 stub, so the exact use is 1C's and 2A's call.

### Open issues

- tests/smoke.cjs could not finish on this shared machine (load average 20–39 on 4 CPUs). Both runs failed the frame-timing check 'adaptive resolution kicks in on a slow renderer (scale 1)'. One then hit a 120 s screenshot timeout (smoke.cjs:110); the other timed out waiting for the real-time level-1 fly-in (smoke.cjs:133). A pristine HEAD copy failed the same way under load in the previous attempt. The full npm test (controls, audio, battle, levels, town) was not run in this session; it should be run when the machine is quiet.
- The faint grey-teal patches on the near water are the shared ocean's (scenery.js) reflection of the high night 'sun'. deep.js now dims them under the dread, but they still show faintly at night with no dread, as in any level whose palette has a high sun. Changing that is scenery.js's business, not this module's.
- The dread keeps a light trickle of about 14 ambient bubbles round the view's focus for the whole Kraken fight (30% of the 48 used for the burst while the dread rises). They are small white domes, and every real tentacle warning has its violet dashed ring, so I left them. If play-testing shows children mistaking them for a warning, lower the 0.3 trickle factor in update() (Stage 3E).
- Slicks, dread and dawn only show in the game once 2A wires envFrame.hazards and the setDread/setDawn calls (hook requests). kraken.js is still the Stage 0 stub, so the Kraken's use of krakenArena is untested in the game; I tested it only in my harness with a posed krakenView.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m1-view=start-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m1-view=fly-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m1-view=lair-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m1-view=wreck0-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m1-view=arch-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m1-view=top_map=1_ship=0-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m1-view=start_dawn=1-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/crop/m1-phone-a.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/crop/m1-phone-b.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m3-view=start_kraken=1_dread=1_ease=1_warm=4_t=5-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/m3-view=start_slicks=1_dread=1_t=12-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1M/shots/crop/m4-phone.png
- …

## 1N Town world

_Workflow run wf_ef2b6b15-c5e._

### Summary

Row 1N (Town world) is done and published. With the build ctx's kraken false the town is exactly today's. The rope-bridge walking checks pass with 8 villagers out, with one deliberate deviation from §8.4, explained below.

**How I picked up the previous attempt.** It had assembled a dev sparrow.js from parts (.dock-harness/kraken/1N/parts + edits.py → assemble.py). I checked it still rebuilds byte-for-byte from today's HEAD, then audited it against SPEC3 §7.1, §8, §11.1 and §14.

**What I fixed or added on top of it:**
- **Quiz panel camera:** the professor stood behind his own chalkboard from the old camera. It now looks from over the water off the tower raft's south-west corner, so the bell, the captain, Professor Barnacle with Quizzle, and the QUIZ chalkboard stand side by side.
- **Builder Bess:** she stood directly behind her easel on the visitor's line of sight. She now stands at the easel's north end, turned to the visitor, and the builder camera was re-aimed. All §8.4 distance rules still pass.
- **Villagers in the shipyard view:** they are now hidden there, as §14 budgets it.
- **Hidden villagers keep walking:** a villager hidden by the cull (far from the lens, or right at it) used to freeze in place. That left `folk()` stale and made a probe see a false "stop" at a bridge mouth. Hidden villagers now keep walking their round.
- **`peopleCount`:** it now also counts the two porch wavers that appear for 2 s after a home is built.
- **Prebuild:** each plot's next tier is baked ahead, one chunk per frame, so a purchase only re-joins the layer (§8.2 asks for at most 40 ms).
- **Montage guard:** `setVillagers` called during a build montage no longer bakes the new building in early.
- **Walk test fallback:** the new checks use §8.1's platform, position and height numbers if 1D's island.js rows ever leave those fields out.

**Published by temp-copy + mv:**
- src/env/sparrow.js
- tests/walk.test.cjs (row W1 + new checks)
- tests/fixtures/sparrow-walk.json (regenerated once, from the live env.walk with kraken: true)

src/walk.js needed no change.

**Exit check, kraken off:**
- Walk data, people count and draw calls are identical to today's.
- 14 fixed views at 1280×720 and 390×844 are byte-identical PNGs to today's (re-checked on the final file).

**Exit check, kraken on:**
- **Tier 0 vs today:** only the "Build me!" boards, the rank plaque, and the two new places (bell/Barnacle, easel/Bess) differ.
- **Walk tests:** 105 pass (74 before). Every place is reachable from the spawn. Bess is 1.12 u and Barnacle 1.60 u from the nearest walker path or villager loop.
- **Draw calls:** with every plot at tier 3 plus 8 villagers, the town walk view's worst is 401 at the 30 × 8 probe (budget 450). The shipyard view is 304–311.
- **Walking with 8 villagers out:** 240 of 240 crossings succeed on every rope bridge (both directions; key, stick and tap; 10 moments). The worst stall is 0.4 s, the porter check passes 10 of 10, and LOOK-2 holds (villagers wait about 1 u from the captain and never push him).
- **Existing suites:** town.cjs 130/0, smoke.cjs 94/0, controls.cjs 232/0, all green.

### Files

- /home/user/First-project/src/env/sparrow.js
- /home/user/First-project/tests/walk.test.cjs
- /home/user/First-project/tests/fixtures/sparrow-walk.json

### API notes

**ENV API delivered by sparrow.build(scene, ctx)**

When ctx.kraken === true (§11.1):
- **setIsland(cfg, { built: id | null } = {}) → boolean (changed).**
  - Reads cfg.t[plotId] itself (plain integers clamped 0..3, own properties, junk → 0). So it works with today's island.js stub and with 1D's real module.
  - Rebakes the development layer only when a tier changed.
  - With `built` (a plot whose tier rose), the construction montage runs: a scaffold and dust puff (0.4 s), then knocks and a saw (1.2 s), then the building springs up 0.6 → 1.08 → 1 over 0.5 s. Under ctx.reducedMotion it is a plain cut.
  - A home that goes from tier 0 to 1 then shows two villagers waving from its porch for 2 s.
  - Calling setIsland again while a montage runs finishes the montage first.
- **plotPose(id) → { pos: [x,y,z], target: [x,y,z] } | null.**
  - Searched once per plot over 16 yaws × 2 heights × 2 distances, scored by rays against the camera boxes, tall blockers and prize berths, then cached.
- **setVillagers(list) → number drawn.**
  - `list` is either a number (how many live on the island, taken from the homes in turn) or [{ home, kind?, seed? }].
  - At most VILLAGER_CAP (8) are drawn. Each is a walker() in folk() with detail 'low', share true, the house's wall colour, kind from a seed per home, and a loop of its own.
  - Homes with villagers left over are "at home": lit windows and a smoking chimney.
- **setRank(name) → boolean.** Repaints the plaque under the welcome sign.
- **peopleCount** is now a getter: folk (villagers, Bess and Barnacle included) + crew + porch wavers.

Extras (not in §11.1):
- `plots` getter: each plot's { id, x, z, y, w, d, ry, height, tier }.
- `finishBuild()`: skips the montage.
- `buildTimes` = { scaffold: 0.4, knocks: 1.2, spring: 0.5 }.
- `montage` getter: { id, stage, t } | null.
- `villagers` getter: [{ x, y, z, home, loop, visible }].

folk() entries now carry `villager: true, home` for villagers and `npc: 'bess' | 'barnacle'` for the two NPCs. greet() refuses a villager standing on a bridge or near its mouth, in a place circle, or at the gangplank.

With kraken false: setIsland → false, setVillagers → 0, plotPose → null, setRank → false. Nothing new is built, and the walk data is identical to today's.

**Walk data (kraken on only)**
- **places:** + `quiz` (Professor Barnacle's Riddle Bell, tower raft, r 1.3) and `builder` ("Builder Bess", plaza, r 1.3), each with face and cam. Order: ship, shipyard, tailor, tavern, quiz, builder (W1).
- **camBlockers:** + 10 plot envelopes { x, z, w, d, ry, y0, y1, plot }, each the platform footprint × §8.1's height, present from tier 0.
- **npcs:** [{ id, x, z, r: 0.35 }].
- **doors:** [{ id, x, z }].
- **paths:** [{ id, kind: 'walker' | 'villager', loop, pts }].
- No new area, portal or bridge.

**Art**
- Plots sit on §8.1's platforms. Each plot's tier-0 kit (today's shack and porch clutter, the same rand() draws in the same order) plus its "Build me!" board moves into the development layer.
- The development layer is at most 4 meshes: ink and thin (outlined), flat, and one board mesh carrying the painted canvas (Build me!, rank plaque, QUIZ chalkboard, island plan). That is ≤ 6 draw calls.
- Animated parts: the windmill sails (outlined), the lighthouse beam (additive, opacity 0.2, front faces only, turning at 0.6 rad/s), and the fountain jet: ≤ 4 calls.
- Chimney, dust and the powder shed's blue/orange/green smoke reuse the town's smoke InstancedMesh. Per-instance colour is used only when kraken is on.
- Barnacle is buildPerson old / mortarboard / pointer / full beard / glasses, with pet 'parrot' recoloured green and yellow as Quizzle (people.js has no macaw option).
- Bess is woman / bandana / hammer.

**Deviation from §8.4 ("no other rule is added")**
- A villager within about 0.75 u of a rope bridge's line, or on the 3 u of deck leading onto one, is left out of folk(). The captain walks straight through them there. LOOK-2 still makes them wait for him.
- Why: the previous attempt's probe without this rule had 3 of 240 bridge crossings stuck for 12–13 s. A held key slid the captain round a villager into the rope beside the bridge mouth. town.js's squeeze-past can't free him there, because the free move is blocked by the rope too.
- town.js isn't mine, so I fixed it on the sparrow side. Please confirm this is acceptable.

**Other decisions within the spec**
- Bess stands at (-1.4, -8.5), the north end of her easel.
- Quiz panel camera: tower-local (-4.33, 5.92) up 2.7 → target (-0.2, 2.2) up 1.15.
- Builder panel camera: (2.6, 4.2, -6.3) → (-1.5, 2.35, -8.0).
- Neither Bess nor Barnacle has a blocker of their own in the walk data. Their folk() discs (r 0.35) are the blockers, and the walk test proves those discs never cut off or narrow a deck below 1.6 u.

### Verification

All browser runs used NODE_PATH=/opt/node22/lib/node_modules, SwiftShader args and tests/server.cjs. The machine load was 15–32 on 4 cores for most of the session (other agents' suites), so timings are inflated except where noted.

**Node: walk tests**
- `node tests/walk.test.cjs` on the published tree: 'All walk checks passed (105)'. Stage 0 had 74.
- Mutated fixtures from the previous attempt each fail as they should, exit 1:
  - Bess in the portal → 1 FAIL
  - Bess pinching the tavern way → 2 FAIL
  - Bess with a static blocker → 1 FAIL
  - Barnacle in a corner → 1 FAIL
  - today's fixture → 5 FAIL (W1 and the new places)
- With platform/x/z/height stripped from island.js's rows: still 105 pass (the §8.1 fallback works).

**Fixture**
- Dumped with kraken: true; identical with no island, every plot at tier 3 plus 24 villagers, and tier 1 plus 3 villagers without the ship.
- Kraken off: env.walk equals base and the committed old fixture byte for byte (16066 bytes).

**Kraken off (final file)**
- Harness: draw calls 275 = 275, peopleCount 40 = 40; setIsland → false, setVillagers → 0, plotPose → null.
- 14 views (5 showcase sway poses + 6 town views at 1280x720, 3 at 390x844) byte-identical PNGs to base. Re-checked on the final file for 3 views.

**Tier 0, kraken on vs today** (harness Math.random reseeded after the build: three's generateUUID otherwise shifts the ship's sail phases)
- 0.27–2.52% of pixels differ, only at the Build me! boards, the plaque and the two new places. Diffs in s3/cmp/diff_*.png.
- Draw calls: showcase +16 (291 → 307); town views +5..+11.

**Draw calls**
- Real game, ?kraken=1, every plot at tier 3, setVillagers(24) → 8 drawn, Bess, Barnacle, 2 prize ships, 30 spots × 8 headings: max 401, min 35, mean 188.5 (budget 450; today 349).
- Shipyard view, 12 samples: 304–311 (today 286–292; villagers hidden).
- Panel views (harness emulation): quiz 39–45, builder 104–175.
- Live walk view: 144 at 1280, 99 at 390.

**Bridge probe** (s3/bridgeprobe.cjs, real game, ?kraken=1, four Manors, 8 villagers; final file, run twice)
- 240/240 crossings of plazaS1, plazaYard, plazaGarden and tavernTower: both directions, key, stick and tap, 10 moments of the villagers' rounds.
- Worst stall 0.4 s; 68 runs met a villager on a bridge.
- Porter check 10/10.
- 30 s of random input: worst stuck behind a person 0.83 s (bound 1 s).
- 120 s sampled: 0 villager stops on a bridge, in a place circle, a doorway or at the gangplank.
- LOOK-2: the captain never moved; villagers stopped 1.00–1.09 u away. Zero page errors.

**Ray check**
- Showcase camera (5 sway poses) to 12 approximate points of the docked ship against the 10 tier-3 envelopes: 0 hits. Approximate: ship points estimated, not read from the berth.

**Rebake timings** (harness)
- At load ~5:
  - town build: 765 ms kraken off, 828 ms kraken on
  - purchase after the prebuild: 4–24 ms
  - all ten plots at tier 3: 57 ms cold, 8.7 ms warm
  - montage: start 11 ms, finish 17 ms
  - setVillagers(24): 36 ms
  - prebuild's worst frame: 24.6 ms
- Earlier at load ~16–24: purchase after the prebuild 13–37 ms. In-game cold bake of all ten at tier 3: 247 ms at load ~22.

**Live game** (published file, ?kraken=1, 1280x720 and 390x844 touch)
- Dock, island, 8 villagers, rank 'Harbour Town', ashore, 3 s walk: no page or console errors; 6 places; 8 villagers visible.

**Screenshots looked at, 3 critique rounds**
- Round 1, panel views: the professor was hidden behind his chalkboard and Bess behind her easel. Fixed by the quiz camera (5 candidates compared) and Bess's new spot (4 builder camera candidates compared).
- Round 2: tiers 1/2/3 of every plot at 1280, 5 plots at 390, both panel views at both sizes, the plaque. No change needed.
- Round 3: walk views at both sizes, the montage (scaffold, spring, porch wave). No art change. That round's probe work found the hidden-villager freeze (fixed).

**Existing suites on the published tree**
- node tests/town.cjs: 130 passed, 0 failed, exit 0 (1103 s).
- node tests/smoke.cjs: 94 PASS, 'All checks passed', exit 0 (845 s).
- node tests/controls.cjs: 232 PASS, 'All control checks passed', exit 0 (1264 s).
- I did not run the full npm test (audio, battle, levels don't load my code paths with the flag off). With kraken off, sparrow's behaviour is proven identical by walk data, people count, draw calls and byte-identical pixels.

### Hook requests

- src/town.js (2B), subjectBox(view, subject) and panelPose(view, subject): today the cam target's box (add(t[0], 1.3, t[2], 0.9, 2.4)) is added for view 'tavern' only. Add it for 'quiz' and for the build view too, and look the place up as placeById(view === 'build' ? 'builder' : view). Why: my place cams aim at the bell + Professor Barnacle and at Bess + her island plan; without the target box, frameBeside frames only the captain and crops them out. I checked this with an emulation of frameBeside at 1280x720 and 390x844.
- src/main.js (3A), openDock when WITH_KRAKEN, after the env is built (behind the 'Rowing to…' toast), each guarded by typeof: env.setIsland(islandCfg); env.setVillagers(islandRules.villagers(islandCfg)); env.setRank(islandRules.rank(islandCfg).name). On a build, after the island record and then the chest are saved: env.setIsland(newCfg, { built: id }); env.setVillagers(islandRules.villagers(newCfg)); env.setRank(islandRules.rank(newCfg).name). env.buildTimes gives the panel's sound timing (knocks + saw from 0.4 s for 1.2 s, the boing at 1.6 s); env.finishBuild() skips the montage on any key or tap.
- src/townMode.js (2B): use folk() entries' villager/home/npc fields for the §8.4 greetings ('Lovely house, Cap'n!'; 'Fresh biscuits today!' with a Bakery; 'The Kraken? Brrr!' after level 9). env.greet already refuses villagers on or near bridges, in place circles and at the gangplank. In the build view, glide the camera with env.plotPose(id), framing the plot box from env.plots (x, z, y, w, d, ry, height) beside the panel.
- tests/ashore.cjs (2D), check (d): sample villagers through env.villagers (it includes hidden ones and a `visible` flag), and count LOOK-2 waits separately. A villager behind a captain who stands on a bridge waits on the bridge; that is the built LOOK-2 rule, not a stop. The probe I used is /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/bridgeprobe.cjs.
- Optional, src/town.js (3D), step(), the cap.stuck > 0.25 branch: when the people-free move is no better (pressed into the rope beside a bridge mouth), try the same move projected onto the nearest walk.links segment. That would let sparrow drop its bridge exemption for villagers.

### Open issues

- Deviation to confirm: villagers near a rope bridge (within about 0.75 u of its line, or on the 3 u of deck leading onto it) are left out of folk(), so the captain walks through them there. LOOK-2 still applies. §8.4 says 'no other rule is added'. Without this, 3 of 240 crossings stuck for 12–13 s, because town.js's squeeze-past can't free a captain pressed into the rope beside a bridge mouth. The optional town.js hook request would let this be dropped.
- island.js is still the Stage 0 stub. sparrow reads the record's `t` directly and keeps its own copy of §8.1's platforms and heights, so it works with either version. The walk test also falls back to §8.1's numbers.
- The first bake at dock open of an island with built plots is cold (57 ms at load ~5 for all ten at tier 3; 247 ms in-game at load ~22), behind the 'Rowing to…' toast. For about 18 frames after the dock opens, the prebuild bakes one chunk per frame (worst frame 24.6 ms at load ~5, kraken only).
- At 1280x720, plotPose('lighthouse') frames the lighthouse small, with the two prize ships at the frame's edges. It reads fine in portrait, and once 2B's frameBeside zooms to the plot box the ships should fall outside it.
- LOOK-2 means a villager walking behind a captain who stands on a bridge waits on the bridge. That is the built rule; 2D's ashore (d) check should count these waits separately.
- The scaffold uses the town's wood colours, so it reads as construction mainly through its braces, ladder and planks. Possible polish for 3D.
- I did not run the full npm test. walk, town, smoke and controls are green on the published tree; audio, battle and levels don't load sparrow's new code paths with the flag off.

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/p1/w_quiz.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/p1/w_builder.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/q1/w_grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/q1/p_grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/b1/w_grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/b1/p_grid.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/cmp/diff_s0.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/cmp/k1_v4.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/r2/sheet_t1a.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/r2/sheet_t2a.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/r2/sheet_t3a.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/r2/sheet_t3b.png
- …

## 1O Ashore panels

_Workflow run wf_ef2b6b15-c5e._

### Summary

Row 1O (Ashore panels) is done and published. I built on the previous attempt's work in /home/user/First-project/.dock-harness/kraken/1O/dev, fixed it, and copied the three owned files into the repo with cp to a temp name + mv. The published files are byte-identical to dev.

- src/quizPanel.js: the Riddle Bell panel (§7.3).
  - Map: nine islands on a dotted 3 × 3 path. Locked islands are aria-disabled and described "Pass X first". Focus starts on the highest open island.
  - Question: "Question n of 5", progress marks by shape (✓ / • / ○), the question at 22 px (20 px on short screens), and 3–4 answers numbered 1–4, each ≥ 56 px tall. "Lifebuoy (n left)" (key H) and Leave quiz are in the footer.
  - Answer: bell + squawk and sparkles when right; a soft bonk when wrong, with Quizzle tilting his head, "Not quite! It's X.", a ✓ on the right answer and the fun fact. The fact now sits under the answers, so nothing moves under the child's finger, and Next ▶ takes focus.
  - Results: the stars stamp in (they fade under reduced motion) and the gold flies to the chest. Buttons: Next quiz, Play again, Map.
  - Gold: paid through quiz.js reward / markPaid / owed. Owed star gold is paid once when the panel opens. Storage-full and chest-refused results show their own words.
  - Everything is announced in #quiz-live.
- src/buildPanel.js: Builder Bess's panel (§8.3).
  - Homes | Amenities tabs (← → Home End).
  - One row per plot: an icon with the tier pips under it, the name, "Tier n of 3", "Now: …" and "Next: …".
  - One button per row with the §8.3 texts: "Build Cottage — 100 gold", "Need N more gold" (aria-disabled, focus stays), "Couldn't save: storage is full or switched off", "Fully built".
  - "Villagers 8 · Hamlet" in the header, with a note on how many builds to the next rank.
  - Focusing or tapping a row asks main to move the camera to that plot (ctx.focusPlot).
  - A double click or a held Enter builds once (400 ms guard). The montage can be skipped by any key or tap, but not by a held key's auto-repeat.
  - Everything is announced in #build-live.
- town.css: 358 lines added at the end, nothing changed or removed. Every new selector belongs to the quiz or build panels. Portrait and short screens get a compact header, two answers a row with corner badges, and a one-line Bess header on the smallest screens.

Fixed from the previous attempt:
- The build panel's test hook `api.tab` was a method and a getter at the same time, so the method was lost. It is now `showTab()`.
- A held Enter's auto-repeat skipped the build montage straight away.
- The answer feedback appeared above the answers and pushed them down.
- In a round the header chip and the chest wrapped onto two lines.
- At 320 px the answer marks were clipped.
- Bess's header left 65–93 px for the list on the smallest screens. A whole plot row now fits at 320×480.
- The results gold line now separates this round's new-star gold from gold owed from earlier rounds.
- The announcements read cleanly ("+145 gold: two new stars!").
- The island name is no longer repeated in the results.

While WITH_KRAKEN is false the live game is unchanged: nothing imports the two modules yet, and the new CSS applies only to overlays that stay hidden. town.cjs and a smoke.cjs re-run passed with the new CSS; two load timeouts in the first runs are explained under verification.

### Files

- /home/user/First-project/src/quizPanel.js
- /home/user/First-project/src/buildPanel.js
- /home/user/First-project/town.css

### API notes

EXPORTS (exactly §11.1): createQuizPanel({ root, ctx }) and createBuildPanel({ root, ctx }). Each returns { open(), close(), onKey(e, down) → handled, refresh(), get active, api }.
- Both modules import only ./quiz.js, ./quizBank.js and ./island.js, and touch no DOM when imported (they load in Node).
- root is the #quiz-screen / #build-screen section. Missing ids get detached elements, so a partial page never throws.
- The quiz panel adds #quiz-feedback after #quiz-answers and moves #quiz-lifebuoy into the footer. The build panel adds #build-town to the header and #build-note to the body. No index.html edit is needed.

CTX (every member optional; one that throws counts as missing):
- quiz panel: quiz { record(), save(rec, gold, info) → {ok, reason?} | bool }, purse(), unlocked() (1..9), hints() (otherwise island.perks(island.state()).hints), island { state() }, bank (default QUESTIONS), seed(), audio { play(name, opts) }, reducedMotion(), back(), react(what, info).
  - react is called with 'open', 'question', 'right', 'wrong', 'lifebuoy', 'results' and 'map'.
  - save gets rec = markPaid(reward(noteSeen(record))): stars raised, paid = stars, tried set, seen updated.
  - info = { kind: 'round' | 'owed', fallback, level, goodTry, newStars }. fallback is the same record with the old paid and tried, for main to write back if the chest write fails (§10.2).
- build panel: island { state(), build(id) → { ok, reason: 'storage' | 'poor' | 'maxed' | 'unknown', cost } | bool }, purse(), audio, reducedMotion(), back(), focusPlot(id), celebrate(id, tier) → seconds (default 2.4), skipCelebration().

KEYS (onKey):
- Quiz: Digit/Numpad 1–4 answer, H throws a lifebuoy, Esc goes back a step (round → map "Your stars are safe", map → ctx.back). A held Enter or Space never presses twice.
- Build: Esc → ctx.back. The tabs handle their own arrows. During the montage a key only skips it.

TEST HOOKS:
- Quiz api: start(level0to8, seed), answer(i), hint(), next(), leave(), map(), again(), nextQuiz(), escape(), get mode, get round { level, index, mode, total, correct, picks, removed, buoys, buoysMax, question, questions }, get result, get panel.
- Build api: showTab(name), build(id) (bypasses the guards), focus(id), skip(), get celebrating, get tab, get looking, get rows, get panel.
- Island levels are 0-based, as in quiz.js.

DEVIATIONS FROM SPEC3:
1. On short screens (portrait ≤ 700 px tall, landscape ≤ 500 px) the answers are two per row, not "full-width". Otherwise 4 answers can't be seen without scrolling at 320×480 or 568×320. They stay ≥ 56 px tall.
2. In a round, on the results, and in Bess's header on short screens, the h2 title is hidden visually but still read out. On the smallest screens the kicker "Builder Bess" and the word "Villagers" are hidden the same way. The chest icon or the villagers icon stands for the words, as the town HUD already does with the chest. The "Villagers 8 · Hamlet" header otherwise shows as specified.
3. The build note ("N more builds and your island becomes a Village!") is hidden on short screens.
4. The Now/Next perk texts are short forms ("+1 of each special shot", "warnings 0.3 s longer", "1 lifebuoy a quiz"). The full sentences are used in #build-live.

DRAW CALLS: the panels are DOM only and add 0 draw calls. The harness 3D behind them (1N's dev sparrow with kraken: true, the game's renderer, not ?quality=low):
- Quiz place views: 62 (1280×720), 34 (390×844), 95 (844×390).
- Build overview: 339 (1280×720), 234 (390×844), 264 (320×480), 334 (568×320).
- Focused-plot views: 28–51.

### Verification

Harness: /home/user/First-project/.dock-harness/kraken/1O/panels.html. It runs the game's renderer (src/scenery.js) with 1N's dev sparrow (kraken: true) and a mock townMode ctx. The build panel uses a mock of island.js (.dock-harness/kraken/1O/mock/island.js), because 1D has not landed. The quiz uses the real quiz.js and quizBank.js from the working tree (1E, uncommitted). Probe scripts are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/.

Exit check, layout probe (layout.cjs): the 7 town sizes (320×480, 360×640, 390×844, 844×390, 568×320, 1024×600, 1280×720) plus 360×480 and 640×360, 11 states each:
- quiz map, 4-answer and 3-answer questions, wrong and right answers, results, results with storage full;
- build homes, amenities, refused, everything built.
Checks: no page scroll, the panel inside the view, no sideways overflow, no clipped button text, every visible button ≥ 44×44, answers ≥ 56 px tall, text contrast ≥ 4.5:1 (3:1 for large text).
Results:
- "TOTAL FAILS 0 (9 sizes x 11 states, fonts game)".
- "TOTAL FAILS 0 (9 sizes x 11 states, fonts fallback)".
- Against the published repo files: 0 failures with the game fonts, 0 with the fallback fonts.
- Smallest button 44 px, smallest answer 56 px. Small-text contrast ≥ 5.23. The 3.44 minimum is the game's red panel title, kept at ≥ 19 px Luckiest Guy (large text).

Keyboard only and screen-reader texts (kbd.cjs): 72 passed, 0 failed at each of 1280×720, 390×844, 568×320 and 1024×600. It covers:
- focus on open, Tab, focus rings, a locked island explained;
- Enter, Digit1–4, H, a held Enter moving on once, Esc back steps, focus on Next and on Next quiz;
- the exact #quiz-live and #build-live texts;
- the gold rules: 3/4/5 right = 1/2/3 stars with the §7.2 gold once, replays pay 0, Good try once, storage full → no gold and the words, owed gold paid exactly once when storage works again, chest refused → paid not raised;
- the build tabs (← → Home End), a held Enter building once, a key during the montage only skipping it, "Need 430 more gold" with aria-disabled and focus kept, a double click building once, storage refused at no cost, Pirate Capital;
- Playwright ariaSnapshot: answers named "1, A seagull", tablist and tabs, the Build button described by name, tier, Now and Next.

Same probe against the published repo files: all quiz checks pass. 11 build checks fail because island.js is still the Stage 0 stub, which always answers 'poor' and tier 0. Stage 1b must re-run them.

Touch (taps.cjs, 390×844 with touch): 8 passed, 0 failed when taps come quickly. Under load some runs showed the two taps of a "double tap" landing 1.7 s apart; the script reports those as SKIP (two separate taps, the guard working as designed).

Row fit (rowfit.cjs): a whole plot row fits at 320×480, 640×360, 844×390, 360×640, 390×844, 1024×600 and 1280×720. At 360×480 every row fits except the bakery (147 px vs 140). At 568×320 the home rows fit (128 vs 129) but the amenity rows (140–157 px) need a scroll.

Screenshots: four critique rounds (r1–r4), each looked at, at 1280×720 and 390×844, plus 320×480, 360×640, 568×320, 640×360 and 844×390.

Test suites (machine load average 20–30 from other agents):
- Node: combat 107, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server: all pass.
- tests/town.cjs: 119 passed, 2 failed. The 2 failures were the review4 and review4-world sections crashing on page.goto timing out at 120 s. Re-run with TOWN_ONLY=review4,review4-world: 17 passed, 0 failed, EXIT 0.
- tests/smoke.cjs, run 1: 93 passed, 1 failed ("adaptive resolution kicks in on a slow renderer (scale 1)", a frame-time check in menu mode).
- tests/smoke.cjs, run 2: crashed at smoke.cjs:133 waiting for the level 1 fly-in to finish within 120 s.
- tests/smoke.cjs, run 3: 94 passed, 0 failed, EXIT 0.

I did not run the full npm test.

### Hook requests

- src/townMode.js (2B), PLACES / open('quiz') and open('builder'): create the panels once with createQuizPanel({ root: #quiz-screen, ctx }) and createBuildPanel({ root: #build-screen, ctx }). Build each ctx from townMode's ctx as listed in api_notes: quiz { record, save }, purse, unlocked, hints, island { state }, audio, reducedMotion, back: () => townMode.back(), react, focusPlot, celebrate, skipCelebration. open('builder') shows view 'build' and calls buildPanel.open(); leaving a view calls panel.close(); onResize and chest changes call panel.refresh(). Why: 1O ships the panels against this exact ctx.
- src/townMode.js (2B), the key handler: in views 'quiz' and 'build', call panel.onKey(e, down) first and stop when it returns true. Digit1-4, H, Enter and Esc must not reach townMode's own handling while a panel is up. The panel's Esc calls ctx.back(); townMode then returns focus to the place's button (§15). Why: answers, the lifebuoy and Esc-step-back live in the panel.
- src/townMode.js (2B), the 3D side of the panels: react('right') rings the bell (professor + Quizzle flap), react('wrong') tilts Quizzle, react('map') / 'open' frame the bell beside the panel. focusPlot(id) moves the camera to env.plotPose(id) beside the panel (a cut under reduced motion). In portrait the harness's raw plotPose view of a plot was a roof close-up, so frameBeside should keep the bottom sheet in mind. celebrate(id, tier) plays the montage (env.setIsland(cfg, { built: id }), dust, knocks, boing, bunting, the villagers' wave) and returns its length in seconds; skipCelebration() ends it.
- src/main.js (3A), townMode ctx quiz.save(rec, gold, info): write serializeQuiz(rec) first. If that fails, keep the stars for the visit (quizRec = parseQuiz({ ...rec, paid: quizRec.paid, tried: quizRec.tried })) and return { ok: false, reason: 'storage' }. Then add the gold and write the chest. If the chest fails, write info.fallback back, keep it in memory and return { ok: false, reason: 'chest' }. On success set quizRec = rec, raise the feats quiz / stars by max, and return { ok: true }. Why: the §10.2 owed-gold rule; the panel never touches storage.
- src/main.js (3A), townMode ctx island.build(id): re-read the records, run island.js build(cfg, purse, id), write the island record first (refused → { ok: false, reason: 'storage' }, nothing paid), then the chest, then env.setIsland, and return { ok: true, cost }. Pass island.js's own 'poor' / 'maxed' / 'unknown' reasons through. Why: the §0.1 record-first rule; the panel only shows the result.

### Open issues

- Stage 1b must re-run the build panel's checks against the real island.js once 1D lands. Run layout.cjs, kbd.cjs and taps.cjs in the scratch folder with EXTRA='&src=repo&css=repo'. With today's Stage 0 stub, parseIsland and build always give tier 0 / 'poor', so 11 keyboard build checks fail; the panel itself handles this without errors. The panel reads: PLOTS[].{ id, name, kind, tiers[3], costs[3], perk{ key: [3] } } with perk keys villagers / wavePatch / extraLoads / warnBonus / marketPct / hints / giftMul; RANKS[].{ name, from }; and the functions parseIsland, plotState(…).{ tier, cost }, villagers, tiersBuilt, rank(…).name and perks(…).hints.
- Stage 1b should re-run the quiz probes if 1E changes quiz.js or quizBank.js, which are uncommitted in the working tree. They currently pass against it. The panel relies on: QUIZ_LEVELS[].{ name, band, first, later }, makeRound → [{ id, cat, q, options, right (an index), fact }], reward / markPaid / owed / openLevels / noteSeen / parseQuiz / hint / rng / stars / GOOD_TRY.
- Some plot rows are taller than the list at the shortest sizes and need a scroll: the bakery at 360×480 (147 px vs 140), and the amenity rows at 568×320 (140–157 px vs 129). Every home row fits.
- On short screens, after a wrong answer the panel scrolls to show the fun fact, so the question (and at 320×480 the right answer's row) scrolls out of view. The feedback still names the right answer.
- The montage, the camera moves to plots and the bell / Quizzle reactions are townMode's (2B), through ctx.celebrate, focusPlot and react. In this harness the camera went straight to plotPose without frameBeside, which gave a roof close-up in portrait.
- I did not run the full npm test. The load-related failures in town.cjs and smoke.cjs passed on re-run (details under verification).

### Screenshots (scratch)

- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qmap-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qask-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qwrong-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qres-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-bhome-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-bamen-1280x720.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qmap-390x844.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qask-390x844.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qwrong-390x844.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qres-390x844.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-qresfull-390x844.png
- /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1O/shots/r4-bhome-390x844.png
- …

## All hook requests, by target file (for Stage 2)

### src/main.js

- (1A) src/main.js ballHit (2A): call `info.dmg *= combat.armourMul(info.aspect, s.type.armour, info.crit)`, passing info.crit as the 3rd argument, so a beam crit on an Iron Turtle does full damage as §4.2 says. With the bare two-argument call of §2.6 a crit would also be halved.
- (1A) src/main.js damage(), once per volley per target (2A): call `specials.applyStatus(s.status, info.status, { typeKey: s.typeKey, boss: !!s.type.boss, burning: <the shared burn is running> })`. Then set s.status = r.st; deal r.burst at once, bypassing armourMul; merge r.burn into the ship's one burn with `specials.mergeBurn({ rate, hp: hp left to burn }, r.burn)`, where the keg's burn is `{ rate: EFFECTS.keg.dps, time }`; stop the burn on r.stopBurn; and use r.pop, r.why and r.sfx for the pop, #game-live and the sound. Without this, KA-BOOM, FIRE OUT, IMMUNE! and the shared keg/fire burn are not applied.
- (1A) src/main.js updateEffects, enemy speed and canGrapple (2A): call `specials.stepStatus(s.status, dt)` in step(), but not on a glued boarding pair (stinks pause from the hook, burns from the swing, §2.4). Coast a stinky ship to a stop at `statusMuls(st).decel` × her accel. In canGrapple, refuse a target whose `statusMuls(st).noGrapple` is true with `specials.WORDS3.hot`. In boardingSides, multiply the defender's grit by `statusMuls(st).grit`. Reset s.status to `specials.newStatus()` on strike, capture, escape or flee.
- (1A) src/main.js fire(), key 4–6, R and tray handlers (2A): test with `specials.ammoReady(id, { powder: state.powder, loads: state.loads, unlocked })` and show its `word` as the hint. Each side that fires a special calls `specials.spendLoad(state.loads, id)`. When it returns ok false, set `state.ammo = 'round'` directly and show `specials.WORDS3.out(id)` (§2.5). Crates use `specials.crateLoad`, and level starts use `specials.startLoads(state.powder, windmillTier)`.
- (1A) src/main.js saves (2A): load 'pirates-ahoy-powder' with loadRecord, using specials.parsePowder and specials.serializePowder. A stored record that needed fixing serializes differently, so loadRecord rewrites it. The storage listener merges with `specials.mergePowder(mine, theirs)`.
- (1B) src/main.js startLevel(), the ctx3 literal (~line 1327): add these members, all optional for mechanics3: hold: () => state.intro > 0 || boarding.truce (hazards, rams, mortars, ink, fuses and flee timers wait during the fly-in and the truce, as bombs do; today mechanics3's clock and grace count the fly-in); attacking: (e) => attackSet.has(e) (hoist step()'s local `attackers` Set, ~line 3373, into a module-level `attackSet` so a shark rams and a ketch lobs only while she holds an attack slot); boarding: () => boarding.active (krakenDue waits for any boarding); capture: (e) => captureShip(e, 'auto') (struck ships taken at the Inkheart's fall; without it krakenDue never turns true while a struck ship floats); turnRate: (s) => turnRate(s) (mortar and ink lead with the real turn rate). Fill in the Stage 0 no-ops: flee(e) sets e.fleeing = true and clears e.status; explode(x, z, r, dmg, src) gives the blast its look and sound only (mechanics3 deals the damage through ctx.damage); douse(e) applies specials.douse to e.status and pops FIRE OUT! when doused; surrender(e) strikes her colours as checkSurrender does (white flag, banner), without the crew test.
- (1B) src/main.js fighting() (~line 1552): add `&& !e.fleeing`. In separateShips(), skip ships with e.fleeing (§11.2). updateEnemy already asks mechanics.steer before the attack logic, so fleeing ships get their heading for the world edge.
- (1B) src/main.js startLevel() and __game.mechanics3 (~line 6953): keep the createMechanics3 instance, e.g. `m3 = mechanics3.createMechanics3(ids, ctx3); mechanics = composeMechanics([createMechanics(ids, ctx), m3])`. Wire `wave: (a) => m3.wave(a), spout: (x, z) => m3.spout(x, z)`. composeMechanics does not pass these test hooks through, and must stay as Stage 0 wrote it.
- (1B) src/main.js frame() (~line 6664): before env.update, set `envFrame.hazards = mechanics.visuals();`. atolls.js reads .spouts, cape.js .rogue, deep.js .slicks. Today the envs never see the hazards; my probes had to patch env.update to draw them.
- (1B) src/main.js moveShip() (~line 3000): apply the spout spin after the drift: `const spin = mechanics.shipMods(s).spin; if (spin) s.h = wrapAngle(s.h + spin * dt);` (not for the boarding-held pair).
- (1B) src/main.js damage(), the sink branch (~line 2565): mechanics.onSink(ship) already runs before the coin drop. Skip dropping her coins when `ship.exploded` is set (a fire ship sunk while lit explodes: no coins, §4.2).
- (1B) src/main.js updateBombs(): add the kinds 'shell' (orange ring with fuse sparks) and 'ink' (dark-violet ring). When an 'ink' bomb lands, call `mechanics.addSlick(b.tx, b.tz)`; the Kraken's ink blob does the same.
- (1B) src/main.js frame()/updateHud: set the tag's RAM icon for ships whose id is in mechanics.visuals().rams (tags.js ICONS.ram). Draw a lit fire ship's red ring from visuals().fireRings and show ships.js userData.fuse flames while she is lit.
- (1B) src/main.js step() clear check (~line 3439), for def.kraken: when alive === 0 on the last wave, run the struck-ship auto-capture first. captureShip calls mechanics.onCapture, which is the Inkheart's fall if she struck and was never boarded. Only then gate the clear on kraken.done. Start the dread when mechanics.krakenDue turns true. Stop def.bombs (the geysers) once the flagship has sunk or been captured: check ship.type.flagship in the onSink/onCapture paths, or read mechanics.state.m3.flagship.fallen once (do not read state every step; it builds a full snapshot).
- (1B) src/main.js canGrapple(): a fire ship that has not struck answers 'immune' with "Too hot to board! Freeze her first." (§4.2). mechanics3 makes a frozen fire ship strike through ctx.surrender.
- (1C) src/main.js (Stage 2A), the ctx passed to createKraken: forward sfx's optional 4th argument to the audio call, e.g. sfx: (name, x, z, o) => <main's positional sfx helper>(name, x, z, o && o.duration ? { duration: o.duration } : undefined). Why: audio.js 'tentacle' is a rising tone that defaults to 1.6 s; given the ring's warning time (1.5 to about 2.3 s with the Lighthouse or frost), its surge comes with the slam (§5.7.3).
- (1C) src/main.js (2A), step(), L9 clear check: wait for kraken.over, not kraken.done, and pass ctx.pearl = (gold) => { state.gold += gold; }. Why: §5.7.1 step 5 adds the Pearl's 1,000 to state.gold when it is collected, so finishLevel banks it. The Pearl bobs up about 2.6 s after done and is collected 3.5 to about 12 s after done, so clearing on done would lose it.
- (1C) src/main.js (2A), input during the rise: any key or tap calls kraken.skip(). Why: §5.7.1 step 3 makes the rise skippable.
- (1C) src/main.js (2A), updatePlayer: apply kraken.playerMods() each step: multiply speed and turn by speedMul / turnMul; while grabbed, apply dps × dt to the hull; add (vx, vz) × dt to the player's position. Why: §5.7.3 grab (speed and turn 0, 2 hp/s) and the phase-3 pull (2 u/s toward the head within 50 u).
- (1C) src/main.js (2A), HUD: read kraken.status for the #boss-status badge, and take the #grab-strip, CUT! and 'You can't board a sea monster!' texts and the banners from KRAKEN.words (strip, stripTouch, cutButton, noBoard, banner.rise / how / howStink / off), so every screen says the same thing.
- (1E) src/main.js (owner 2A/3A), the `__game.quiz.set` placeholder and the future loadRecord of `pirates-ahoy-quiz`: import QUESTIONS from ./quizBank.js and call `quizRules.parseQuiz(raw, QUESTIONS)` instead of `parseQuiz(rec)`. Why: only then does `seen` keep only ids that exist in the bank (§10.1). Also use `quizRules.mergeQuiz(mine, theirs)` in the storage listener for `-quiz` (§10.2), and pay owed gold on panel open as `gold = owed(rec)` then `markPaid(rec, null, false)`, only after both writes succeed.
- (1F) src/main.js (2A), syncFeats (~line 417): for ids in MAX_FEATS (import from cosmetics.js) use `next[id] = Math.max(next[id] || 0, feats[id] || 0)` instead of adding `more(feats[id], featsSaved[id])`. Keep adding deltas for captures/boardings/rakes/crits and prizes. Why: §10.2 says legend/kraken/quiz/stars/island mirror progress and must merge by max between tabs; adding deltas over-counts.
- (1F) src/main.js (2A): replace `const TURN_LOW = 0.35` (~line 2760) with `RUDDER.values[0]` (import RUDDER, SHIPYARD from './upgrades.js'), per §11.1 'no second 0.35'. Also: buyUpgrade looks the id up in SHIPYARD with new tier `Math.min(maxTier(id), (shipConfig.up[id] ?? 0) + 1)` (§10.2), and the shipyard panel lists `WITH_KRAKEN ? SHIPYARD : UPGRADES`. upgrades.js already supports all of this.
- (1H) src/main.js (2A), buildPlayerMesh() line 914: pass the powder record so the keg rack shows: buildShip('player', { type, look: shipConfig.look, upgrades: shipConfig.up, armory: { grapple: armoryCfg.up.grapple }, powder: state.powder }). shipConfig.up already carries the sparse rudder tier once 1F lands it. Why: SPEC3 §2.7 and §3.1, the model shows the kegs and the rudder tiers.
- (1H) src/main.js (2A), where mechanics3 reports a fire ship lit (FIRESHIP, within 30 u) or doused or struck: set e.mesh.userData.fuse.lit = true or false (or fuse.level = 0..1 to follow the arming timer exactly). Why: §4.2, the flames climbing her rigging are her telegraph of at least 1.6 s; ships.js animates them inside animateShip.
- (1H) src/main.js (2A), launchBomb(spec) for kind 'shell' or 'ink' fired by a Bomb Ketch or the Inkheart: call from.mesh.userData.mortar.fire(t) with the visual time passed to animateShip, start the shell at from.mesh.localToWorld(new THREE.Vector3(m.muzzle.x, m.muzzle.y, m.muzzle.z)) where m = from.mesh.userData.mortar, and use projectileMesh('shell') or projectileMesh('ink') as the flying shell. Why: §4.3, the mortar jumps and puffs a smoke ring when it fires.
- (1H) src/main.js fire() (2A): no change is needed for specials; projectileMesh(b.ammo) already returns the fire, frost and stink balls when given those ids.
- (1I) src/main.js (Stage 2A, integration): create `statusFx.createStatusFx(scene, { reducedMotion, seaY: (x, z, t) => ocean.heightAt(x, z, t) })`. Each frame, after ships are placed, call `fx.sync(liveShips, visualT, dt)` (dt = 0 while paused). Call `fx.clear(ship)` when a ship is removed or captured. During the Kraken fight, append `kv.statusShip(kraken.status)` to the list passed to sync. Why: statusfx draws nothing until main calls it.
- (1I) src/main.js (Stage 2A): create `krakenView.createKrakenView(scene, { reducedMotion, foamColor: level.palette.waterFoam, seaY })` on L9. Call `kv.prepare()` once per frame during the fly-in until it returns true. Each frame call `kv.update(kraken.visuals(), visualT, dt)`. During the rise, use `kv.riseCamera(k, { x, z, h, duration })` (null = keep main's own camera). Why: prepare() splits the build and warm-up over frames so the rise never stalls.
- (1I) src/main.js (Stage 2A): #boss-status: remove .hidden while the boss has a status. Set `dataset.status = st.id`, textContent = the WORDS3 badge word (ON FIRE / FROZEN / STINKY), and `style.setProperty('--left', st.t / st.max)`. Why: fx.css draws the shape and the dot ring from these (§6.3).
- (1I) src/main.js (Stage 2A): pops. Use pop(text, x, y, z, 'fire' | 'frost' | 'stink' | 'kraken'), with mod 'kaboom' for KA-BOOM! and 'eye' for BULLSEYE!. Set tagIcon 'ram' by §6.4's priority (white > ram > hook > hot). Why: these are the classes and icons 1I provides.
- (1J) src/main.js (2A), where the Kraken is staged (dread, rise, fight): at the start of the dread, call audio.setMusicPhase(0) then audio.setScene('kraken'). Each frame, call audio.setMusicPhase(n): 1 or 2 during the fight, 3 in phase 3, 4 when the Kraken is driven off. Why: §5.6 and §5.7.1 need the drone and then the theme, faster in phase 3. The audio side is a new method beyond §11.1; it is cheap enough to call every frame.
- (1J) src/main.js (2A), fire(): today line 2011 does `if (ammo !== 'round') audio.play(ammo, ...)`. Limit it to chain and grape. Why: 'stink' is now a real sound name, so a stink ball would play its hit sound at the gun. §11.2 and SMALL-FACTS (f) say a special ball launches with the round shot's sound.
- (1J) src/main.js (2A), statuses: keep one handle from audio.play('crackle', sfxAt(x, z, { duration: burn time })) for the nearest burning ship (at most 2 voices). Update it each frame with handle.set({ distance, pan }), and call handle.stop() when the fire goes out. Why: §2.7 asks for a crackle loop on the nearest burning ship.
- (1J) src/main.js (2A), spouts: for each forming or active waterspout, call audio.play('spout', sfxAt(x, z, { duration })), then handle.set({ distance }) each frame and handle.stop() when the spout ends. mechanics3 does not start this loop itself. Why: §5.3 asks for a wind loop that grows louder as you near a spout.
- (1J) src/main.js (2A), launchBomb(spec) for L9's `geyser` bombs: call audio.play('geyser', sfxAt(tx, tz, { duration: warn })) when the warning ring appears. Why: the kid rules need a sound with every warning, and its 'fwoosh' lands on the impact when it is given the warning time.
- (1K) src/main.js, frame() (Stage 2, 2A). Before `env.update(t, dt, envFrame)`, set `envFrame.hazards = mechanics && typeof mechanics.visuals === 'function' ? mechanics.visuals() : null;` and clear envFrame.hazards to null in startLevel. Why: atolls.js draws level 7's waterspouts only from hazards.spouts (§11.1: `update(t, dt, { simTime, camera, hazards })`, with hazards = mechanics.visuals()). Today envFrame is only { simTime, camera }, so the spouts' pull and core damage are live but nothing is drawn (kid rule: every threat must be telegraphed). Verified: when the probe feeds mechanics3's live list into env.update, the spouts render correctly.
- (1K) src/main.js, drawMinimap (2A). Draw white swirls for `mechanics.visuals().spouts` at radius 6 (forming dashed, active solid), per §5.3 Looks ('white swirls on the minimap').
- (1K) src/main.js plus the audio scene (2A, using 1J's `spout` SFX). Play a whistling wind loop whose volume rises as the player nears the closest active spout (§5.3 Looks).
- (1K) src/main.js, powder crates (2A). Place crates at `env.crateSpots` in their given order: 8 spots, the first ahead and to the side of the start, the rest spread so any prefix is well spaced.
- (1L) src/main.js (Stage 2, 2A), frame(): set `envFrame.hazards = mechanics.visuals();` just before `env.update(t, dt, envFrame)`. Today envFrame is only { simTime, camera }, so the env draws no rogue wave in the real game. I proved it works by feeding `G.mechanics3.state.rogue.wave` (the same object as visuals().rogue) in the live probe. This also feeds atolls' spouts and deep's slicks.
- (1L) src/main.js (Stage 2, 2A), the __game test API: `mechanics3.wave(angle)` is still a stub returning null. Point it at the composed mechanics instance's own wave(angle) hook (mechanics3 already has one), as SPEC3 §11.3 asks, so tests can start a rogue wave on demand.
- (1M) src/main.js, frame() (the block that calls env.update(t, dt, envFrame), about line 6666), agent 2A: set envFrame.hazards = mechanics.visuals() before env.update(...). Why: SPEC3 §11.1 says each env draws its own hazard visuals from update(t, dt, { simTime, camera, hazards }), and deep.js draws the Inkheart's and the Kraken's ink slicks from hazards.slicks. Today envFrame carries only { simTime, camera }, so no slick is ever drawn.
- (1M) src/main.js, the level-9 sequence in step() (SPEC3 §5.7.1), agent 2A: call env.setDread?.(1) when the 4 s dread starts (it eases over 2.5 s, a cut under reduced motion). Call env.setDawn?.() when the Kraken is driven off (eases over 3 s, a cut under reduced motion). startLevel(9, { fromKraken: true }) rebuilds the env with dread at 0, so also call env.setDread?.(1) at the short rise.
- (1M) src/main.js, createKraken ctx (agent 2A, with 1C): env.krakenArena = { x: 0, z: -5, r: 64 } is open water, every collider is at least 19.9 u clear of its rim, and it lies inside worldRadius − 20 with 51 u to spare. Use it for ctx.world, the rise spot or the head's 'open water' placement as kraken.js needs. Keep ctx.land(x, z, r) testing against main's colliders for attack spots. kraken.js is still the Stage 0 stub, so the exact use is 1C's and 2A's call.
- (1N) src/main.js (3A), openDock when WITH_KRAKEN, after the env is built (behind the 'Rowing to…' toast), each guarded by typeof: env.setIsland(islandCfg); env.setVillagers(islandRules.villagers(islandCfg)); env.setRank(islandRules.rank(islandCfg).name). On a build, after the island record and then the chest are saved: env.setIsland(newCfg, { built: id }); env.setVillagers(islandRules.villagers(newCfg)); env.setRank(islandRules.rank(newCfg).name). env.buildTimes gives the panel's sound timing (knocks + saw from 0.4 s for 1.2 s, the boing at 1.6 s); env.finishBuild() skips the montage on any key or tap.
- (1O) src/main.js (3A), townMode ctx quiz.save(rec, gold, info): write serializeQuiz(rec) first. If that fails, keep the stars for the visit (quizRec = parseQuiz({ ...rec, paid: quizRec.paid, tried: quizRec.tried })) and return { ok: false, reason: 'storage' }. Then add the gold and write the chest. If the chest fails, write info.fallback back, keep it in memory and return { ok: false, reason: 'chest' }. On success set quizRec = rec, raise the feats quiz / stars by max, and return { ok: true }. Why: the §10.2 owed-gold rule; the panel never touches storage.
- (1O) src/main.js (3A), townMode ctx island.build(id): re-read the records, run island.js build(cfg, purse, id), write the island record first (refused → { ok: false, reason: 'storage' }, nothing paid), then the chest, then env.setIsland, and return { ok: true, cost }. Pass island.js's own 'poor' / 'maxed' / 'unknown' reasons through. Why: the §0.1 record-first rule; the panel only shows the result.

### src/townMode.js

- (1A) src/townMode.js Powder room (2B): use specials.RECIPES, onSale, buyRecipe, WORDS3.blurb, WORDS3.powderTip (once that recipe is owned) and WORDS3.locked/buy. Write the record first and the chest second (§0.1); buyRecipe never moves gold itself.
- (1F) **[applied by the coordinator in Stage 1]** src/townMode.js (2B, Stage 2), wardrobe builder `for (const it of Object.values(ITEMS))` (~line 289) and captain's log `const trophies = Object.values(ITEMS).filter((it) => it.trophy)` (~line 1172): import KRAKEN_ITEMS from './cosmetics.js' and skip those four ids unless ctx.withKraken is true. Why: with WITH_KRAKEN false, Polly's live wardrobe shows 'Baby kraken: Locked: drive off the Kraken', 'Rainbow macaw: Locked: win all 27 quiz stars', the mortarboard and the Governor's coat, and the captain's log counts them. These are features the live game doesn't have yet (see /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1F/g1/dev-1280x720-wardrobe-pets.png). Once WITH_KRAKEN is true they show as designed.
- (1G) src/townMode.js (Stage 2 owner 2B), function greetLine: replace `if (look.cap && look.cap.pet && look.cap.pet !== 'none') lines.push('Is that a parrot?!', 'Is that a parrot?!', 'Is that a parrot?!');` with `const pet = look.cap && look.cap.pet; if (pet === 'octopus') lines.push('Is that a baby kraken?!', 'Is that a baby kraken?!', 'Is that a baby kraken?!'); else if (pet && pet !== 'none') lines.push('Is that a parrot?!', 'Is that a parrot?!', 'Is that a parrot?!');`. Why: once 1F adds the pet.octopus trophy, townsfolk would greet a captain wearing the baby kraken with 'Is that a parrot?!'.
- (1H) src/townMode.js and main.js (2B/3A): when a Powder-room recipe is bought, rebuild the docked ship (today PERF-1 rebuilds it only for grapples) so the new keg appears on deck. Why: §2.7, the kegs are shown for the recipes owned.
- (1N) src/townMode.js (2B): use folk() entries' villager/home/npc fields for the §8.4 greetings ('Lovely house, Cap'n!'; 'Fresh biscuits today!' with a Bakery; 'The Kraken? Brrr!' after level 9). env.greet already refuses villagers on or near bridges, in place circles and at the gangplank. In the build view, glide the camera with env.plotPose(id), framing the plot box from env.plots (x, z, y, w, d, ry, height) beside the panel.
- (1O) src/townMode.js (2B), PLACES / open('quiz') and open('builder'): create the panels once with createQuizPanel({ root: #quiz-screen, ctx }) and createBuildPanel({ root: #build-screen, ctx }). Build each ctx from townMode's ctx as listed in api_notes: quiz { record, save }, purse, unlocked, hints, island { state }, audio, reducedMotion, back: () => townMode.back(), react, focusPlot, celebrate, skipCelebration. open('builder') shows view 'build' and calls buildPanel.open(); leaving a view calls panel.close(); onResize and chest changes call panel.refresh(). Why: 1O ships the panels against this exact ctx.
- (1O) src/townMode.js (2B), the key handler: in views 'quiz' and 'build', call panel.onKey(e, down) first and stop when it returns true. Digit1-4, H, Enter and Esc must not reach townMode's own handling while a panel is up. The panel's Esc calls ctx.back(); townMode then returns focus to the place's button (§15). Why: answers, the lifebuoy and Esc-step-back live in the panel.
- (1O) src/townMode.js (2B), the 3D side of the panels: react('right') rings the bell (professor + Quizzle flap), react('wrong') tilts Quizzle, react('map') / 'open' frame the bell beside the panel. focusPlot(id) moves the camera to env.plotPose(id) beside the panel (a cut under reduced motion). In portrait the harness's raw plotPose view of a plot was a roof close-up, so frameBeside should keep the bottom sheet in mind. celebrate(id, tier) plays the montage (env.setIsland(cfg, { built: id }), dust, knocks, boing, bunting, the villagers' wave) and returns its length in seconds; skipCelebration() ends it.

### package.json

- (1E) **[applied by the coordinator in Stage 1]** package.json (owner 3C, Stage 3; or the coordinator earlier): in scripts.test, insert `node tests/quiz.test.cjs && ` after `node tests/upgrades.test.cjs && ` (the Node suites run first), and add the script "test:quiz": "node tests/quiz.test.cjs". Why: the new suite (85 checks, about 4 s) is not in npm test yet.

### src/quizPanel.js

- (1E) src/quizPanel.js (owner 1O, Stage 1b re-check): build against these real shapes. A round item is { id, cat, q, options: string[3|4], right: index, fact }. `level` is the 0-based island index, and island i is open when i < openLevels(rec). hint(question, removedIndexes, rng) returns null once only two answers remain. Sum answers are digit strings.

### other

- (1E) docs/kraken-seas/SPEC3.md §19 build record (coordinator / Stage 4): record that three §7.5 starters were corrected for accuracy (sea-lighthouse wrong answers, life-crab wrong answer 'On tiptoe', life-blue-whale heart fact), and that the Stage 1 additions are the 48 ids that are not in §7.5.
- (1N) Optional, src/town.js (3D), step(), the cap.stuck > 0.25 branch: when the people-free move is no better (pressed into the rope beside a bridge mouth), try the same move projected onto the nearest walk.links segment. That would let sparrow drop its bridge exemption for villagers.

### src/town.js

- (1N) src/town.js (2B), subjectBox(view, subject) and panelPose(view, subject): today the cam target's box (add(t[0], 1.3, t[2], 0.9, 2.4)) is added for view 'tavern' only. Add it for 'quiz' and for the build view too, and look the place up as placeById(view === 'build' ? 'builder' : view). Why: my place cams aim at the bell + Professor Barnacle and at Bess + her island plan; without the target box, frameBeside frames only the captain and crops them out. I checked this with an emulation of frameBeside at 1280x720 and 390x844.

### tests/ashore.cjs

- (1N) tests/ashore.cjs (2D), check (d): sample villagers through env.villagers (it includes hidden ones and a `visible` flag), and count LOOK-2 waits separately. A villager behind a captain who stands on a bridge waits on the bridge; that is the built LOOK-2 rule, not a stop. The probe I used is /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1N/s3/bridgeprobe.cjs.


## Stage 1b: 1N and 1O re-checked against the real island.js

1N and 1O were built while src/island.js was still the Stage 0 stub; 1I was re-checked against 1H's anchors and the current kraken.js in its close-out (see 1I above). Workflow run wf_f5715378-4e4.

### 1N Town world

I re-ran 1N (Town world) against the real island.js and published two files atomically: src/env/sparrow.js and tests/walk.test.cjs. src/walk.js needed no change. The fixture did not need regenerating: with the real island.js, env.walk (kraken on) still equals tests/fixtures/sparrow-walk.json byte for byte.

(1) Plot numbers. sparrow.js's own copy of §8.1 (PLOT_ART), the walk test's typed-in table (SPEC_PLOTS) and the real island.js PLOTS all agree for all 10 plots: platforms, x/z, kinds, names, tiers and heights. They also agree with sparrow's platform positions and the fixture's envelopes. Even so, sparrow now builds the plots from island.js PLOTS alone: PLOT_ART and the [2,4,6] / VILLAGER_CAP / 'Hamlet' fallbacks are gone. The walk test's fallback table is gone too; the test now reads island.js strictly and checks each envelope's height exactly.

There was one real drift, in how the record is read. setIsland had been written against the Stage 0 stub, so it read cfg.t itself with rules that differ from island.js. Digit-string tiers showed as 0, 1e20 showed as 3, and a stored-text record showed every plot at 0. In each case the town would disagree with the panel and the perks. setIsland now reads the record through island.js parseIsland.

(2) 1N's exit check, re-run against the real modules: every item passes. Details are in exit_check.

(3) Look round at tiers 1 and 3, at 1280x720 and 390x844, using the real perks, rank, villagers and plotState text. It found one problem: the longest real rank, "PIRATE CAPITAL", touched the plaque's two stars. Fixed and re-shot.

The 1O Stage 1b agent works in the same .dock-harness/kraken/1b folder, so I keep my mirror in .dock-harness/kraken/1b/1N/ and left its files alone.

**Files:** src/env/sparrow.js, tests/walk.test.cjs

**Fixes**

- src/env/sparrow.js: setIsland read cfg.t itself, under rules that differ from island.js. This was the only real drift; the published Stage 1 file mis-reads 3 of the 7 test records. With digit strings ("2", " 1 ", "3") it showed tier 0 where island.js says 2/1/3. With unsafe integers (1e20) it showed 3 where island.js says 0. A stored-text record showed all 0, and an inherited `t` was accepted. The town would then disagree with the build panel and the perks. setIsland now reads `islandRules.parseIsland(cfg).t`, and a browser probe shows the town's tiers equal island.js tierOf for all 7 records.
- src/env/sparrow.js: sparrow kept its own copy of §8.1's platforms and tier-3 heights (PLOT_ART). That copy filtered and backed up island.js's rows. The numbers had not drifted, but it was a second source of truth. Plots are now built only from island.js PLOTS (platform, kind, height). Gone with PLOT_ART are the [2, 4, 6] villagers fallback, the VILLAGER_CAP fallback and the three literal 'Hamlet' defaults (now RANKS[0].name). Positions still come from the platform scenery; the walk test checks that island.js x/z match it.
- tests/walk.test.cjs: the test fell back to a typed-in §8.1 table (SPEC_PLOTS) and only checked the envelope height with >=. A wrong platform, a lower height or a missing height in island.js passed silently; the old test passes all three of those mutants. It now reads island.js PLOTS strictly, with a new check that each plot has its own platform, x/z and a height above 0, and an exact envelope-height check. Mutants of island.js: home height 8 → 4 FAIL; lighthouse x 34 → 1 FAIL; homeC on s7 → 1 FAIL (Stage 1 test passed); park height 4 → 1 FAIL (Stage 1 passed); park height missing → 2 FAIL (Stage 1 passed); unmutated → 106 pass.
- src/env/sparrow.js: with the real rank names, the longest one, 'PIRATE CAPITAL', touched both stars on the rank plaque. The text width was capped at w-150 while the stars' inner edges sit at 78 px. The cap is now w-184, so the text shrinks slightly and clears the stars. Re-shot at tier 3 ('Pirate Capital') and tier 2 ('Harbour Town'); kraken-only, so tier 0 and today's town are unchanged.

**Exit check**

Re-run against the real island.js and people.js. The Stage 1 → 1b differences in this section are probe run-to-run figures, not code changes. Every item is met:
- Walk tests green: met. `node tests/walk.test.cjs` on the published tree: "All walk checks passed (106)", exit 0. That is 105 from Stage 1 plus 1 new island.js check.
- Every place reachable from the spawn: met. All 6 places (ship, shipyard, tailor, tavern, quiz, builder) are reached and can walk back. quiz takes a 10-point path, builder 2. All 7 decks and the middles of all 4 bridges are also reached from the spawn.
- Tier 0 (kraken on, nothing built) against today's 5 shipyard showcase poses and 6 fixed town views at 1280, plus 3 views at 390: met.
  - The 1b tier-0 shots are byte-identical to Stage 1's (11 of 11 at 1280).
  - Against today, 0.27–2.52% of pixels differ (show poses 0.27–0.60%; v4 2.52%; p_v4 2.22%).
  - The differences are only at the "Build me!" boards, the rank plaque under the welcome sign, and the two new places (bell/Barnacle, easel/Bess).
  - One more spot: the right-hand prize sloop's striped sail in show:-1. That is the harness's random stream, not the town, and the same diff appears in Stage 1's images.
  - Draw calls rise by +16 on the showcase and +3 to +11 on the town views, as in Stage 1.
- Bess and Barnacle ≥ 1 u from every walker path and villager loop: met. Bess is 1.12 u, Barnacle 1.60 u. Both are ≥ 2 u from bridge mouths, doorways and the gangplank. They cut off no spot (20,467 of 20,467 still reached) and narrow no deck below 1.6 u (0 of 24 stretches).
- All plots at tier 3 plus 8 villagers, town walk view at the 30 × 8 probe ≤ 450: met.
  - Real game, ?kraken=1, setVillagers(24) → 8 drawn, 50 people.
  - Over 240 samples: max 401, min 35, mean 188.4, 0 over 450.
  - Shipyard view: 304–311. No page errors.
- Rope-bridge squeeze-past / LOOK-2 probe with 8 villagers (real game, four Manors): met.
  - 240 of 240 crossings succeed on plazaS1, plazaYard, plazaGarden and tavernTower (both directions; key, stick and tap; 10 moments). Worst stall 0.4 s.
  - Porter check 10 of 10. 30 s of random input: worst stuck behind a person 0.67 s.
  - Sampled over 120 s: 0 villager stops on a bridge, in a place circle, in a doorway or at the gangplank.
  - LOOK-2: the captain moved 0; villagers stopped 1.00–1.02 u away. 0 page errors.
- Kraken false, env.walk and the town byte-for-byte today's: met.
  - env.walk equals HEAD's sparrow and the HEAD fixture byte for byte (16,066 bytes).
  - peopleCount 40 = 40; draw calls 291 = 291.
  - 11 views at 1280 shot in today's order, and 3 at 390, are byte-identical PNGs to today's.
  - Live game without the flag: setIsland → false, setVillagers → 0, setRank → false, today's 4 places, no errors.

**Verification**

All browser runs used NODE_PATH=/opt/node22/lib/node_modules, the SwiftShader args and tests/server.cjs. The machine load was 8–28 on 4 cores (other agents' suites). Scripts and results are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1b/.

Mirror and backups
- Dev mirror: /home/user/First-project/.dock-harness/kraken/1b/1N/ (dev/ = my copies; base/ = HEAD's sparrow; s1/ = Stage 1's published sparrow).
- Stage 1 backups in scratch: sparrow.stage1.js, walk.test.stage1.cjs, sparrow-walk.stage1.json.

Node checks
- plotdiff.cjs (island.js PLOTS vs §8.1, sparrow's platform() positions, PLOT_ART and the fixture's envelopes):
  - Numbers: 0 drift over 10 plots × 5 checks, plus RANKS[0], VILLAGER_CAP and the homes' villagers.
  - Record reading: 4 drifts (digit-string tier, 1e20, padded string, stored text).
- node tests/walk.test.cjs: 106 pass in dev and again on the published tree (exit 0). It printed Bess 1.12 u and Barnacle 1.60 u.
- Mutation runs: 5 island.js mutants with both the 1b test and the Stage 1 test; results as given in fixes.

Browser probes
- walkdump.cjs (harness):
  - kraken on: env.walk === the fixture (26,775 bytes), the same with every plot at tier 3 + 24 villagers and at tier 1 + 3 villagers without ship or prizes.
  - kraken off: dev env.walk === base === HEAD fixture (16,066 bytes); peopleCount 40/40; calls 291/291; no page errors.
- recprobe.cjs: 7 records. dev: the tiers shown equal island.js tierOf in 7 of 7, no throws. Stage 1 sparrow: 3 of 7 differ.
- bridgeprobe.cjs (1N's, real game from the dev mirror, ?kraken=1): 240/240 across, worst stall 0.4 s, porter 10/10, random 0.67 s, 0 bad stops, LOOK-2 moved 0, closest 1.00–1.02, errors [].
- drawprobe.cjs (1N's), TOWN_ONLY=1 ISLAND=3, ?quality=low&kraken=1: setIsland 262 ms; town 30 spots × 8 headings max 401 / min 35 / mean 188.4; shipyard 304–311; errors []. This ran before the plaque edit, which only changes a painted texture's font size.
- Tier-0 comparison (multishot.cjs + pdiff.py; 1N's jobs: 5 sway poses + 6 fixed views at 1280, 3 at 390):
  - k1 vs today: 0.27–2.52% of pixels (diff images in cmp/).
  - k1 is byte-identical to Stage 1's k1 shots (11 of 11).
- Kraken off: my first k0 run used a shortened view list, which shifts the clouds and gave sky-only pixel diffs (same calls and tris). Re-shot in today's order (cmpk0/): 11 of 11 byte-identical to today's 1280 shots, and 3 of 3 at 390 identical.
- live1b.cjs on the published file:
  - Real game ?kraken=1 at 1280 and 390 touch, island.js driving setIsland(parseIsland(text)), setVillagers(villagers) and setRank(rank): tiers shown '3121313213' = tierOf; 14 villagers → 8 drawn and 8 visible ashore; rank 'Harbour Town'; calls 149 / 99; errors [].
  - No flag: today's 4 places, people 40, calls 109, errors [].

Screenshots looked at
- look/w_t1_over, w_t1_plaque, w_t1_v1, w_t1_v2.
- Sheets: sheet_w_t1, sheet_p_t1, w_t3_over, w_t3_plaque, sheet_w_t3, sheet_p_t3, p_t1_plaque, plaque_crops, p_t3_plaque2.
- cmp/sheet_diff_a and cmp/diff_s-1; live/live_sheet.
- The tier 1 and tier 3 buildings, the villagers, the plaque ('VILLAGE', 'HARBOUR TOWN', 'PIRATE CAPITAL') and the caption with the real perks and plotState 'Now:' texts all read correctly. The plaque clash was the only defect found, and it is fixed.

Not run, as instructed: npm test and the browser suites (smoke, controls, audio, battle, levels, town).

**Open issues**

- Bess's painted island plan marks the ten plots with crosses placed by hand on a stylised map that is not to scale. They are decoration, not read from island.js x/z, and I left them as they are.
- The per-plot art, the Build-me board spots, the plot camera yaws and the home colours (buildPlot, BOARD, PLOT_VIEW, HOME_LOOK) are keyed by plot id. A plot that island.js adds or renames would get today's shack and a camera envelope, but no tier art until sparrow learns its id.
- 1N's deviation from §8.4 still stands: villagers within about 0.75 u of a rope bridge, or on the deck leading onto one, are left out of folk(). The bridge probe passes with it; dropping it still needs 1N's optional town.js hook (3D).
- The 390x844 plaque re-shoot (p_t3_plaque2) missed the plaque because my fixed harness camera points off it in portrait. The plaque fix is verified at 1280 for 'Pirate Capital' and 'Harbour Town', and 'Harbour Town' on it also shows in the live 1280 screenshot.
- My own base shots v3–v6 came from a restarted run, so their clouds are out of phase. The tier-0 diffs for v3–v6 were therefore measured against Stage 1's base shots, which come from the same HEAD sparrow and harness; my base s-1 and s0 shots match Stage 1's byte for byte.
- Not run, as instructed: npm test and the browser suites. The coordinator should run walk/town/smoke/controls on the published tree.

### 1O Ashore panels

I re-ran row 1O's checks against the real island.js, quiz.js and quizBank.js, not the mock. The exit check is met. The 11 build-panel checks that failed against the Stage 0 stub now pass, and so do all 72 keyboard and screen-reader checks at 4 sizes.

I wrote a new probe (api.cjs) that compares the panels with the real APIs. It found three mismatches, which I fixed in a dev copy and published with cp to a temp name + mv:
- **Build button with fractional or negative gold.** The panel said "Need 50.400000000000006 more gold" or "Need 140 more gold". island.js plotState floors the purse and treats negatives as 0, so it says "Need 51" and "Need 100".
- **Duplicated wording.** The build panel wrote its own button, Now and Next texts. It now uses plotState's label, now, next and affordable, so the panel says exactly what island.js says.
- **Greyed lifebuoy with no reason.** When quiz.js hint() returns null (only two answers left), the button was greyed but its tooltip still said "Takes away one wrong answer (H)". It now says "Only two answers left: no lifebuoy needed". This is the case 1E's open issue raised.

Only src/buildPanel.js and src/quizPanel.js changed. town.css is untouched. Nothing in the live game imports the two panels (only comments in index.html mention them), so with WITH_KRAKEN false the town is exactly as today. I did not commit, and I ran no npm test or browser suites.

Two harness notes:
- The 1N Stage 1b agent shares .dock-harness/kraken/1b/, and my first dev folder there was deleted. I moved my work into .dock-harness/kraken/1b/1O/ and the scratch folder build/1b/1O/.
- My harness copy now plays the build montage in 3D: ctx.celebrate calls sparrow's setIsland(cfg, { built: id }) and setRank, and skipCelebration calls env.finishBuild().

**Files:** src/buildPanel.js, src/quizPanel.js

**Fixes**

- src/buildPanel.js, stateOf(): the button label, Now, Next and affordable now come from island.js plotState, with the panel's own words only as a fallback for a missing field. Why: the panel built its own label from an unfloored purse, so it showed "Need 50.400000000000006 more gold" for 149.6 gold and "Need 140 more gold" for -40 gold, where plotState says 51 and 100. It also duplicated island.js's wording, which could drift later. The row's change check now includes label, now and next.
- src/buildPanel.js, purse(): counts whole gold, Math.max(0, Math.floor(p)), the same way plotState and build count it. This keeps the chest display and the "You need N more gold" announcement as whole numbers.
- src/buildPanel.js, api.rows.button: now reports the button's name (the .b-word text) instead of its full textContent, which included the aria-hidden ✓ and gave "✓Fully built". Test hook only; the visible markup is unchanged.
- src/quizPanel.js, renderBuoy(): with lifebuoys left but hint() returning null (two answers remain), the greyed button's title now says "Only two answers left: no lifebuoy needed" instead of "Takes away one wrong answer (H)". This gives the aria-disabled button the reason §15 asks for, and covers 1E's open issue.
- src/quizPanel.js, purse(): the chest shows whole gold, Math.max(0, Math.floor(p)).

**Exit check**

All met, re-run against the real island.js, quiz.js and quizBank.js.

**Layout (layout.cjs)**
- Sizes: the 7 town sizes (320x480, 360x640, 390x844, 844x390, 568x320, 1024x600, 1280x720) plus 360x480 and 640x360.
- 13 states each: the 11 from Stage 1 plus 2 new build states with the real labels:
  - build-amen-rich: amenities at tier 2 with 5000 gold, so the longest labels such as "Upgrade to Bakery & café — 800 gold".
  - build-poor: tier 2 with 7 gold.
- Results:
  - Dev copy, game fonts: "TOTAL FAILS 0 (9 sizes x 13 states, fonts game)".
  - Dev copy, fallback fonts: "TOTAL FAILS 0 (9 sizes x 13 states, fonts fallback)".
  - Published files, game fonts: "TOTAL FAILS 0 (9 sizes x 13 states, fonts game)".
- Each measure, met:
  - No page scroll: 0 failures.
  - Every visible button ≥ 44 px: smallest 44.
  - Answers ≥ 56 px: smallest 56.
  - Contrast ≥ 4.5:1 for small text: lowest 5.13 (build-refused at 320x480 and 360x640), then 5.23. The overall minimum of 3.44 is the red panel title, which is ≥ 19 px Luckiest Guy and so large text (3:1 rule).

**Keyboard only and screen-reader texts (kbd.cjs)**
- Dev copy: 72 passed, 0 failed at each of 1280x720, 390x844, 568x320 and 1024x600.
- Published files: 72/0 at 1280x720 (before the fixes) and at 390x844 (after publishing).
- The 11 build checks that failed against the stub now pass, including:
  - "Build Cottage — 100 gold", described by Tavern Row | Tier 0 of 3 | Now: a little shack | Next: Cottage · 2 villagers.
  - A held Enter builds once (420 → 320 gold, tier 1).
  - #build-live says "Cottage built at Tavern Row. 2 villagers moved in."
  - "Need 430 more gold" with aria-disabled and focus kept.
  - A double click builds once; the header reads "Villagers 6 · Hamlet".
  - Storage refused costs nothing.
  - The 30th tier gives "Pirate Capital" and the Governor's coat note.

**Touch (taps.cjs, 390x844)**
- 7 passed, 0 failed, 1 SKIP. The skip is the island double tap: under load the two taps landed 2066 ms apart, so they were two separate taps.

**Verification**

All probes ran from /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/1b/1O/ with NODE_PATH=/opt/node22/lib/node_modules, Playwright chromium with SwiftShader, and tests/server.cjs. They drive the harness /home/user/First-project/.dock-harness/kraken/1b/1O/panels.html, a copy of 1O's harness that loads the real island.js, quiz.js and quizBank.js through symlinks and the repo's sparrow.js. Logs are in the same folder.

**Before the fixes (published files, ?src=repo&css=repo)**
- kbd.cjs 1280x720: 72 passed, 0 failed (kbd-repo-1280x720.log). The stub's 11 build failures are gone.
- api.cjs (new probe): 17 passed, 4 failed (api-repo.log).
  - Label mismatches with fractional or negative purses.
  - Maxed rows read "✓Fully built" (test hook).
  - The greyed lifebuoy's title gave no reason.
  - Console 404s, a harness artifact: the other agent had removed the folder.

**After the fixes, dev copy**
- api.cjs: 21 passed, 0 failed (api-dev.log). It checks:
  - 480 rows (every plot at tiers 0–3 × 12 purses, including 149.6, -40, NaN, Infinity and '500'): button, Now, Next, state, aria-disabled and tier all equal plotState.
  - The header and next-rank note follow rank() and villagers() for 0..30 tiers built.
  - Building all 30 tiers through the panel costs exactly 11,800 and reaches Pirate Capital; totals() gives 3400 / 8400 / 11800.
  - main's 'poor' reason passes through.
  - The perk sentences for every amenity tier match PLOTS.
  - perks().hints gives 0–3 lifebuoys for Sea School tiers 0–3.
  - All 9 islands give 5 questions, one per category, with 3 or 4 answers.
  - hint() leaves exactly 2 answers on 3- and 4-answer islands.
  - Sums have digit-string answers.
  - All 27 stars through the panel pay exactly 2700 and then 0 on replays.
  - Owed gold (240) is paid once on open with tried unchanged.
- kbd.cjs: 72/0 at each of 1280x720, 390x844, 568x320 and 1024x600.
- layout.cjs: 0 failures with game fonts and 0 with fallback fonts (9 sizes x 13 states).
- taps.cjs: 7 passed, 0 failed, 1 SKIP (load).

**After publishing (cmp: the repo files are byte-identical to the dev copy)**
- api.cjs repo: 21 passed, 0 failed.
- kbd.cjs repo 390x844: 72/0.
- layout.cjs repo, game fonts: TOTAL FAILS 0.

**Other checks**
- node --check passes on both files, and both import cleanly in Node.
- node tests/island.test.cjs: "All island checks passed (52)". node tests/quiz.test.cjs: "All quiz checks passed (85)".
- grep: only comments in index.html mention quizPanel or buildPanel; no code imports them. town.css is byte-identical to the Stage 1 publish.

**Screenshots (looked at every one)**
- 18 shots at 1280x720 and 390x844, with the 3D town behind: quiz question, right, wrong, results; build affordable, poor, maxed, montage at 1.1 s, spring at 1.75 s.
- The first results and right-answer shots caught animations mid-way: the chest still read 500 and the stars and fact were not shown yet. landing.cjs showed that at load average about 26, with the WebGL scene running, the coin takes 8.7–11 s to land, for both the published files and the dev copy (1.8 s without the scene). So this is machine load, not a regression.
- I re-took those four shots with a 12 s wait. They show 655 gold, two stamped stars and the full fun-fact card.
- Draw calls behind the panels: quiz 62 (1280) / 34 (390); build views 30–51. The panels themselves add 0.

**Hook requests**

- src/townMode.js (2B), the build panel ctx: celebrate(id, tier) should call env.setIsland(island.state(), { built: id }) and env.setRank(island.js rank(island.state()).name), then return the montage length in seconds. skipCelebration() should call env.finishBuild(). Why: in the 1b harness this wiring plays sparrow's montage correctly (scaffold at 1.1 s, the Townhouse springing up at 1.75 s; screenshots b1-bmontage and b1-bspring). Without it the panel finishes building but the 3D town never changes.
- src/townMode.js / src/town.js (2B), focusPlot(id) in portrait: frame env.plotPose(id) beside the bottom sheet. Why: the raw plotPose camera still shows a roof close-up at 390x844 (b1-bafford-390x844.png, b1-bmaxed-390x844.png), as 1O reported. The panel itself is correct.

**Open issues**

- Carried over from 1O, unchanged:
- On short and portrait panels the fun fact scrolls into view after an answer, so the 'Question n of 5' line scrolls out (b1-qright-390x844).
- Some amenity rows are taller than the list at 568x320 and 360x480 and need a scroll.
- In portrait, the camera pose for a plot is a roof close-up until 2B's frameBeside handles the bottom sheet (hook request).
- At load average about 26, with the WebGL scene running, the results coin takes 8–11 s to land in the chest, for both the published files and the dev copy (1.8 s without the 3D). The stamped stars can also lag. This is machine load, but suites that read the chest text right after a round should wait for it (ctx gold is updated at once).
- The build panel keeps its own perk sentences for #build-live announcements ("Your crew patches 55% of the hull.") because island.js gives only the short Now/Next words. If 3B retunes a perk value, the sentences follow PLOTS automatically. If 3B rewords PERK_WORDS in island.js, the button and the Now/Next rows follow, but the announcement sentences are the panel's own.
- The 1N Stage 1b agent shares .dock-harness/kraken/1b/, and my first dev folder there was removed while I was working. My work is in .dock-harness/kraken/1b/1O/ and the scratch folder build/1b/1O/. The coordinator should keep the rows in separate subfolders.
- I ran no npm test or browser suites (the coordinator runs them). Nothing in the live game imports the two panels and town.css is unchanged, so the live game is unaffected.

## Final verification (coordinator)

`npm test` on the finished Stage 1 + 1b tree, started 2026-10-21 20:54:40 UTC, after the last code change (src/env/sparrow.js and tests/walk.test.cjs at 20:27:51). It ran the 19 suites (the 13 Node suites now include specials, mechanics3, kraken, island, quiz and settings): 1,858 checks passed, 0 failed, exit 0.

| Suite | Result |
|---|---|
| combat | 107 |
| specials | 110 |
| armory | 35 |
| cosmetics | 83 |
| walk | 106 |
| mechanics | 121 |
| mechanics3 | 162 |
| kraken | 154 |
| island | 52 |
| quiz | 85 |
| settings | 16 |
| upgrades | 52 |
| server | all passed |
| smoke | all passed |
| controls | all passed |
| audio | all passed |
| battle | 182 |
| levels | 73 |
| town | 130 |

The live game (no `?kraken=1`) is unchanged: every existing browser suite passes with no test edits.
