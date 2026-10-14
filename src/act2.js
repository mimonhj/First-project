// Act II: The Far Seas (SPEC2 §6.4–6.6): Doubloon Bay, Frostbite Straits and The Maelstrom.
// Stage 0 placeholder: the level definitions (same format as ACT1 in levels.js, with env: doubloon,
// frost and maelstrom) arrive in Stage 1. The environment modules are imported already, so they load
// (and must stay importable) on every page, as they will once the levels use them.
import * as doubloon from './env/doubloon.js';
import * as frost from './env/frost.js';
import * as maelstrom from './env/maelstrom.js';

void doubloon;
void frost;
void maelstrom;

export const ACT2_LEVELS = [];
