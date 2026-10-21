// Professor Barnacle's Riddle Bell (SPEC3 §7): nine quiz islands in three bands, five questions a round (one
// from each category, the sums generated here), stars that pay gold once, and the quiz record
// (pirates-ahoy-quiz, §10.1). The questions themselves live in quizBank.js and are passed in.
//
// Islands are numbered by their index in QUIZ_LEVELS: `level` 0 is Shallow Shoals, 8 is Professor's Peak
// (the record's arrays use the same index). openLevels(rec) is a count: island i is open when
// i < openLevels(rec).
//
// A round question is { id, cat, q, options, right, fact }: `options` are the answer texts in the order shown
// (3 or 4), `right` is the index of the right one in `options`.
//
// Gold (§7.2, §10.2): each star pays once, when it is first paid for; the "Good try!" pays once per island.
// reward() works out what is owed and raises the stars; markPaid() is applied only once the quiz record and
// the chest are both saved, so gold that could not be saved stays owed and is paid later, once.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Every shuffle uses a seeded rng (rng(seed)
// below), never the browser's own random numbers. Nothing here throws, whatever it is given.

/** §7.2: the islands (band, answers per question, gold for the first new star and for each later one). */
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

const ROUND_CATS = [...CATS, 'sums']; // one question from each, in a shuffled order
const BANDS = [1, 2, 3];
const MAX_SEAS = 9; // a places question waits at most for the last level
const LIMIT = { q: 90, answer: 28, fact: 120 }; // they fit a 320 px phone at the panel's sizes
const MIN_PER_BAND = 10; // questions per category per band
const MIN_REAL_PLACES = 4; // places questions with seas: 0 per band
const MIN_WRONG = { 1: 2, 2: 2, 3: 3 };
const FIELDS = ['id', 'cat', 'band', 'q', 'right', 'wrong', 'fact', 'seas'];
const ID = /^[a-z]+(?:-[a-z0-9]+)+$/; // cat-word
const MAX_ID = 48;

// ---------------------------------------------------------------------------
// Validation helpers (the parseShipConfig rules of upgrades.js)
// ---------------------------------------------------------------------------
const MAX_RAW = 8 * 1024; // a real record is under 3 KB; anything bigger is junk
const SCAN = 512; // at most this many entries of a list are looked at
const PLAIN_INT = /^-?\d{1,16}$/;
const hasOwn = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Array.isArray throws on a revoked proxy: that counts as missing too.
function isArray(o) {
  try {
    return Array.isArray(o);
  } catch {
    return false;
  }
}
function isRecord(o) {
  if (o === null || typeof o !== 'object') return false;
  try {
    return !Array.isArray(o);
  } catch {
    return false;
  }
}
// Read one field; a hostile object (throwing getter or proxy) just counts as missing.
function field(o, k) {
  try {
    return hasOwn(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
}
// The length of an array (0 for anything that is not a readable array).
function lengthOf(list) {
  try {
    const n = isArray(list) ? list.length : 0;
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
// The first SCAN entries of an array (a Set's first SCAN values); [] for anything else.
function listOf(v) {
  const out = [];
  try {
    if (v instanceof Set) {
      for (const x of v) {
        if (out.length >= SCAN) break;
        out.push(x);
      }
      return out;
    }
  } catch {
    return [];
  }
  const n = Math.min(SCAN, lengthOf(v));
  for (let i = 0; i < n; i++) out.push(field(v, i));
  return out;
}
// A stored count: a plain integer (number or digit string), clamped; anything else -> null.
function readInt(v, max) {
  let n = null;
  if (typeof v === 'number' && Number.isSafeInteger(v)) n = v;
  else if (typeof v === 'string' && PLAIN_INT.test(v.trim())) {
    const k = Number(v.trim());
    if (Number.isSafeInteger(k)) n = k;
  }
  return n === null ? null : clamp(n, 0, max) + 0; // + 0 turns -0 into 0
}
// Number literals that are not plain integers in the JSON text ("1e1", "2.0", "-0.5") are
// rejected too, where the engine tells the reviver the source text (newer engines).
const BAD = Symbol('bad');
function reviver(key, value, context) {
  if (typeof value === 'number' && context && typeof context.source === 'string' && !PLAIN_INT.test(context.source)) return BAD;
  return value;
}
// Storage text -> object; null for anything too big. Throws only on bad JSON (the callers catch it).
function readJson(raw) {
  if (raw.length > MAX_RAW) return null;
  let obj = JSON.parse(raw);
  try {
    obj = JSON.parse(raw, reviver); // a reviver recurses, so very deep junk can overflow it
  } catch {
    // keep the plain parse
  }
  return obj;
}
const levelOf = (level) => (Number.isInteger(level) && level >= 0 && level < QUIZ_LEVELS.length ? QUIZ_LEVELS[level] : null);
// A bank question's id that can be remembered in `seen` (the generated sums never are).
const seenId = (v) => typeof v === 'string' && v.length <= MAX_ID && ID.test(v) && CATS.includes(v.slice(0, v.indexOf('-')));
const answerKey = (s) => s.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------
/** mulberry32: a small seeded random number generator (0 ≤ n < 1). */
export function rng(seed) {
  let a = 0;
  try {
    a = Number(seed) >>> 0; // NaN -> 0
  } catch {
    a = 0; // a Symbol
  }
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A caller's rng made safe: always a number in [0, 1). Not a function -> a fixed seed.
function safeRand(rand) {
  if (typeof rand !== 'function') return rng(1);
  return () => {
    let x;
    try {
      x = Number(rand());
    } catch {
      x = 0;
    }
    return x >= 0 && x < 1 ? x : 0;
  };
}
const randInt = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
function shuffle(list, r) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

// ---------------------------------------------------------------------------
// The bank (§7.4)
// ---------------------------------------------------------------------------
function textProblem(v, max, what) {
  if (typeof v !== 'string' || v.trim() === '') return `${what} is empty`;
  if (v !== v.trim()) return `${what} has spaces at an end`;
  if (v.length > max) return `${what} is ${v.length} characters (at most ${max})`;
  return '';
}

// Every problem with one question (none: []).
function questionProblems(e) {
  if (!isRecord(e)) return ['not a question'];
  const out = [];
  const add = (msg) => msg && out.push(msg);
  let keys = [];
  try {
    keys = Object.keys(e);
  } catch {
    return ['unreadable'];
  }
  for (const k of keys) if (!FIELDS.includes(k)) add(`unknown field "${k}"`);
  const id = field(e, 'id');
  const cat = field(e, 'cat');
  const band = field(e, 'band');
  if (!CATS.includes(cat)) add(`unknown category ${JSON.stringify(cat)}`);
  if (typeof id !== 'string' || !ID.test(id) || id.length > MAX_ID) add('the id is not a cat-word id');
  else if (CATS.includes(cat) && !id.startsWith(`${cat}-`)) add(`the id does not start with "${cat}-"`);
  if (!BANDS.includes(band)) add(`unknown band ${JSON.stringify(band)}`);
  add(textProblem(field(e, 'q'), LIMIT.q, 'the question'));
  add(textProblem(field(e, 'fact'), LIMIT.fact, 'the fact'));
  const right = field(e, 'right');
  add(textProblem(right, LIMIT.answer, 'the right answer'));
  const wrong = field(e, 'wrong');
  if (!isArray(wrong)) add('wrong is not a list');
  else {
    const list = listOf(wrong);
    const need = MIN_WRONG[band] || 2;
    if (list.length < need) add(`${list.length} wrong answers (band ${band} needs at least ${need})`);
    const keysSeen = new Set();
    if (typeof right === 'string') keysSeen.add(answerKey(right));
    list.forEach((w, i) => {
      const p = textProblem(w, LIMIT.answer, `wrong answer ${i + 1}`);
      if (p) add(p);
      else if (typeof right === 'string' && answerKey(w) === answerKey(right)) add(`the right answer is also wrong answer ${i + 1}`);
      else if (keysSeen.has(answerKey(w))) add(`wrong answer ${i + 1} is a duplicate`);
      if (typeof w === 'string') keysSeen.add(answerKey(w));
    });
  }
  const seas = field(e, 'seas');
  if (cat === 'places') {
    if (!Number.isInteger(seas) || seas < 0 || seas > MAX_SEAS) add(`seas must be 0..${MAX_SEAS} (got ${JSON.stringify(seas)})`);
  } else if (hasOwn(e, 'seas')) add('only places questions have seas');
  return out;
}

/** Check a question bank (§7.4): every line, the ids, and enough questions in every category and band. */
export function validateBank(bank) {
  const errors = [];
  if (!isArray(bank)) return { ok: false, errors: ['the bank is not a list'] };
  const n = lengthOf(bank);
  const ids = new Set();
  const count = {};
  const realPlaces = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < n; i++) {
    const e = field(bank, i);
    const id = field(e, 'id');
    const name = typeof id === 'string' && id ? id : `question ${i + 1}`;
    const problems = questionProblems(e);
    if (typeof id === 'string') {
      if (ids.has(id)) problems.push('the id is used twice');
      ids.add(id);
    }
    for (const p of problems) errors.push(`${name}: ${p}`);
    if (problems.length) continue;
    const key = `${field(e, 'cat')} ${field(e, 'band')}`;
    count[key] = (count[key] || 0) + 1;
    if (field(e, 'cat') === 'places' && field(e, 'seas') === 0) realPlaces[field(e, 'band')]++;
  }
  for (const cat of CATS) {
    for (const band of BANDS) {
      const got = count[`${cat} ${band}`] || 0;
      if (got < MIN_PER_BAND) errors.push(`${cat} band ${band}: ${got} good questions (at least ${MIN_PER_BAND})`);
    }
  }
  for (const band of BANDS) {
    if (realPlaces[band] < MIN_REAL_PLACES) errors.push(`places band ${band}: ${realPlaces[band]} with seas: 0 (at least ${MIN_REAL_PLACES})`);
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Generated sums (§7.6)
// ---------------------------------------------------------------------------
const THEMES = ['coins', 'gulls', 'barrels', 'cannonballs', 'parrots'];
const KINDS = { 1: ['add', 'take'], 2: ['add', 'take', 'times'], 3: ['times', 'share'] };
// Each kind's question in each theme: add (a + b), take (a − b), times (a groups of b), share (a shared by b).
const SUM_Q = {
  add: {
    coins: (a, b) => `You have ${a} coins and find ${b} more. How many coins now?`,
    gulls: (a, b) => `${a} gulls sit on the mast. ${b} more land. How many gulls now?`,
    barrels: (a, b) => `The hold has ${a} barrels. You load ${b} more. How many barrels now?`,
    cannonballs: (a, b) => `${a} cannonballs are in a pile. You add ${b} more. How many now?`,
    parrots: (a, b) => `${a} parrots sit in a tree. ${b} more fly in. How many parrots now?`,
  },
  take: {
    coins: (a, b) => `You have ${a} coins and spend ${b}. How many coins are left?`,
    gulls: (a, b) => `${a} gulls sit on the mast. ${b} fly away. How many are left?`,
    barrels: (a, b) => `The hold has ${a} barrels. You sell ${b}. How many are left?`,
    cannonballs: (a, b) => `You have ${a} cannonballs and fire ${b}. How many are left?`,
    parrots: (a, b) => `${a} parrots sit in a tree. ${b} fly off. How many are left?`,
  },
  times: {
    coins: (a, b) => `${a} chests hold ${b} coins each. How many coins?`,
    gulls: (a, b) => `${a} rocks each have ${b} gulls on them. How many gulls?`,
    barrels: (a, b) => `${a} rafts carry ${b} barrels each. How many barrels?`,
    cannonballs: (a, b) => `${a} cannons fire ${b} cannonballs each. How many cannonballs?`,
    parrots: (a, b) => `${a} perches hold ${b} parrots each. How many parrots?`,
  },
  share: {
    coins: (a, b) => `${a} coins are shared by ${b} pirates. How many each?`,
    gulls: (a, b) => `${a} gulls land evenly on ${b} rocks. How many on each rock?`,
    barrels: (a, b) => `${a} barrels are packed evenly onto ${b} ships. How many on each ship?`,
    cannonballs: (a, b) => `${a} cannonballs are shared by ${b} cannons. How many each?`,
    parrots: (a, b) => `${a} crackers are shared by ${b} parrots. How many each?`,
  },
};
// Numbers for each kind and band: [a, b] (every count is at least 2, so every noun is plural).
function sumNumbers(kind, band, r) {
  if (kind === 'add') {
    if (band === 1) {
      const a = randInt(r, 2, 18);
      return [a, randInt(r, 2, 20 - a)]; // within 20
    }
    const a = randInt(r, 10, 89);
    return [a, randInt(r, 3, 100 - a)]; // within 100
  }
  if (kind === 'take') {
    if (band === 1) {
      const a = randInt(r, 4, 20);
      return [a, randInt(r, 2, a - 2)]; // never below 2
    }
    const a = randInt(r, 20, 100);
    return [a, randInt(r, 3, a - 3)];
  }
  if (kind === 'times') {
    if (band === 2) return [randInt(r, 2, 10), [2, 5, 10][randInt(r, 0, 2)]]; // ×2, ×5, ×10
    return [randInt(r, 2, 10), randInt(r, 2, 10)]; // times tables to 10 × 10
  }
  const each = randInt(r, 2, 10); // share: exact, 2..10 each
  const by = randInt(r, 2, 10);
  return [each * by, by];
}
const answerOf = (kind, a, b) => (kind === 'add' ? a + b : kind === 'take' ? a - b : kind === 'times' ? a * b : a / b);
function sumFact(kind, band, a, b, n) {
  if (kind === 'add') return band === 1 ? `${a} + ${b} = ${n}. Start at ${Math.max(a, b)} and count on ${Math.min(a, b)}!` : `${a} + ${b} = ${n}. Add the tens, then the ones!`;
  if (kind === 'take') return `${a} − ${b} = ${n}. Check it: ${n} + ${b} = ${a}.`;
  if (kind === 'times') return `${a} × ${b} = ${n}: ${a} lots of ${b} make ${n}.`;
  return `${a} ÷ ${b} = ${n}, because ${b} × ${n} = ${a}.`;
}
// Near misses: band 1 from ±1, ±2; band 2 also ±10; band 3 also the digits swapped. Never negative, never
// the right answer, never 0 for a sharing sum.
function nearMisses(kind, band, n, r) {
  const offsets = band === 1 ? [-2, -1, 1, 2] : [-10, -2, -1, 1, 2, 10];
  const set = new Set(offsets.map((d) => n + d));
  if (band === 3 && n >= 10 && n <= 99 && n % 10 !== 0 && Math.floor(n / 10) !== n % 10) set.add((n % 10) * 10 + Math.floor(n / 10));
  const ok = [...set].filter((v) => v >= 0 && v !== n && !(kind === 'share' && v === 0));
  return shuffle(ok, r).slice(0, MIN_WRONG[band]);
}

/**
 * A generated sum for a band (§7.6), in the bank's format: { id, cat: 'sums', q, right, wrong, fact } with
 * the answers as digit strings. Band 1: add and take away within 20; band 2: within 100, and ×2, ×5, ×10;
 * band 3: times tables to 10 × 10 and exact sharing. The id says what was asked ('sums-1-add-coins-7-5').
 */
export function sumQuestion(band, rand) {
  const b = BANDS.includes(band) ? band : 1;
  const r = safeRand(rand);
  const kinds = KINDS[b];
  const kind = kinds[randInt(r, 0, kinds.length - 1)];
  const theme = THEMES[randInt(r, 0, THEMES.length - 1)];
  const [x, y] = sumNumbers(kind, b, r);
  const n = answerOf(kind, x, y);
  return {
    id: `sums-${b}-${kind}-${theme}-${x}-${y}`,
    cat: 'sums',
    q: SUM_Q[kind][theme](x, y),
    right: String(n),
    wrong: nearMisses(kind, b, n, r).map(String),
    fact: sumFact(kind, b, x, y, n),
  };
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------
// The usable questions of a bank, read safely (a broken line is skipped, never asked).
function readBank(bank) {
  const out = [];
  const n = Math.min(4096, isArray(bank) ? lengthOf(bank) : 0);
  for (let i = 0; i < n; i++) {
    const e = field(bank, i);
    if (!isRecord(e)) continue;
    const id = field(e, 'id');
    const cat = field(e, 'cat');
    const band = field(e, 'band');
    const q = field(e, 'q');
    const right = field(e, 'right');
    const fact = field(e, 'fact');
    if (typeof id !== 'string' || !CATS.includes(cat) || !BANDS.includes(band) || typeof q !== 'string' || typeof right !== 'string') continue;
    const keys = new Set([answerKey(right)]);
    const wrong = [];
    for (const w of listOf(field(e, 'wrong'))) {
      if (typeof w !== 'string' || !w.trim() || keys.has(answerKey(w))) continue;
      keys.add(answerKey(w));
      wrong.push(w);
    }
    if (!wrong.length || !right.trim() || !q.trim()) continue;
    const seas = field(e, 'seas');
    out.push({ id, cat, band, q, right, wrong, fact: typeof fact === 'string' ? fact : '', seas: Number.isInteger(seas) ? seas : 0 });
  }
  return out;
}

// One bank question for a category: the island's band (else the nearest band), a places question only once
// its sea is reached, never one already in this round, and never one asked lately while an unasked one is left
// (when every one has been asked, the one asked longest ago).
function pickQuestion(questions, cat, band, unlocked, lastAsked, used, r) {
  for (const b of [band, band - 1, band + 1, band - 2, band + 2]) {
    const pool = questions.filter((e) => e.cat === cat && e.band === b && !used.has(e.id) && (cat !== 'places' || e.seas <= unlocked));
    if (!pool.length) continue;
    const fresh = pool.filter((e) => !lastAsked.has(e.id));
    if (fresh.length) return fresh[Math.floor(r() * fresh.length)];
    let best = pool[0];
    for (const e of pool) if (lastAsked.get(e.id) < lastAsked.get(best.id)) best = e;
    return best;
  }
  return null;
}

// A bank-format question as the round shows it: the island's number of answers, in a shuffled order.
function present(src, answers, r) {
  const wrong = shuffle(src.wrong.slice(), r).slice(0, answers - 1);
  const options = shuffle([src.right, ...wrong], r);
  return { id: src.id, cat: src.cat, q: src.q, options, right: options.indexOf(src.right), fact: src.fact };
}

/**
 * A round of five questions for island `level` (0..8): one from each category (sea, life, places, pirates,
 * sums) in an order shuffled by `seed`, the island's band and number of answers. `unlocked` (the highest
 * level reached, 1..9) gates places questions by their `seas`; `seen` (the record's list, oldest first) and
 * `recent` (ids asked since, not yet saved) are avoided while the pool allows. [] for an unknown island.
 */
export function makeRound(bank, level, seed, opts) {
  const isl = levelOf(level);
  if (!isl) return [];
  const o = isRecord(opts) ? opts : {};
  const unlocked = Math.max(1, readInt(field(o, 'unlocked'), MAX_SEAS) ?? 1);
  const lastAsked = new Map();
  [...listOf(field(o, 'seen')), ...listOf(field(o, 'recent'))].forEach((id, i) => {
    if (typeof id === 'string') lastAsked.set(id, i);
  });
  const questions = readBank(bank);
  const r = rng(seed);
  const used = new Set();
  const round = [];
  for (const cat of shuffle(ROUND_CATS.slice(), r)) {
    let src = cat === 'sums' ? sumQuestion(isl.band, r) : pickQuestion(questions, cat, isl.band, unlocked, lastAsked, used, r);
    // A bank with nothing left for this category (only a broken bank): another sum keeps the round whole.
    for (let k = 0; k < 20 && (!src || used.has(src.id)); k++) src = sumQuestion(isl.band, r);
    used.add(src.id);
    round.push(present(src, isl.answers, r));
  }
  return round;
}

/** Stars for a round: 3 right = ★, 4 = ★★, 5 = ★★★. */
export function stars(correct) {
  const n = typeof correct === 'number' ? correct : 0;
  return n >= PASS[2] ? 3 : n >= PASS[1] ? 2 : n >= PASS[0] ? 1 : 0;
}

/**
 * A lifebuoy: the index of a wrong answer to take away from a round question, picked with `rand` (without
 * one, the first wrong answer left); null when only one wrong answer is left (a question always keeps two
 * answers to choose from). `removed` lists (or is a Set of) the indexes already taken away.
 */
export function hint(question, removed, rand) {
  try {
    if (!isRecord(question)) return null;
    const n = lengthOf(field(question, 'options'));
    const right = field(question, 'right');
    if (!Number.isInteger(right) || right < 0 || right >= n) return null;
    const gone = new Set(listOf(removed));
    const left = [];
    for (let i = 0; i < n; i++) if (i !== right && !gone.has(i)) left.push(i);
    if (left.length <= 1) return null;
    return typeof rand === 'function' ? left[Math.floor(safeRand(rand)() * left.length)] : left[0];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stars and gold (§7.2, §10.2)
// ---------------------------------------------------------------------------
const starGold = (isl, k) => (k === 1 ? isl.first : isl.later); // the k-th star of an island (1..3)

/** The star gold still owed: every star above `paid`, on any island. */
export function owed(rec) {
  const r = parseQuiz(rec);
  let gold = 0;
  QUIZ_LEVELS.forEach((isl, i) => {
    for (let k = r.paid[i] + 1; k <= r.stars[i]; k++) gold += starGold(isl, k);
  });
  return gold;
}

/**
 * A finished round on island `level` with `starsWon` (0..3) stars: the record with the island's stars raised
 * (never lowered; a locked island's stars don't count), how many of its stars are new, whether this is the
 * island's first finished round ("Good try!"), and the gold to pay: every owed star on any island plus the
 * Good try. Pay it, save the record from markPaid() and the chest, and only if both saved keep markPaid()'s
 * record; otherwise keep this one, so the gold stays owed.
 */
export function reward(rec, level, starsWon) {
  const r = parseQuiz(rec);
  const isl = levelOf(level);
  if (!isl || level >= openLevels(r)) return { gold: owed(r), rec: r, newStars: 0, goodTry: false };
  const won = Number.isInteger(starsWon) ? clamp(starsWon, 0, 3) : 0;
  const before = r.stars[level];
  r.stars[level] = Math.max(before, won);
  const goodTry = r.tried[level] === 0;
  return { gold: owed(r) + (goodTry ? GOOD_TRY : 0), rec: r, newStars: r.stars[level] - before, goodTry };
}

/** The record once the gold of reward() is saved: every star paid, and island `level`'s Good try if paid. */
export function markPaid(rec, level, goodTry) {
  const r = parseQuiz(rec);
  r.paid = r.stars.slice();
  if (goodTry === true && levelOf(level)) r.tried[level] = 1;
  return r;
}

/** How many islands are open (1..9): the first, and each one after an island with a star. */
export function openLevels(rec) {
  return Math.min(QUIZ_LEVELS.length, passed(rec) + 1);
}

/** Islands passed (with at least one star): 0..9, the feat `quiz`. */
export function passed(rec) {
  return parseQuiz(rec).stars.filter((s) => s > 0).length; // the star chain keeps them in a row
}

/** All stars earned: 0..27, the feat `stars`. */
export function totalStars(rec) {
  return parseQuiz(rec).stars.reduce((a, b) => a + b, 0);
}

/** The record with these question ids remembered as just asked (newest last; at most SEEN_MAX; no sums). */
export function noteSeen(rec, ids) {
  const r = parseQuiz(rec);
  const add = typeof ids === 'string' ? [ids] : listOf(ids).map((x) => (isRecord(x) ? field(x, 'id') : x));
  for (const id of add) {
    if (!seenId(id)) continue;
    const k = r.seen.indexOf(id);
    if (k >= 0) r.seen.splice(k, 1);
    r.seen.push(id);
  }
  if (r.seen.length > SEEN_MAX) r.seen = r.seen.slice(-SEEN_MAX);
  return r;
}

/**
 * Two tabs' records merged (§10.2): each island's stars and paid the larger, tried or-ed, seen merged (this
 * tab's ids count as the newer) and capped. Nothing ever goes down.
 */
export function mergeQuiz(mine, theirs) {
  const a = parseQuiz(mine);
  const b = parseQuiz(theirs);
  return parseQuiz({
    stars: a.stars.map((s, i) => Math.max(s, b.stars[i])),
    paid: a.paid.map((s, i) => Math.max(s, b.paid[i])),
    tried: a.tried.map((s, i) => Math.max(s, b.tried[i])),
    seen: [...b.seen, ...a.seen],
  });
}

// ---------------------------------------------------------------------------
// The record (§10.1)
// ---------------------------------------------------------------------------
/** A fresh record: no stars, nothing paid, nothing tried, nothing seen. */
export function defaultQuiz() {
  const zeros = () => QUIZ_LEVELS.map(() => 0);
  return { v: 1, stars: zeros(), paid: zeros(), tried: zeros(), seen: [] };
}

// Nine plain integers 0..max from a stored list (missing or bad entries 0).
function readLevels(list, max) {
  const arr = isArray(list) ? list : null;
  return QUIZ_LEVELS.map((_, i) => (arr ? readInt(field(arr, i), max) ?? 0 : 0));
}

// The ids parseQuiz may keep: a list (or Set) of ids or of questions; null means "any well-formed id".
function knownSet(knownIds) {
  try {
    let list;
    if (knownIds instanceof Set) list = [...knownIds];
    else if (isArray(knownIds)) list = Array.from({ length: lengthOf(knownIds) }, (_, i) => field(knownIds, i));
    else return null;
    const set = new Set();
    for (const x of list) {
      const id = isRecord(x) ? field(x, 'id') : x;
      if (typeof id === 'string') set.add(id);
    }
    return set;
  } catch {
    return null;
  }
}

// `seen`: known well-formed ids only, the newest copy of each, at most SEEN_MAX (the oldest dropped).
function readSeen(list, known) {
  const n = lengthOf(list);
  const out = [];
  const have = new Set();
  for (let i = n - 1, looked = 0; i >= 0 && looked < SCAN && out.length < SEEN_MAX; i--, looked++) {
    const id = field(list, i);
    if (!seenId(id) || have.has(id) || (known && !known.has(id))) continue;
    have.add(id);
    out.push(id);
  }
  return out.reverse();
}

function cleanQuiz(obj, known) {
  const rec = defaultQuiz();
  if (!isRecord(obj)) return rec;
  const starList = readLevels(field(obj, 'stars'), 3);
  const paid = readLevels(field(obj, 'paid'), 3);
  const tried = readLevels(field(obj, 'tried'), 1);
  for (let i = 0; i < QUIZ_LEVELS.length; i++) {
    // The star chain: a star on an island counts only if the island before it has one.
    rec.stars[i] = i === 0 || rec.stars[i - 1] > 0 ? starList[i] : 0;
    rec.paid[i] = Math.min(paid[i], rec.stars[i]);
    rec.tried[i] = tried[i];
  }
  rec.seen = readSeen(field(obj, 'seen'), known);
  return rec;
}

/**
 * Read a stored quiz record (a string from storage, null, or a record object). Never throws: unreadable input
 * gives the default, and each field falls back on its own. `knownIds` (the bank's ids, or the bank) limits
 * `seen` to questions that exist; without it any well-formed bank id is kept.
 */
export function parseQuiz(raw, knownIds) {
  try {
    const known = knownSet(knownIds);
    if (typeof raw === 'string') return cleanQuiz(readJson(raw), known);
    return cleanQuiz(raw, known);
  } catch {
    return defaultQuiz();
  }
}

/** JSON for storage (validated first, so only known fields are written, in a fixed order). */
export function serializeQuiz(rec) {
  return JSON.stringify(parseQuiz(rec));
}
