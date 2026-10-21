// Voyage III: The Kraken Seas (SPEC3 §5.4–5.6): The Turtle Atolls, The Cape of Storms and The Kraken's Deep.
// Same level format as ACT1 in levels.js (see the field list there) plus SPEC3 §5.1's optional fields:
//   crates                      powder crates on the level (count, at env.crateSpots)
//   kraken                      true: the Kraken rises once the Inkheart falls (level 9)
//   sailOn, victoryLine         the Victory screen's sail-on button and the banner's small line
//   rumour.ammo                 may also be 'fire' | 'frost' | 'stink'
// `mechanics` mixes ids of mechanics.js (MECHANIC_IDS) and mechanics3.js (MECHANIC3_IDS); main gives the list to
// both factories and each keeps the ids it knows. Each level brings its own twist:
//   7 The Turtle Atolls     'spouts'    waterspouts ride their loops round the lagoon; Shark Raiders ram (a type
//                                       behaviour: it needs no id), a Bomb Ketch lobs shells in the second wave
//   8 The Cape of Storms    'rogue'     rogue waves roll in from the open sea; Iron Turtles shrug off broadsides,
//                                       fire ships sail at you (the two rammers never share a level)
//   9 The Kraken's Deep     'flagship'  sea geysers (def.bombs); Squid Skiffs board you; when the Inkheart falls
//                                       her crew flee and the Kraken rises (kraken: true), the finale
// Waves stay at ≤ 3 ships and nextWaveAt keeps ≤ 4 afloat at once (SPEC3 §5.9: no draw-call room for more).
// voyage.js appends these levels to the voyage (behind ?kraken=1 until the Kraken Seas go live). The numbers are
// SPEC3's starting values; Stage 3 tunes them with the bots (§5.9 order) and records any change in SPEC3 §19.
import * as atolls from './env/atolls.js';
import * as cape from './env/cape.js';
import * as deep from './env/deep.js';

export const ACT3_LEVELS = [
  {
    env: atolls,
    difficulty: 'Daring',
    act: 3,
    stars: 7,
    scene: 'atolls',
    waves: [['shark', 'shark', 'corsair'], ['bombketch', 'shark', 'privateer']],
    nextWaveAt: 1,
    maxAttackers: 2,
    lead: 0.65,
    spreadMul: 0.95,
    grace: 4,
    mechanic: 'Waterspouts! Keep clear of the twisters. Shark Raiders ram: turn away when they charge!',
    bonus: 1300,
    enemyRake: 1,
    mechanics: ['spouts'],
    crates: 2,
    rumour: {
      title: 'The Turtle Atolls',
      lines: ['Shark Raiders charge bow first. Turn aside!', 'Frost shot takes the bite out of a charging shark.'],
      ammo: 'frost',
    },
    lockText: 'Beat the Phantom Galleon',
  },
  {
    env: cape,
    difficulty: 'Fearsome',
    act: 3,
    stars: 8,
    scene: 'cape',
    waves: [['ironclad', 'bombketch', 'corsair'], ['fireship', 'ironclad', 'fireship']],
    nextWaveAt: 1,
    maxAttackers: 3,
    lead: 0.7,
    spreadMul: 0.9,
    grace: 3,
    mechanic: 'Rogue waves! Turn your bow or stern to them. Iron Turtles: hit their bow or stern!',
    bonus: 1600,
    enemyRake: 1,
    mechanics: ['rogue'],
    crates: 2,
    rumour: {
      title: 'The Cape of Storms',
      lines: ['Iron Turtles shrug off a broadside. Rake them, or set them alight!', 'Freeze a fire ship and she gives up.'],
      ammo: 'fire',
    },
  },
  {
    env: deep,
    difficulty: 'Mythic',
    act: 3,
    stars: 9,
    scene: 'deep',
    waves: [['skiff', 'skiff', 'ironclad'], ['inkheart', 'skiff']],
    nextWaveAt: 0,
    maxAttackers: 3,
    lead: 0.7,
    spreadMul: 0.9,
    grace: 3,
    // Sea geysers: no projectile, a ring of bubbles for `warn` s, then a white water column (main's launchBomb).
    // They stop for good when the Inkheart falls.
    bombs: { kind: 'geyser', every: [6, 9], spread: 8, radius: 4.5, damage: 10, warn: [1.8, 2.2] },
    mechanic: 'The Kraken Crew guards the Deep. Beat their flagship… if you dare!',
    bonus: 2500,
    enemyRake: 1,
    mechanics: ['flagship'],
    kraken: true,
    crates: 2,
    finale: true,
    finaleText: 'The Kraken is driven back to the deep, and the Seven Seas are safe! You are the Kraken Tamer!',
    victoryLine: 'The seas are yours',
    rumour: {
      title: "The Kraken's Deep",
      lines: ["The Inkheart flies the Kraken Crew's flag.", 'If the Kraken grabs you, stink shot makes it let go!'],
      ammo: 'stink',
    },
  },
];

/** Added to the Maelstrom's Victory text once the Kraken Seas sail with the voyage (§5.2). */
export const ACT3_TEASER = '…but far to the south, something stirs in the deep.';
