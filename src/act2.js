// Act II: The Far Seas (SPEC2 §6.4–6.6): Doubloon Bay, Frostbite Straits and The Maelstrom.
// Same level format as ACT1 in levels.js (see the field list there); levels.js appends these to the
// voyage. Each level brings one new twist, run by its `mechanics` ids (src/mechanics.js):
//   4 Doubloon Bay       'convoy'   treasure galleons run for the escape gates: catch them and board them
//   5 Frostbite Straits  'floes'    drifting ice floes, and longship raiders that board YOU
//   6 The Maelstrom      'current'  a whirlpool drags every ship in; the Phantom Galleon must be boarded
// mechanicTouch: the intro subtitle on touch layouts, when the keyboard wording names a key.
import * as doubloon from './env/doubloon.js';
import * as frost from './env/frost.js';
import * as maelstrom from './env/maelstrom.js';

export const ACT2_LEVELS = [
  {
    env: doubloon,
    difficulty: 'Tricky',
    act: 2,
    stars: 4,
    scene: 'doubloon',
    waves: [['galleon', 'cutter', 'cutter'], ['galleon', 'privateer', 'corsair']],
    nextWaveAt: 1,
    maxAttackers: 2,
    lead: 0.6,
    spreadMul: 1.0,
    grace: 4,
    mechanic: 'Treasure galleons are running for the open sea! Catch them, thin their crews and board them for a fortune.',
    bonus: 500,
    enemyRake: 1,
    mechanics: ['convoy'],
    rumour: {
      title: 'Doubloon Bay',
      lines: ['The treasure fleet sails at dusk.', 'Sink a galleon and her gold sinks too: board her instead!'],
      ammo: 'chain',
    },
    lockText: 'Beat the Molten Maw',
  },
  {
    env: frost,
    difficulty: 'Tough',
    act: 2,
    stars: 5,
    scene: 'frost',
    waves: [['raider', 'raider', 'privateer'], ['raider', 'raider', 'manowar']],
    nextWaveAt: 1,
    maxAttackers: 3,
    lead: 0.65,
    spreadMul: 0.95,
    grace: 3,
    mechanic: 'Longship raiders board YOU! Press G three times (or hold it) to cut their ropes.',
    mechanicTouch: 'Longship raiders board YOU! Tap CUT! three times or hold it.',
    bonus: 700,
    enemyRake: 1,
    mechanics: ['floes'],
    rumour: {
      title: 'Frostbite Straits',
      lines: ['Raiders with horned helmets row out of the fog.', 'Chain shot slows their longships; cut their ropes fast!'],
      ammo: 'chain',
    },
  },
  {
    env: maelstrom,
    difficulty: 'Legendary',
    act: 2,
    stars: 6,
    scene: 'maelstrom',
    waves: [['corsair', 'raider', 'corsair'], ['phantom', 'raider']],
    nextWaveAt: 0,
    maxAttackers: 2,
    lead: 0.7,
    spreadMul: 0.9,
    grace: 3,
    // Lightning: no projectile, a warning ring for `warn` s, then a bolt (env.flash) at the spot.
    bombs: { kind: 'lightning', every: [5, 8], spread: 8, radius: 5, damage: 14, warn: [1.4, 1.6] },
    mechanic: "The maelstrom pulls you in! Scatter the Phantom's ghost crew with grape shot, then board her.",
    bonus: 1000,
    enemyRake: 1,
    mechanics: ['current'],
    finale: true,
    finaleText: 'The Phantom Galleon is yours! You are the Legend of the Seven Seas.',
    rumour: {
      title: 'The Maelstrom',
      lines: ['A ghost ship sails where the sea swallows itself.', "Round shot barely scratches her. Grape and cutlasses don't!"],
      ammo: 'grape',
    },
  },
];
