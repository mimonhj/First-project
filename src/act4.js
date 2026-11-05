// Voyage IV: The Sunset Isles (SPEC4 §2.3–2.5): Misty Mangroves, The Sunken Spires and Shellback Shoals.
// Same level format as act3.js (SPEC3 §5.1) plus SPEC4 §2.1's optional fields:
//   pool                        the waves to draw, one entry per wave: { budget, slots, must, from, attackers? }
//                               (pools.js, §3.5); `waves` stays as the fallback draw, drawWaves(level, pool,
//                               poolSeed(level, 0)), for code and tests that read def.waves (main plays
//                               levelWaves(), which is state.waves on a pool level)
//   mechanics                   ids of mechanics.js, mechanics3.js and mechanics4.js (MECHANIC4_IDS: fog, currents,
//                               tide); main gives the list to all three factories and each keeps the ids it knows
//   boss: 'shellback'           level 12: the Shellback wakes once the last wave falls (§3.6)
//   rumour.foes                 the kinds the tavern's rumour board shows as named icons
// voyage.js appends these levels to the voyage (WITH_V4).
//
// STAGE 0 SCAFFOLD: three placeholder levels, each a stub sea with one Corsair Cutter and no pool, so the voyage of
// twelve can be played through behind ?v4=1. Stage 1 (1B) writes the levels.
import * as mangroves from './env/mangroves.js';
import * as spires from './env/spires.js';
import * as shoals from './env/shoals.js';
import { drawWaves, poolSeed } from './pools.js';

const placeholder = (level, env, difficulty, scene, bonus, extra = {}) => ({
  env,
  difficulty,
  act: 4,
  stars: level,
  scene,
  // (the fallback draw: the stub pool's one cutter)
  waves: drawWaves(level, null, poolSeed(level, 0)),
  pool: null,
  nextWaveAt: 0,
  maxAttackers: 2,
  lead: 0.6,
  spreadMul: 1,
  grace: 3,
  enemyRake: 1,
  mechanics: [],
  bonus,
  ...extra,
});

export const ACT4_LEVELS = [
  placeholder(10, mangroves, 'Heroic', 'mangroves', 1800, { lockText: 'Drive off the Kraken' }),
  placeholder(11, spires, 'Epic', 'spires', 2100),
  placeholder(12, shoals, 'Ultimate', 'shoals', 3000, {
    finale: true,
    finaleText: 'The Shellback scuttles off to sleep, and the Sunset Isles are free! You are the Admiral of the Twelve Seas!',
    victoryLine: 'The Twelve Seas are yours',
  }),
];

/** Added to the Kraken's Deep's Victory text once the Sunset Isles follow it (§2.2). */
export const ACT4_TEASER = '…but on the sunset horizon, an island is snoring.';
