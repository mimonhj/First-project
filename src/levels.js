// The voyage's levels (SPEC2 §6.1). Act I lives here; Act II (levels 4–6) lives in act2.js.
//
// Each level: its environment module, enemy waves (the next wave sails in once `nextWaveAt` or fewer
// ships of the current one are left) and difficulty knobs.
//   env                         environment module (src/env/*.js)
//   difficulty, act, stars      level-card label, card group, skull pips
//   scene                       audio scene (audio.setScene ignores names it doesn't know)
//   waves, nextWaveAt           enemy waves
//   maxAttackers                pirates allowed to attack at once
//   lead                        how well enemy gunners lead your motion (0..1)
//   spreadMul                   enemy aim error multiplier
//   grace                       seconds after the fly-in before enemies may open fire
//   bonus                       gold for clearing the level
//   mechanic                    intro banner subtitle (optional: the env's own subtitle otherwise)
//   enemyRake                   how much enemy rakes count on this level (SPEC2 §2.1)
//   mechanics                   ids into src/mechanics.js
//   bombs                       optional: { kind: 'lava' | 'lightning', every: [a, b], spread, radius?, damage?, warn? }
//   finale, finaleText          optional: beating this level wins the voyage (the Victory screen)
//   rumour, lockText            optional: the tavern's rumour board, the locked card's text
import * as europe from './env/europe.js';
import * as bali from './env/bali.js';
import * as volcano from './env/volcano.js';
import { ACT2_LEVELS } from './act2.js';

export const ACT1 = [
  {
    env: europe,
    difficulty: 'Easy',
    act: 1,
    stars: 1,
    scene: 'europe',
    waves: [['cutter', 'cutter'], ['privateer', 'cutter']],
    nextWaveAt: 0,
    maxAttackers: 2,
    lead: 0.3,
    spreadMul: 1.5,
    grace: 5,
    bonus: 100,
    enemyRake: 0.4,
    mechanics: [],
    rumour: {
      title: 'Coast of Europe',
      lines: ['Corsair cutters prowl the bay below the lighthouse.', 'Turn side-on: your cannons fire sideways!'],
      ammo: null,
    },
  },
  {
    env: bali,
    difficulty: 'Medium',
    act: 1,
    stars: 2,
    scene: 'bali',
    waves: [['prahu', 'prahu', 'prahu'], ['junk', 'junk', 'prahu']],
    nextWaveAt: 1,
    maxAttackers: 2,
    lead: 0.55,
    spreadMul: 1.0,
    grace: 4,
    mechanic: 'Light coral slows you down. Prahus sail right over it!',
    bonus: 200,
    enemyRake: 0.6,
    mechanics: [],
    rumour: {
      title: 'Bali Islands',
      lines: ['Prahus skim right over the light coral. Your keel cannot!', 'Chain shot slows the fast ones down.'],
      ammo: 'chain',
    },
  },
  {
    env: volcano,
    difficulty: 'Hard',
    act: 1,
    stars: 3,
    scene: 'volcano',
    waves: [['corsair', 'corsair', 'manowar'], ['inferno']],
    nextWaveAt: 0,
    maxAttackers: 2,
    lead: 0.6,
    spreadMul: 1.0,
    grace: 3,
    bombs: { kind: 'lava', every: [4.5, 7.5], spread: 9 }, // lava bombs from the volcano
    mechanic: 'Lava bombs! Steer out of the red circles.',
    bonus: 400,
    enemyRake: 0.8,
    mechanics: [],
    rumour: {
      title: 'The Volcano',
      lines: ['The Molten Maw is too hot to board: sink her!', 'Grape shot thins a corsair crew for a capture.'],
      ammo: 'grape',
    },
    finale: true,
    finaleText:
      'The Molten Maw is sunk and every pirate fleet of the Old World is at the bottom of the sea. But sailors whisper of the Far Seas…',
  },
];

// Act II (The Far Seas) sails with every voyage: beating the Molten Maw opens Doubloon Bay (SPEC2 §6.1).
export const WITH_ACT2 = true;

export const LEVELS = WITH_ACT2 ? [...ACT1, ...ACT2_LEVELS] : ACT1;
