// Voyage IV: The Sunset Isles (SPEC4 §2.3–2.5): Misty Mangroves, The Sunken Spires and Shellback Shoals.
// Same level format as act3.js (SPEC3 §5.1) plus SPEC4 §2.1's optional fields:
//   pool                        the waves to draw, one entry per wave: { budget, slots, must, from, attackers? }
//                               (§3.5; the table lives in pools.js as POOLS, one home for its numbers): a wave starts
//                               from its `must` (the kind it introduces), then picks by weight among `from` within its
//                               budget and slots; `attackers` raises that wave's maxAttackers. Level 12's wave 2 has
//                               no fixed must (`must: null, lacked: true`: one Voyage IV kind that wave 1 lacked).
//                               `waves` stays as the fallback draw, drawWaves(level, pool, poolSeed(level, 0)), for
//                               code and tests that read def.waves (main plays levelWaves(), which is state.waves on
//                               a pool level)
//   mechanics                   ids of mechanics.js, mechanics3.js and mechanics4.js (MECHANIC4_IDS: fog, currents,
//                               tide); main gives the list to all three factories and each keeps the ids it knows
//   boss: 'shellback'           level 12: the Shellback wakes once the last wave falls (§3.6)
//   rumour.foes                 the kinds the tavern's rumour board shows as named icons (unmet ones as "?")
// Each level brings its own twist:
//   10 Misty Mangroves     'fog'       fog banks hide ships; Monkey Jollyboats, the Sting Sloop and the Net Sloop
//   11 The Sunken Spires   'currents'  coral currents push you along; Puffer Mines, the Coral Witch, Old Coilback
//   12 Shellback Shoals    'tide'      the ebb tide shows sandbars; Rock Forts; then the island wakes (the finale)
// Waves stay at ≤ 3 slots and nextWaveAt keeps ≤ 4 slots alive at once (§3.5; a pack, a patch, a Witch with her
// summons: one slot each). voyage.js appends these levels to the voyage (WITH_V4). The numbers are SPEC4's starting
// values; Stage 3 tunes them with bot v4 (§2.8 order) and records every change in SPEC4 §19.
import * as mangroves from './env/mangroves.js';
import * as spires from './env/spires.js';
import * as shoals from './env/shoals.js';
// (a namespace import: a pools.js without POOLS still links, and its levels then play the fallback draw)
import * as pools from './pools.js';

// A pool level: its pool (pools.js POOLS, §3.5's table) and the fallback waves drawn from it with plays 0.
function pooled(level) {
  const pool = (pools.POOLS && pools.POOLS[level]) || null;
  return { pool, waves: pools.drawWaves(level, pool, pools.poolSeed(level, 0)) };
}

export const ACT4_LEVELS = [
  {
    env: mangroves,
    difficulty: 'Heroic',
    act: 4,
    stars: 10,
    scene: 'mangroves',
    ...pooled(10),
    nextWaveAt: 1,
    maxAttackers: 2,
    lead: 0.7,
    spreadMul: 0.9,
    grace: 4,
    mechanic: 'Fog banks hide ships! Monkey Jollyboats throw coconuts: steer out of the brown circles!',
    bonus: 1800,
    enemyRake: 1,
    mechanics: ['fog'],
    crates: 2,
    rumour: {
      title: 'Misty Mangroves',
      lines: ['Monkeys in little boats! Grape shot tips them over.', 'A Sting Sloop hides behind you. Turn, or chain shot her!'],
      ammo: 'grape',
      foes: ['jolly', 'stinger', 'netsloop'],
    },
    lockText: 'Drive off the Kraken',
  },
  {
    env: spires,
    difficulty: 'Epic',
    act: 4,
    stars: 11,
    scene: 'spires',
    ...pooled(11),
    nextWaveAt: 1,
    maxAttackers: 2,
    lead: 0.7,
    spreadMul: 0.9,
    grace: 3,
    mechanic: 'Coral currents push you along! Puffer Mines puff when you get close: pop them from far away.',
    bonus: 2100,
    enemyRake: 1,
    mechanics: ['currents'],
    crates: 2,
    rumour: {
      title: 'The Sunken Spires',
      lines: ['The Coral Witch calls puffers. Sink her first!', 'Old Coilback gets dizzy after it lunges. Hit its head!'],
      ammo: 'stink',
      foes: ['puffer', 'witch', 'coilback'],
    },
  },
  {
    env: shoals,
    difficulty: 'Ultimate',
    act: 4,
    stars: 12,
    scene: 'shoals',
    ...pooled(12),
    nextWaveAt: 0,
    maxAttackers: 3,
    lead: 0.72,
    spreadMul: 0.88,
    grace: 3,
    mechanic: 'Rock Forts fire along their red line: change course! Low tide shows sandbars.',
    bonus: 3000,
    enemyRake: 1,
    mechanics: ['tide'],
    boss: 'shellback',
    crates: 2,
    finale: true,
    finaleText: 'The Shellback scuttles off to sleep, and the Sunset Isles are free! You are the Admiral of the Twelve Seas!',
    victoryLine: 'The Twelve Seas are yours',
    rumour: {
      title: 'Shellback Shoals',
      lines: ['A Rock Fort aims a red line at you. Turn before it goes solid!', 'They say the island in the bay… snores.'],
      ammo: 'frost',
      foes: ['fort', 'shellback'],
    },
  },
];

/** Added to the Kraken's Deep's Victory text once the Sunset Isles follow it (§2.2). */
export const ACT4_TEASER = '…but on the sunset horizon, an island is snoring.';
