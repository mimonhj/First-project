# "Boarders Away!" update: build plan

The design and build plan for the next Pirates Ahoy! update: reeling enemy ships in and boarding them,
damage that depends on where and how you hit, three new seas (Act II), and Sparrow's Floating Island as
a town you walk as the captain, with a wardrobe for you and your crew.

| File | What it is |
|---|---|
| `SPEC2.md` | The final build spec: combat, crew and boarding, tavern upgrades, battle UI, levels, the walkable town, persistence, module APIs, the staged plan (section 10), tests, budgets, accessibility, cut list. Where it and anything else disagree, it wins. |
| `SHIPYARD-SPEC.md` | The earlier shipyard contract that SPEC2 builds on (still holds unless SPEC2 changes it). |
| `stage0.js`, `stage1.js`, `stage2.js` | The multi-agent build scripts for each stage. They name files by the paths of the session that wrote them. |
| `stage1-reports.md` | What Stage 0 and Stage 1 delivered: deviations from SPEC2, open issues, and the hook requests (changes asked of files owned by later stages). |
| `stage2-reports.md` | The same for Stage 2, including the exact main.js wiring the town needs in Stage 3. |
| `stage2-fix-reports.md` | The fixes for the 23 problems the Stage 2 review confirmed, and their regression checks. |

## Progress

- Stage 0 (scaffolding, no behaviour change): done.
- Stage 1 (foundation modules: combat rules, tavern and wardrobe records, Act II rules, tags/pops/overboard,
  sounds, characters, new ships, the three new seas, the town's walk data): done.
- Stage 2 (battle wiring, the boarding set-piece, the town controller and panels, battle tests, and the
  player's request to leave a battle from the pause menu): done.
- Stage 3 (Act II live, the town wired into the game) and Stage 4 (verification, README): to do.

Until Stage 3, Act II is opt-in with `?act2=1` in the address.
