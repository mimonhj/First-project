// The whole voyage (SPEC3 §5.1): Voyages I and II from levels.js, then Voyage III, The Kraken Seas (act3.js).
// WITH_KRAKEN switches on everything the Kraken Seas update added (the levels, special shot, the island, the quiz);
// it is true now that Voyage III sails for everyone. (Before it went live, only ?kraken=1 in the address set it.)
import { LEVELS as BASE_LEVELS } from './levels.js';
import { ACT3_LEVELS, ACT3_TEASER } from './act3.js';

export const WITH_KRAKEN = true;

export const LEVELS = WITH_KRAKEN ? [...BASE_LEVELS, ...ACT3_LEVELS] : BASE_LEVELS;

// The line added to the Maelstrom's Victory text once Voyage III follows it (§5.2).
export { ACT3_TEASER };
