// The whole voyage (SPEC3 §5.1, SPEC4 §2.1): Voyages I and II from levels.js, then Voyage III, The Kraken Seas
// (act3.js), then Voyage IV, The Sunset Isles (act4.js).
// WITH_KRAKEN switches on everything the Kraken Seas update added (the levels, special shot, the island, the quiz);
// it is true now that Voyage III sails for everyone. (Before it went live, only ?kraken=1 in the address set it.)
// WITH_V4 switches on everything the Sunset Isles update adds (SPEC4 §0.1): only ?v4=1 in the address sets it until
// Stage 3 sets it to true. With it false the voyage is exactly the nine levels of today, level 9 untouched.
import { LEVELS as BASE_LEVELS } from './levels.js';
import { ACT3_LEVELS, ACT3_TEASER } from './act3.js';
import { ACT4_LEVELS, ACT4_TEASER } from './act4.js';

export const WITH_KRAKEN = true;
export const WITH_V4 = typeof location !== 'undefined' && /[?&]v4=1(&|$)/.test(location.search);

// Level 9 once Voyage IV follows it (§2.2): three keys laid over act3.js's level here, so act3.js is not touched.
const KRAKEN_DEEP_V4 = { sailOn: 'Sail on to the Sunset Isles', teaser: ACT4_TEASER, victoryLine: 'The Kraken Seas are yours' };
const ACT3_V4 = ACT3_LEVELS.map((def, i) => (i === ACT3_LEVELS.length - 1 ? { ...def, ...KRAKEN_DEEP_V4 } : def));

const KRAKEN_LEVELS = WITH_KRAKEN ? [...BASE_LEVELS, ...ACT3_LEVELS] : BASE_LEVELS;
export const LEVELS = WITH_V4 ? [...BASE_LEVELS, ...ACT3_V4, ...ACT4_LEVELS] : KRAKEN_LEVELS;

// The line added to the Maelstrom's Victory text once Voyage III follows it (§5.2), and to the Kraken's Deep's once
// Voyage IV follows it (SPEC4 §2.2).
export { ACT3_TEASER, ACT4_TEASER };
