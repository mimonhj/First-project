// The Riddle Bell's question bank (SPEC3 §7.4–7.5): one line per question, checked by quiz.js
// validateBank() and a Node test.
//
// { id: 'life-octopus-hearts', cat: 'life', band: 2, q: 'How many hearts does an octopus have?',
//   right: 'Three', wrong: ['One', 'Two'], fact: 'Three hearts, and blue blood too!' },
// Fields: id (unique, cat-word), cat (sea | life | places | pirates), band 1..3, q, right, wrong (bands 1–2:
// ≥ 2; band 3: ≥ 3), fact, and for places only `seas` (0 = real geography, else the level whose sea must be
// reached first). British spelling; pirate history kept child-safe.
//
// Pure data: imports nothing.
//
// STAGE 0 SCAFFOLD: empty. Stage 1E writes the 72 starter questions of §7.5 and 48 more.

export const QUESTIONS = [];
