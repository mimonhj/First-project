// Professor Barnacle's Riddle Bell (SPEC3 §7): nine quiz islands in three bands, five questions a round (one
// from each category, sums generated), stars that pay gold once, and the quiz record (pirates-ahoy-quiz,
// §10.1). The questions themselves live in quizBank.js and are passed in.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Shuffles use the round's own seeded rng.
//
// STAGE 0 SCAFFOLD: the tables and the final §11.1 API returning safe defaults (no rounds, no stars, no
// gold). Stage 1E writes the rules, the validator and the record's validation.

/** §7.2: the islands (band, answers per question, gold for the first new star and each later one). */
export const QUIZ_LEVELS = [
  { name: 'Shallow Shoals', band: 1, answers: 3, first: 60, later: 15 },
  { name: 'Seagull Sands', band: 1, answers: 3, first: 80, later: 30 },
  { name: 'Turtle Cove', band: 1, answers: 3, first: 100, later: 45 },
  { name: 'Coral Corner', band: 2, answers: 3, first: 120, later: 60 },
  { name: 'Puffin Point', band: 2, answers: 3, first: 140, later: 75 },
  { name: 'Whale Way', band: 2, answers: 3, first: 160, later: 90 },
  { name: 'Storm Cape', band: 3, answers: 4, first: 180, later: 105 },
  { name: 'Kraken Quay', band: 3, answers: 4, first: 200, later: 120 },
  { name: "Professor's Peak", band: 3, answers: 4, first: 220, later: 135 },
];

export const CATS = ['sea', 'life', 'places', 'pirates'];
export const ROUND = 5;
export const PASS = [3, 4, 5]; // right answers for 1, 2 and 3 stars
export const GOOD_TRY = 10;
export const SEEN_MAX = 60;

/** mulberry32: a small seeded random number generator (0 ≤ n < 1). */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Check a question bank (§7.4). (Stage 0: not checked yet.) */
export function validateBank(bank) {
  return { ok: false, errors: ['not checked yet (Stage 0 scaffold)'] };
}

/** A generated sum (§7.6). (Stage 0: none.) */
export function sumQuestion(band, rand) {
  return null;
}

/** A round of five questions for an island. (Stage 0: no questions.) */
export function makeRound(bank, level, seed, opts) {
  return [];
}

export function stars(correct) {
  const n = Number(correct);
  return n >= PASS[2] ? 3 : n >= PASS[1] ? 2 : n >= PASS[0] ? 1 : 0;
}

/** A lifebuoy: the index of a wrong answer to remove. (Stage 0: none.) */
export function hint(question, removed, rand) {
  return null;
}

/** The gold a finished round pays. (Stage 0: none.) */
export function reward(rec, level, starsWon) {
  return { gold: 0, rec: rec && typeof rec === 'object' ? rec : defaultQuiz(), newStars: 0, goodTry: false };
}

export function markPaid(rec, level, goodTry) {
  return rec && typeof rec === 'object' ? rec : defaultQuiz();
}

export function owed(rec) {
  return 0;
}

/** The islands open: the first, and each one after an island with a star. (Stage 0: the first.) */
export function openLevels(rec) {
  return 1;
}

export function passed(rec) {
  return 0;
}

export function totalStars(rec) {
  return 0;
}

export function noteSeen(rec, ids) {
  return rec && typeof rec === 'object' ? rec : defaultQuiz();
}

/** The quiz record (§10.1). */
export function defaultQuiz() {
  const zeros = () => QUIZ_LEVELS.map(() => 0);
  return { v: 1, stars: zeros(), paid: zeros(), tried: zeros(), seen: [] };
}

/** Read a stored quiz record. Never throws. (Stage 0: the default.) */
export function parseQuiz(raw, knownIds) {
  return defaultQuiz();
}

export function serializeQuiz(rec) {
  return JSON.stringify(defaultQuiz());
}
