# "The Kraken Seas" update: build plan

The player's request: more levels and customisation (better steering; freezing, burning and stink ammo),
new enemy ships, more natural disasters, the Kraken hunting you in the last level after you beat the Kraken
Crew's ship, quiz levels ashore, and building up the island with villagers, houses and amenities.

| File | What it is |
|---|---|
| `SPEC3.md` | The final build spec: special ammo, steering, new enemies, Voyage III (levels 7-9) and its hazards, the Kraken hunt, the quiz, building the island, economy, saves, architecture, the staged build plan (section 12), tests, budgets, accessibility, cut list, and the defaults the player can change (section 18). Checked by a critic before building (section 19, "Spec check"). |
| `design-arcade.md`, `design-depth.md`, `design-spectacle.md` | The three competing designs; three judges chose the arcade one as the base, with grafts from the others (SPEC3 appendix B). |
| `design3.js` | The design workflow script. |

## Progress

- Design and spec check: done.
- Stage 0 (scaffolding, no behaviour change) to Stage 4 (review, README): to do. Voyage III and the new town
  features stay behind `?kraken=1` until Stage 3.
