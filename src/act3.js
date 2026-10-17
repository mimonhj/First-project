// Voyage III: The Kraken Seas (SPEC3 §5): The Turtle Atolls, The Cape of Storms and The Kraken's Deep.
// Same level format as ACT1 in levels.js (see the field list there) plus SPEC3 §5.1's optional fields:
//   crates                      powder crates on the level (count, at env.crateSpots)
//   kraken                      true: the Kraken rises once the Inkheart falls (level 9)
//   sailOn, victoryLine         the Victory screen's sail-on button and the banner's small line
//   rumour.ammo                 may also be 'fire' | 'frost' | 'stink'
// `mechanics` mixes ids of mechanics.js (MECHANIC_IDS) and mechanics3.js (MECHANIC3_IDS); main splits them.
// voyage.js appends these levels to the voyage (behind ?kraken=1 until the Kraken Seas go live).
//
// STAGE 0 SCAFFOLD: three placeholder levels on the stub seas, one cutter each. Stage 1B writes the real
// definitions (§5.4–5.6).
import * as atolls from './env/atolls.js';
import * as cape from './env/cape.js';
import * as deep from './env/deep.js';

// (each level gets its own copy: nothing is shared between the definitions)
const placeholder = () => ({ nextWaveAt: 0, maxAttackers: 2, lead: 0.6, spreadMul: 1, grace: 3, enemyRake: 1, mechanics: [], waves: [['cutter']] });

export const ACT3_LEVELS = [
  {
    env: atolls,
    difficulty: 'Daring',
    act: 3,
    stars: 7,
    scene: 'atolls',
    ...placeholder(),
    bonus: 1300,
    lockText: 'Beat the Phantom Galleon',
  },
  {
    env: cape,
    difficulty: 'Fearsome',
    act: 3,
    stars: 8,
    scene: 'cape',
    ...placeholder(),
    bonus: 1600,
  },
  {
    env: deep,
    difficulty: 'Mythic',
    act: 3,
    stars: 9,
    scene: 'deep',
    ...placeholder(),
    bonus: 2500,
    finale: true,
    finaleText: 'The Kraken is driven back to the deep, and the Seven Seas are safe! You are the Kraken Tamer!',
  },
];

/** Added to the Maelstrom's Victory text once the Kraken Seas sail with the voyage (§5.2). */
export const ACT3_TEASER = '…but far to the south, something stirs in the deep.';
