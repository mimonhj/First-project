// The whole voyage (SPEC3 §5.1): Voyages I and II from levels.js, then Voyage III, The Kraken Seas (act3.js),
// once it sails with the voyage. Until it goes live (Stage 3 sets WITH_KRAKEN = true) only ?kraken=1 in the
// address adds it, so levels.js keeps its six levels and every test of today's voyage holds.
import { LEVELS as BASE_LEVELS } from './levels.js';
import { ACT3_LEVELS } from './act3.js';

export const WITH_KRAKEN = typeof location !== 'undefined' && /[?&]kraken=1(&|$)/.test(location.search);

export const LEVELS = WITH_KRAKEN ? [...BASE_LEVELS, ...ACT3_LEVELS] : BASE_LEVELS;
