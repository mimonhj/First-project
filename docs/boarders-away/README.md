# "Boarders Away!" update: build plan

The design and build plan for the next Pirates Ahoy! update: reeling enemy ships in and boarding them,
damage that depends on where and how you hit, three new seas (Act II), and Sparrow's Floating Island as
a town you walk as the captain, with a wardrobe for you and your crew.

| File | What it is |
|---|---|
| `SPEC2.md` | The final build spec: combat, crew and boarding, tavern upgrades, battle UI, levels, the walkable town, persistence, module APIs, the staged plan (section 10), tests, budgets, accessibility, cut list. Updated in Stage 4 to match the finished game: **Built:** notes in each section, and section 17 lists every decision and deviation. Where it and anything else disagree, it wins. |
| `SHIPYARD-SPEC.md` | The earlier shipyard contract that SPEC2 builds on (still holds unless SPEC2 changes it). |
| `stage0.js` … `stage3.js` | The multi-agent build scripts for each stage. They name files by the paths of the session that wrote them. |
| `stage1-reports.md` | What Stage 0 and Stage 1 delivered: deviations from SPEC2, open issues, and the hook requests (changes asked of files owned by later stages). |
| `stage2-reports.md` | The same for Stage 2, including the exact main.js wiring the town needs in Stage 3. |
| `stage2-fix-reports.md` | The fixes for the 23 problems the Stage 2 review confirmed, and their regression checks. |
| `stage4-fix-reports.md` | The fixes for the 24 problems the final review confirmed, their regression checks, and the README/SPEC2 update. |
| `stage3-reports.md` | What Stage 3 delivered: Act II balance (bot results), the town wiring and polish, art fixes, the level and town suites, and what is left for Stage 4. |

## Progress

- Stage 0 (scaffolding, no behaviour change): done.
- Stage 1 (foundation modules: combat rules, tavern and wardrobe records, Act II rules, tags/pops/overboard,
  sounds, characters, new ships, the three new seas, the town's walk data): done.
- Stage 2 (battle wiring, the boarding set-piece, the town controller and panels, battle tests, and the
  player's request to leave a battle from the pause menu): done.
- Stage 3 (Act II live for everyone, the town wired into the shipyard, polish, the level and town suites): done.
- Stage 4 (review, verification, README): done.

Stage 4 reviewed the whole update in five areas (the town, progress across the voyage, accessibility, robustness and
performance, and the look), and an independent verifier reproduced each finding on a copy of the Stage 3 commit: 24
were confirmed. Two fix agents with separate files fixed 20 of them in code: in town, E always goes in at a door,
held Enter or Space no longer carries into the next screen or buys twice, the captain crosses rope bridges with a
key held, the townsfolk wait for him, and the camera keeps over the market awnings; in battle and on the title, no
camera shake under reduced motion, locked level cards that keyboard and screen-reader users can reach, progress that
another tab can never re-lock, the boarding sails no longer turning black, the Phantom's "BOARD HER!" instruction
kept whole on phones, and three slow paths made fast (tavern purchases, the first Go ashore, crew clicks at
Polly's). Two findings became decisions instead of code: the difficulty order is promised within each act (ACT-2),
and the level-start draw-call budget is for the stock ship (DRAW-1). A third, the wave-arrival stutter (PERF-4), was
accepted as it was before the update. The last one (TEST-1, a wardrobe check that only passed because frames were
slow) went to a test agent, together with updating the suites for the changed behaviour and adding regression checks
for the fixes; its results are reported separately. The top-level README now covers both voyages, the new battle
rules, the town, the controls, the saves and all 13 test suites, and SPEC2.md records what was built.
