// Unit checks for Professor Barnacle's Riddle Bell (SPEC3 §7) in src/quiz.js and the question bank in
// src/quizBank.js (plain Node, no browser):
// - the islands table and the gold: 2,610 for all 27 stars + 90 for the nine "Good try!"s
// - the real bank validates (≥ 10 per category per band, ≥ 4 real-geography places per band, the §7.5
//   starters all there), British spelling, child-safe words; validateBank catches every kind of mistake
// - sumQuestion: right and well-formed for 10,000 seeds per band
// - makeRound: five questions, one per category, seas gating, the seen list, seeded answer order
// - stars, the lifebuoy, reward / markPaid / owed (gold only once, owed gold paid once), open islands
// - parseQuiz with the garbage battery, the star chain and paid ≤ stars; noteSeen, mergeQuiz; round trips
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let passes = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}

// The game's modules are browser ES modules in a package without "type": "module". These two
// import nothing, so they are loaded from their source as data: URLs.
const sources = {};
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  sources[rel] = src;
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => {
  if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 60) + '…' : v);
  if (typeof v === 'symbol' || typeof v === 'function' || typeof v === 'bigint') return String(v);
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 80 ? s.slice(0, 80) + '…' : s;
  } catch {
    return Object.prototype.toString.call(v);
  }
};
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
};
const sum = (list) => list.reduce((a, b) => a + b, 0);

// The 72 starter questions of SPEC3 §7.5 (the bank keeps every one).
const STARTERS = [
  'sea-port', 'sea-bow', 'sea-anchor', 'sea-compass', 'sea-biggest-ocean', 'sea-drink', 'sea-tides', 'sea-crows-nest',
  'sea-galley', 'sea-knots', 'sea-fathom', 'sea-equator', 'sea-five-oceans', 'sea-trench', 'sea-tsunami',
  'sea-waterspout', 'sea-lighthouse', 'sea-harrison', 'life-octopus-arms', 'life-dolphin', 'life-starfish',
  'life-crab', 'life-penguin', 'life-blue-whale', 'life-octopus-hearts', 'life-seahorse', 'life-turtle-nest',
  'life-shark-skeleton', 'life-puffin', 'life-coral', 'life-largest-ever', 'life-whale-shark', 'life-jellyfish',
  'life-narwhal', 'life-orca', 'life-squid-ink', 'places-island', 'places-volcano', 'places-polar-bear',
  'places-icebergs', 'places-bali', 'places-europe', 'places-fjords', 'places-vikings', 'places-ring-of-fire',
  'places-doubloon', 'places-terraces', 'places-equator-hot', 'places-good-hope', 'places-cape-horn',
  'places-maelstrom', 'places-atoll', 'places-iceland', 'places-komodo', 'pirates-jolly-roger', 'pirates-ahoy',
  'pirates-captain', 'pirates-x', 'pirates-spyglass', 'pirates-treasure', 'pirates-blackbeard-ship',
  'pirates-pieces-of-eight', 'pirates-stevenson', 'pirates-golden-age', 'pirates-bonny-read', 'pirates-biscuit',
  'pirates-stinkpots', 'pirates-teach', 'pirates-privateer', 'pirates-drake', 'pirates-cutlass', 'pirates-articles',
];

(async () => {
  const Q = await load('src/quiz.js');
  const { QUESTIONS } = await load('src/quizBank.js');
  const { QUIZ_LEVELS, CATS } = Q;
  const N = QUIZ_LEVELS.length;
  const IDS = QUESTIONS.map((e) => e.id);
  const BY_ID = new Map(QUESTIONS.map((e) => [e.id, e]));
  const zeros = () => Array(N).fill(0);
  const rec = (o = {}) => ({ v: 1, stars: zeros(), paid: zeros(), tried: zeros(), seen: [], ...o });

  // ------------------------------------------------------------------ the tables (§7.2)
  {
    const want = [
      ['Shallow Shoals', 1, 3, 60, 15, 90], ['Seagull Sands', 1, 3, 80, 30, 140], ['Turtle Cove', 1, 3, 100, 45, 190],
      ['Coral Corner', 2, 3, 120, 60, 240], ['Puffin Point', 2, 3, 140, 75, 290], ['Whale Way', 2, 3, 160, 90, 340],
      ['Storm Cape', 3, 4, 180, 105, 390], ['Kraken Quay', 3, 4, 200, 120, 440], ["Professor's Peak", 3, 4, 220, 135, 490],
    ];
    const got = QUIZ_LEVELS.map((L) => [L.name, L.band, L.answers, L.first, L.later, L.first + 2 * L.later]);
    check(same(got, want), `QUIZ_LEVELS: nine islands with their band, answers and star gold (${got.map((g) => `${g[0]} ${g[5]}`).join(', ')})`);
    const stars = sum(QUIZ_LEVELS.map((L) => L.first + 2 * L.later));
    check(stars === 2610 && Q.GOOD_TRY * N === 90 && stars + Q.GOOD_TRY * N === 2700, `gold totals: all 27 stars ${stars} + nine "Good try!" ${Q.GOOD_TRY * N} = ${stars + Q.GOOD_TRY * N}`);
    check(same(CATS, ['sea', 'life', 'places', 'pirates']) && Q.ROUND === 5 && same(Q.PASS, [3, 4, 5]) && Q.GOOD_TRY === 10 && Q.SEEN_MAX === 60, 'CATS, ROUND 5, PASS [3, 4, 5], GOOD_TRY 10, SEEN_MAX 60');
  }

  // ------------------------------------------------------------------ the real bank (§7.4, §7.5)
  {
    const v = Q.validateBank(QUESTIONS);
    check(v.ok === true && same(v.errors, []), `the real bank validates (${QUESTIONS.length} questions)${v.errors.length ? ' -> ' + v.errors.slice(0, 5).join('; ') : ''}`);
    const counts = [];
    let fewest = Infinity;
    for (const cat of CATS) for (const band of [1, 2, 3]) {
      const n = QUESTIONS.filter((e) => e.cat === cat && e.band === band).length;
      fewest = Math.min(fewest, n);
      counts.push(`${cat} ${band}: ${n}`);
    }
    check(fewest >= 10 && QUESTIONS.length >= 120, `at least 10 questions per category per band, 120 in all (${counts.join(', ')})`);
    const real = [1, 2, 3].map((b) => QUESTIONS.filter((e) => e.cat === 'places' && e.band === b && e.seas === 0).length);
    check(real.every((n) => n >= 4), `at least 4 real-geography places questions (seas: 0) per band (${real.join(' / ')})`);
    const missing = STARTERS.filter((id) => !BY_ID.has(id));
    check(STARTERS.length === 72 && missing.length === 0, `all 72 starter questions of §7.5 are in the bank${missing.length ? ' -> missing ' + missing.join(', ') : ''}`);
    check(new Set(IDS).size === IDS.length && IDS.every((id, i) => id.startsWith(QUESTIONS[i].cat + '-')), 'ids are unique and start with their category');
    const qs = QUESTIONS.map((e) => e.q.toLowerCase());
    check(new Set(qs).size === qs.length, 'no question is asked twice in different words... or the same words');
    const longest = (f) => Math.max(...QUESTIONS.flatMap(f));
    console.log(`      longest: question ${longest((e) => [e.q.length])}, answer ${longest((e) => [e.right, ...e.wrong].map((a) => a.length))}, fact ${longest((e) => [e.fact.length])}`);

    // British spelling, and nothing a parent would not read aloud.
    const US = /\b(colors?|colorful|favou?rite?s?|harbors?|centers?|meters?|kilometers?|centimeters?|gray|behaviors?|neighbors?|honors?|labors?|theaters?|traveled|traveling|jewelry|mom|plows?|odors?|armor|vapors?|fibers?|liters?|defense|catalog|airplanes?|cozy|pajamas|realiz\w*|organiz\w*|recogniz\w*|apologiz\w*|favors?|mustache|aluminum|skeptical|gotten)\b/i;
    const usOk = (w) => /^favourite/i.test(w); // the regex above also matches the British "favourite"
    const usBad = [];
    const harsh = /\b(kill(s|ed|ing)?|murder\w*|hanged|hanging|execut\w*|tortur\w*|gore|gory|behead\w*|slave\w*|drown\w*|corpses?|cruel\w*|stab\w*|wounds?|bloody|beat(en)?|weapons?|guns?|die[ds]?|dying|death|scary|stupid|dumb|idiot|hate)\b/i;
    const harshBad = [];
    const style = [];
    for (const e of QUESTIONS) {
      const texts = [e.q, e.right, ...e.wrong, e.fact];
      for (const t of texts) {
        const m = t.match(US);
        if (m && !usOk(m[0])) usBad.push(`${e.id}: "${m[0]}"`);
        const h = t.match(harsh);
        if (h && !(e.id === 'pirates-blackbeard-ship' && /^scary$/i.test(h[0]))) harshBad.push(`${e.id}: "${h[0]}"`);
        if (/[‘’“”]/.test(t)) style.push(`${e.id}: curly quotes`);
        if (/ {2}/.test(t)) style.push(`${e.id}: double space`);
      }
      if (!/[?…]$/.test(e.q)) style.push(`${e.id}: the question ends "${e.q.slice(-1)}"`);
      if (!/[.!?]$/.test(e.fact)) style.push(`${e.id}: the fact ends "${e.fact.slice(-1)}"`);
      if ([e.right, ...e.wrong].some((a) => /\.$/.test(a))) style.push(`${e.id}: an answer ends with a full stop`);
    }
    check(usBad.length === 0, `British spelling throughout (no color, harbor, meter, favorite...)${usBad.length ? ' -> ' + usBad.join('; ') : ''}`);
    check(harshBad.length === 0, `child-safe words only (no killing, hanging, gore, weapons or name-calling; Blackbeard may "look scary")${harshBad.length ? ' -> ' + harshBad.join('; ') : ''}`);
    check(style.length === 0, `tidy text: straight quotes, questions end in ? or …, facts end in . ! or ?, answers have no full stop${style.length ? ' -> ' + style.slice(0, 6).join('; ') : ''}`);
    const seasBad = QUESTIONS.filter((e) => (e.cat === 'places') !== Object.prototype.hasOwnProperty.call(e, 'seas') || (e.cat === 'places' && !(Number.isInteger(e.seas) && e.seas >= 0 && e.seas <= 9)));
    check(seasBad.length === 0, `every places question (and only those) says which sea it needs (0..9)${seasBad.length ? ' -> ' + seasBad.map((e) => e.id).join(', ') : ''}`);
    const gates = [...new Set(QUESTIONS.filter((e) => e.cat === 'places').map((e) => e.seas))].sort((a, b) => a - b);
    console.log(`      places gates used: ${gates.join(', ')}`);
  }

  // ------------------------------------------------------------------ validateBank catches mistakes
  {
    const base = () => JSON.parse(JSON.stringify(QUESTIONS));
    const at = (bank, id) => bank.find((e) => e.id === id);
    const cases = [
      ['a duplicate id', (b) => { at(b, 'sea-bow').id = 'sea-port'; }, 'sea-port'],
      ['an unknown category', (b) => { at(b, 'sea-bow').cat = 'seas'; }, 'sea-bow'],
      ['band 4', (b) => { at(b, 'sea-bow').band = 4; }, 'sea-bow'],
      ['band "1" (a string)', (b) => { at(b, 'sea-bow').band = '1'; }, 'sea-bow'],
      ['a 91-character question', (b) => { at(b, 'sea-bow').q = 'Q'.repeat(90) + '?'; }, 'sea-bow'],
      ['a 29-character answer', (b) => { at(b, 'sea-bow').right = 'A'.repeat(29); }, 'sea-bow'],
      ['a 29-character wrong answer', (b) => { at(b, 'sea-bow').wrong[1] = 'W'.repeat(29); }, 'sea-bow'],
      ['a 121-character fact', (b) => { at(b, 'sea-bow').fact = 'F'.repeat(120) + '.'; }, 'sea-bow'],
      ['an empty right answer', (b) => { at(b, 'sea-bow').right = ' '; }, 'sea-bow'],
      ['an empty wrong answer', (b) => { at(b, 'sea-bow').wrong[0] = ''; }, 'sea-bow'],
      ['a missing fact', (b) => { delete at(b, 'sea-bow').fact; }, 'sea-bow'],
      ['a missing question', (b) => { at(b, 'sea-bow').q = null; }, 'sea-bow'],
      ['one wrong answer in band 1', (b) => { at(b, 'sea-bow').wrong = ['The stern']; }, 'sea-bow'],
      ['two wrong answers in band 3', (b) => { at(b, 'sea-trench').wrong.pop(); }, 'sea-trench'],
      ['wrong answers not a list', (b) => { at(b, 'sea-bow').wrong = 'The stern'; }, 'sea-bow'],
      ['duplicate wrong answers (any case)', (b) => { at(b, 'sea-bow').wrong = ['The stern', 'the Stern ']; }, 'sea-bow'],
      ['the right answer among the wrong ones', (b) => { at(b, 'sea-bow').wrong = ['The stern', 'the bow']; }, 'sea-bow'],
      ['spaces at the end of a question', (b) => { at(b, 'sea-bow').q += ' '; }, 'sea-bow'],
      ['a places question without seas', (b) => { delete at(b, 'places-bali').seas; }, 'places-bali'],
      ['seas 10', (b) => { at(b, 'places-bali').seas = 10; }, 'places-bali'],
      ['seas 1.5', (b) => { at(b, 'places-bali').seas = 1.5; }, 'places-bali'],
      ['seas on a sea question', (b) => { at(b, 'sea-bow').seas = 0; }, 'sea-bow'],
      ['an unknown field', (b) => { at(b, 'sea-bow').facts = 'x'; }, 'sea-bow'],
      ['an id of another category', (b) => { at(b, 'sea-bow').id = 'life-bow'; }, 'life-bow'],
      ['an id that is not cat-word', (b) => { at(b, 'sea-bow').id = 'Sea Bow'; }, 'Sea Bow'],
      ['a junk entry', (b) => { b.push(null); }, 'question 121'],
      ['nine sea questions in band 1', (b) => { b.splice(b.indexOf(at(b, 'sea-bow')), 1); }, 'sea band 1'],
      ['three real-geography places in band 3', (b) => { at(b, 'places-panama').seas = 8; }, 'places band 3'],
    ];
    const bad = [];
    for (const [name, mutate, mention] of cases) {
      const bank = base();
      mutate(bank);
      let v;
      try {
        v = Q.validateBank(bank);
      } catch (e) {
        bad.push(`${name}: threw ${e.message}`);
        continue;
      }
      if (v.ok !== false || !v.errors.some((m) => m.includes(mention))) bad.push(`${name}: ${show(v)}`);
      else if (v.errors.length > 3) bad.push(`${name}: ${v.errors.length} errors for one mistake (${v.errors.join('; ')})`);
    }
    check(bad.length === 0, `validateBank names each of ${cases.length} kinds of mistake${bad.length ? ' -> ' + bad.join('; ') : ''}`);

    const hostile = [{}];
    Object.defineProperty(hostile[0], 'id', { enumerable: true, get() { throw new Error('getter'); } });
    const proxy = new Proxy([], { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const junk = [null, undefined, 42, 'bank', {}, [], [null], [1, 'x'], hostile, proxy, [proxy], () => 1, Symbol('x')];
    const threw = [];
    for (const b of junk) {
      try {
        const v = Q.validateBank(b);
        if (v.ok !== false || !Array.isArray(v.errors) || !v.errors.length || !v.errors.every((m) => typeof m === 'string')) threw.push(`${show(b)}: ${show(v)}`);
      } catch (e) {
        threw.push(`${show(b)}: threw ${e.message}`);
      }
    }
    check(threw.length === 0, `validateBank never throws, and junk banks are not ok (${junk.length} kinds)${threw.length ? ' -> ' + threw.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ sumQuestion (§7.6)
  {
    const KINDS = { 1: ['add', 'take'], 2: ['add', 'take', 'times'], 3: ['times', 'share'] };
    const THEMES = ['coins', 'gulls', 'barrels', 'cannonballs', 'parrots'];
    const SIGN = { add: '+', take: '−', times: '×', share: '÷' };
    for (const band of [1, 2, 3]) {
      const bad = [];
      const kinds = new Set();
      const themes = new Set();
      const rights = new Set();
      for (let seed = 1; seed <= 10000; seed++) {
        let s;
        try {
          s = Q.sumQuestion(band, Q.rng(seed));
        } catch (e) {
          bad.push(`seed ${seed}: threw ${e.message}`);
          continue;
        }
        const problems = [];
        const m = /^sums-(\d)-(add|take|times|share)-([a-z]+)-(\d+)-(\d+)$/.exec(s && s.id);
        if (!m || Number(m[1]) !== band) problems.push(`id ${show(s && s.id)}`);
        else {
          const [, , kind, theme, as, bs] = m;
          const a = Number(as);
          const b = Number(bs);
          kinds.add(kind);
          themes.add(theme);
          const n = kind === 'add' ? a + b : kind === 'take' ? a - b : kind === 'times' ? a * b : a / b;
          rights.add(n);
          if (!KINDS[band].includes(kind) || !THEMES.includes(theme)) problems.push(`kind ${kind} / theme ${theme}`);
          if (s.right !== String(n) || !Number.isInteger(n)) problems.push(`right ${s.right} (want ${n})`);
          // the numbers in the question are the sum's own, in order
          const nums = (s.q.match(/\d+/g) || []).map(Number);
          if (!same(nums, [a, b])) problems.push(`numbers in the question ${show(nums)}`);
          if (!s.fact.includes(`${a} ${SIGN[kind]} ${b} = ${n}`)) problems.push(`fact ${show(s.fact)}`);
          // the ranges of §7.6 (every count ≥ 2, so every noun is plural)
          const range =
            band === 1 ? (kind === 'add' ? a >= 2 && b >= 2 && n <= 20 : a <= 20 && b >= 2 && n >= 2)
            : band === 2 ? (kind === 'add' ? a >= 10 && b >= 3 && n <= 100 : kind === 'take' ? a <= 100 && b >= 3 && n >= 3 : a >= 2 && a <= 10 && [2, 5, 10].includes(b))
            : kind === 'times' ? a >= 2 && a <= 10 && b >= 2 && b <= 10 : a % b === 0 && b >= 2 && b <= 10 && n >= 2 && n <= 10;
          if (!range) problems.push(`out of range ${a} ${SIGN[kind]} ${b}`);
          // wrong answers: the right number, distinct, never negative, never the right one, never 0 for sharing,
          // and near misses only
          const wrong = s.wrong.map(Number);
          const swap = n >= 10 && n <= 99 && n % 10 !== 0 ? (n % 10) * 10 + Math.floor(n / 10) : null;
          const near = (w) => [1, 2].includes(Math.abs(w - n)) || (band > 1 && Math.abs(w - n) === 10) || (band === 3 && w === swap);
          if (s.wrong.length !== (band === 3 ? 3 : 2)) problems.push(`${s.wrong.length} wrong answers`);
          if (!s.wrong.every((w) => /^\d+$/.test(w))) problems.push(`wrong ${show(s.wrong)}`);
          if (new Set(wrong).size !== wrong.length || wrong.includes(n) || wrong.some((w) => w < 0) || (kind === 'share' && wrong.includes(0)) || !wrong.every(near)) problems.push(`wrong ${show(s.wrong)} for ${n}`);
        }
        if (!s || s.cat !== 'sums' || typeof s.q !== 'string' || s.q.length > 90 || s.right.length > 28 || s.fact.length > 120 || !/\?$/.test(s.q)) problems.push(`shape ${show(s)}`);
        if (problems.length) bad.push(`seed ${seed}: ${problems.join(', ')}`);
      }
      check(bad.length === 0 && kinds.size === KINDS[band].length && themes.size === 5, `sumQuestion band ${band}: 10,000 seeds right and well-formed (${[...kinds].join(', ')}; all 5 themes; answers ${Math.min(...rights)}..${Math.max(...rights)})${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    }
    const a = Q.sumQuestion(2, Q.rng(77));
    const b = Q.sumQuestion(2, Q.rng(77));
    check(same(a, b), `sumQuestion is the same for the same seed ("${a.q}")`);
    const junk = [];
    for (const [band, rand] of [[0, Q.rng(1)], [4, Q.rng(1)], ['2', Q.rng(1)], [null, null], [1, 'x'], [3, () => NaN], [3, () => 5], [2, () => { throw new Error('x'); }]]) {
      try {
        const s = Q.sumQuestion(band, rand);
        const kind = /^sums-(\d)-/.exec(s.id);
        if (!kind || s.wrong.length < 2 || s.right === undefined) junk.push(`${show(band)}: ${show(s)}`);
      } catch (e) {
        junk.push(`${show(band)}: threw ${e.message}`);
      }
    }
    check(junk.length === 0, `sumQuestion with a junk band or rng still gives a sum, never throws${junk.length ? ' -> ' + junk.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ makeRound
  {
    const ROUND_CATS = ['life', 'pirates', 'places', 'sea', 'sums'];
    const bad = [];
    const firstCats = new Set();
    const rightAt = QUIZ_LEVELS.map(() => [0, 0, 0, 0]);
    let rounds = 0;
    for (let level = 0; level < N; level++) {
      const isl = QUIZ_LEVELS[level];
      for (let unlocked = 1; unlocked <= 9; unlocked++) {
        for (let seed = 1; seed <= 120; seed++) {
          const round = Q.makeRound(QUESTIONS, level, seed * 7919 + unlocked, { unlocked });
          rounds++;
          const p = [];
          if (!Array.isArray(round) || round.length !== 5) {
            bad.push(`island ${level} seed ${seed}: ${show(round)}`);
            continue;
          }
          firstCats.add(round[0].cat);
          if (!same(round.map((x) => x.cat).sort(), ROUND_CATS)) p.push(`categories ${round.map((x) => x.cat)}`);
          if (new Set(round.map((x) => x.id)).size !== 5) p.push('a question twice');
          for (const x of round) {
            if (!same(Object.keys(x).sort(), ['cat', 'fact', 'id', 'options', 'q', 'right'])) p.push(`fields ${Object.keys(x)}`);
            if (x.options.length !== isl.answers || new Set(x.options).size !== x.options.length) p.push(`${x.id}: options ${show(x.options)}`);
            if (!Number.isInteger(x.right) || x.right < 0 || x.right >= x.options.length) p.push(`${x.id}: right ${x.right}`);
            else rightAt[level][x.right]++;
            if (x.cat === 'sums') {
              if (!x.id.startsWith(`sums-${isl.band}-`)) p.push(`${x.id}: not a band ${isl.band} sum`);
              continue;
            }
            const e = BY_ID.get(x.id);
            if (!e) {
              p.push(`${x.id}: not in the bank`);
              continue;
            }
            if (e.band !== isl.band) p.push(`${x.id}: band ${e.band} on a band ${isl.band} island`);
            if (e.cat === 'places' && e.seas > unlocked) p.push(`${x.id}: needs sea ${e.seas}, reached ${unlocked}`);
            if (x.options[x.right] !== e.right || !x.options.every((o, i) => i === x.right || e.wrong.includes(o))) p.push(`${x.id}: answers ${show(x.options)}`);
            if (x.q !== e.q || x.fact !== e.fact || x.cat !== e.cat) p.push(`${x.id}: text changed`);
          }
          if (p.length) bad.push(`island ${level} unlocked ${unlocked} seed ${seed}: ${p.join(', ')}`);
        }
      }
    }
    check(bad.length === 0, `makeRound: ${rounds} rounds on all nine islands with unlocked 1..9: five questions, one per category, the island's band and number of answers, places only from seas reached, the bank's own texts${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    check(firstCats.size === 5, `the category order is shuffled (${[...firstCats].join(', ')} all come first sometimes)`);
    const positions = rightAt.map((c, i) => c.slice(0, QUIZ_LEVELS[i].answers));
    check(positions.every((c) => c.every((n) => n > 0.6 * (sum(c) / c.length))), `the right answer is in every position, about evenly (island 1: ${positions[0].join('/')}, island 9: ${positions[8].join('/')})`);

    const one = JSON.stringify(Q.makeRound(QUESTIONS, 4, 99, { unlocked: 6 }));
    check(one === JSON.stringify(Q.makeRound(QUESTIONS, 4, 99, { unlocked: 6 })) && one !== JSON.stringify(Q.makeRound(QUESTIONS, 4, 100, { unlocked: 6 })), 'the same seed gives the same round; another seed another round');
    // The answer order depends on the seed for the same question.
    const orders = new Set();
    for (let seed = 1; seed <= 2000; seed++) {
      const x = Q.makeRound(QUESTIONS, 0, seed, { unlocked: 1 }).find((y) => y.id === 'sea-port');
      if (x) orders.add(x.options.join('|'));
    }
    check(orders.size >= 6, `the same question comes with its answers in different orders (${orders.size} orders of "sea-port" seen)`);

    // Seas gating: with every sea reached, the late seas' questions do come up.
    const seenPlaces = new Set();
    for (let seed = 1; seed <= 3000; seed++) for (const level of [0, 3, 6]) seenPlaces.add(Q.makeRound(QUESTIONS, level, seed, { unlocked: 9 }).find((y) => y.cat === 'places').id);
    const allPlaces = QUESTIONS.filter((e) => e.cat === 'places').map((e) => e.id);
    check(allPlaces.every((id) => seenPlaces.has(id)), `with every sea reached, all ${allPlaces.length} places questions get asked (${seenPlaces.size} seen)`);
    const early = new Set();
    for (let seed = 1; seed <= 3000; seed++) early.add(Q.makeRound(QUESTIONS, 6, seed, { unlocked: 1 }).find((y) => y.cat === 'places').id);
    check([...early].every((id) => BY_ID.get(id).seas <= 1) && early.size >= 4, `a child who has only sailed level 1 gets band 3 places questions about real geography only (${[...early].join(', ')})`);
    const noUnlocked = [Q.makeRound(QUESTIONS, 0, 5), Q.makeRound(QUESTIONS, 0, 5, {}), Q.makeRound(QUESTIONS, 0, 5, { unlocked: 'lots' }), Q.makeRound(QUESTIONS, 0, 5, { unlocked: 1 })].map((r) => JSON.stringify(r));
    check(new Set(noUnlocked).size === 1, 'no (or a junk) `unlocked` counts as level 1 reached');

    // The seen list: a question is not asked again until the rest of its pool has been.
    {
      let r = Q.defaultQuiz();
      const asked = { sea: [], life: [], places: [], pirates: [] };
      for (let k = 0; k < 40; k++) {
        const round = Q.makeRound(QUESTIONS, 0, 1000 + k, { unlocked: 9, seen: r.seen });
        for (const x of round) if (x.cat !== 'sums') asked[x.cat].push(x.id);
        r = Q.noteSeen(r, round);
      }
      const repeats = [];
      for (const cat of CATS) {
        const pool = QUESTIONS.filter((e) => e.cat === cat && e.band === 1).length;
        const list = asked[cat];
        for (let i = 0; i + pool <= list.length; i++) if (new Set(list.slice(i, i + pool)).size !== pool) repeats.push(`${cat} at round ${i + 1}`);
        if (new Set(list.slice(0, pool)).size !== pool) repeats.push(`${cat}: first ${pool}`);
      }
      check(repeats.length === 0, `40 rounds on Shallow Shoals: no question comes back before every other one of its pool has been asked${repeats.length ? ' -> ' + repeats.slice(0, 4).join('; ') : ''}`);
    }
    {
      const pool = QUESTIONS.filter((e) => e.cat === 'pirates' && e.band === 2).map((e) => e.id);
      const lastOne = pool[pool.length - 1];
      const most = pool.slice(0, -1);
      const picks = new Set();
      for (let seed = 1; seed <= 200; seed++) picks.add(Q.makeRound(QUESTIONS, 3, seed, { unlocked: 9, seen: most }).find((x) => x.cat === 'pirates').id);
      check(picks.size === 1 && picks.has(lastOne), `the one question not yet seen is picked every time (${[...picks].join(', ')})`);
      const all = [...pool.slice(3), ...pool.slice(0, 3)]; // oldest first
      const oldest = new Set();
      for (let seed = 1; seed <= 200; seed++) oldest.add(Q.makeRound(QUESTIONS, 3, seed, { unlocked: 9, seen: all }).find((x) => x.cat === 'pirates').id);
      check(oldest.size === 1 && oldest.has(all[0]), `when the whole pool has been seen, the one seen longest ago comes back (${[...oldest].join(', ')})`);
      const withRecent = new Set();
      for (let seed = 1; seed <= 200; seed++) withRecent.add(Q.makeRound(QUESTIONS, 3, seed, { unlocked: 9, seen: most, recent: [lastOne] }).find((x) => x.cat === 'pirates').id);
      check(withRecent.size === 1 && withRecent.has(most[0]), `\`recent\` ids count as the newest seen (${[...withRecent].join(', ')})`);
    }

    // Junk never throws: unknown islands give no round, a broken bank still gives five questions.
    const junkBad = [];
    for (const level of [-1, 9, 1.5, '3', null, undefined, NaN, Symbol('x')]) {
      try {
        const r = Q.makeRound(QUESTIONS, level, 1, { unlocked: 9 });
        if (!same(r, [])) junkBad.push(`island ${show(level)}: ${show(r)}`);
      } catch (e) {
        junkBad.push(`island ${show(level)}: threw ${e.message}`);
      }
    }
    const proxy = new Proxy([], { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const hostile = {};
    Object.defineProperty(hostile, 'unlocked', { enumerable: true, get() { throw new Error('getter'); } });
    const banks = [null, [], 'bank', [null, 5], [{ id: 'sea-x', cat: 'sea', band: 1, q: 'Q?', right: 'A', wrong: ['A', 'a'], fact: '.' }], proxy, [proxy], QUESTIONS.slice(0, 10)];
    for (const bank of banks) {
      for (const opts of [undefined, null, 5, hostile, { seen: proxy, recent: 'x', unlocked: -4 }]) {
        try {
          const r = Q.makeRound(bank, 7, 3, opts);
          if (r.length !== 5 || new Set(r.map((x) => x.id)).size !== 5 || !r.every((x) => x.options.length >= 2 && x.options[x.right] !== undefined)) junkBad.push(`bank ${show(bank)}: ${show(r)}`);
        } catch (e) {
          junkBad.push(`bank ${show(bank)} opts ${show(opts)}: threw ${e.message}`);
        }
      }
    }
    check(junkBad.length === 0, `makeRound never throws: unknown islands give [], a broken bank or junk options still give five askable questions (sums fill the gaps)${junkBad.length ? ' -> ' + junkBad.slice(0, 3).join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ stars and the lifebuoy
  {
    const got = [0, 1, 2, 3, 4, 5, 6, -1, NaN, '5', null, undefined, Symbol('x'), {}].map((n) => {
      try {
        return Q.stars(n);
      } catch {
        return 'threw';
      }
    });
    check(same(got, [0, 0, 0, 1, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0]), `stars: 3 right = 1, 4 = 2, 5 = 3, junk 0 (${got.join(', ')})`);

    const bad = [];
    const reached = new Set();
    for (let seed = 1; seed <= 500; seed++) {
      for (const level of [0, 8]) {
        for (const x of Q.makeRound(QUESTIONS, level, seed, { unlocked: 9 })) {
          const r = Q.rng(seed);
          const removed = [];
          let k;
          while ((k = Q.hint(x, removed, r)) !== null) {
            if (!Number.isInteger(k) || k === x.right || removed.includes(k) || k < 0 || k >= x.options.length) {
              bad.push(`${x.id}: ${k}`);
              break;
            }
            removed.push(k);
            reached.add(`${x.options.length}:${k === x.right ? 'R' : k}`);
            if (removed.length > 3) break;
          }
          if (removed.length !== x.options.length - 2) bad.push(`${x.id}: ${removed.length} taken away from ${x.options.length}`);
        }
      }
    }
    check(bad.length === 0, `hint: takes away wrong answers only, one at a time, and always leaves two answers to choose from${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    check([0, 1, 2].every((i) => reached.has(`3:${i}`)) && [0, 1, 2, 3].every((i) => reached.has(`4:${i}`)), 'hint can take away an answer from any position');
    const x = { id: 'x', cat: 'sea', q: '?', options: ['a', 'b', 'c', 'd'], right: 2, fact: '.' };
    const fromSet = new Set();
    for (let s = 1; s <= 50; s++) fromSet.add(Q.hint(x, new Set([0]), Q.rng(s)));
    check(Q.hint(x, [], Q.rng(4)) === Q.hint(x, [], Q.rng(4)) && same([...fromSet].sort(), [1, 3]) && Q.hint(x, [0, 1], Q.rng(9)) === null && Q.hint(x, new Set([3, 1]), Q.rng(9)) === null && Q.hint(x, [3], null) === 0 && Q.hint(x, [0], undefined) === 1, `hint is seeded; \`removed\` may be a list or a Set (${[...fromSet].join(', ')} after 0 went); without an rng it takes the first wrong answer left`);
    const junk = [null, 5, {}, { options: ['a'], right: 0 }, { options: ['a', 'b', 'c'], right: 7 }, { options: 'abc', right: 0 }, { options: ['a', 'b', 'c'], right: '0' }].map((q) => {
      try {
        return Q.hint(q, null, Q.rng(1));
      } catch {
        return 'threw';
      }
    });
    check(junk.every((v) => v === null), `hint of a junk question is null (${junk.join(', ')})`);
  }

  // ------------------------------------------------------------------ reward, markPaid, owed (§7.2, §10.2)
  {
    // The happy path: island 1 with one star, then two more, then nothing for replays.
    let r = Q.defaultQuiz();
    let res = Q.reward(r, 0, 1);
    check(res.gold === 70 && res.newStars === 1 && res.goodTry === true && same(res.rec.stars.slice(0, 2), [1, 0]) && same(res.rec.paid, zeros()) && same(res.rec.tried, zeros()), `first star on Shallow Shoals: 60 + Good try 10 = ${res.gold}; reward raises only the stars (${show(res.rec)})`);
    r = Q.markPaid(res.rec, 0, res.goodTry);
    check(same(r.paid.slice(0, 2), [1, 0]) && same(r.tried.slice(0, 2), [1, 0]) && Q.owed(r) === 0, `markPaid: paid = stars, tried set (${show(r)})`);
    res = Q.reward(r, 0, 1);
    check(res.gold === 0 && res.newStars === 0 && res.goodTry === false, `replaying with the same star pays nothing (${res.gold})`);
    res = Q.reward(r, 0, 3);
    check(res.gold === 30 && res.newStars === 2 && res.rec.stars[0] === 3, `then three stars pays the two new ones: 15 + 15 = ${res.gold}`);
    r = Q.markPaid(res.rec, 0, res.goodTry);
    res = Q.reward(r, 0, 3);
    const lower = Q.reward(r, 0, 0);
    check(res.gold === 0 && lower.gold === 0 && lower.rec.stars[0] === 3 && lower.newStars === 0, 'nothing more for replays, and a worse round never lowers the stars');

    // Locked islands: no stars count, nothing paid.
    const locked = Q.reward(Q.defaultQuiz(), 3, 3);
    check(locked.gold === 0 && locked.newStars === 0 && locked.goodTry === false && Q.totalStars(locked.rec) === 0, 'a locked island (Coral Corner before Turtle Cove has a star) earns nothing');

    // Every star and every Good try, in a random order of rounds: exactly 2,700, never more.
    for (const seed of [1, 2, 3, 4, 5]) {
      const rand = Q.rng(seed);
      let x = Q.defaultQuiz();
      let gold = 0;
      let tries = 0;
      let roundsPlayed = 0;
      while ((Q.totalStars(x) < 27 || x.tried.includes(0)) && roundsPlayed < 5000) {
        const open = Q.openLevels(x);
        const level = Math.floor(rand() * open);
        const won = Math.floor(rand() * 4);
        const res2 = Q.reward(x, level, won);
        gold += res2.gold;
        if (res2.goodTry) tries++;
        x = Q.markPaid(res2.rec, level, res2.goodTry);
        roundsPlayed++;
      }
      const starGold = gold - tries * Q.GOOD_TRY;
      const after = Q.reward(x, 8, 3).gold + Q.reward(x, 0, 3).gold;
      check(gold === 2700 && starGold === 2610 && tries === 9 && after === 0 && Q.totalStars(x) === 27, `seed ${seed}: ${roundsPlayed} random rounds earn all 27 stars and pay ${gold} gold in all (stars ${starGold} + ${tries} "Good try!"s); nothing after`);
    }

    // The storage rule: gold that could not be saved stays owed and is paid once, later.
    {
      let x = Q.defaultQuiz();
      const first = Q.reward(x, 0, 2); // 60 + 15 + 10
      x = first.rec; // the chest write failed: keep the stars, not the paid / tried
      check(first.gold === 85 && Q.owed(x) === 75 && Q.openLevels(x) === 2, `an unsaved reward keeps its stars (island 2 opens) and leaves ${Q.owed(x)} gold owed`);
      const next = Q.reward(x, 1, 1); // the next round pays the owed stars too
      check(next.gold === 75 + 80 + 10, `the next reward pays the owed stars once with its own: ${next.gold}`);
      x = Q.markPaid(next.rec, 1, next.goodTry);
      check(Q.owed(x) === 0 && x.tried[0] === 0 && x.tried[1] === 1, 'after markPaid nothing is owed; the unsaved Good try of island 1 is still to come');
      const again = Q.reward(x, 0, 1);
      check(again.gold === 10 && again.goodTry === true, `that Good try is paid the next time island 1's round is finished (${again.gold})`);
      x = Q.markPaid(again.rec, 0, again.goodTry);
      check(Q.reward(x, 0, 2).gold === 0 && Q.reward(x, 1, 1).gold === 0 && Q.owed(x) === 0, 'and never twice');
      // Opening the panel with gold owed: pay owed(), then markPaid with no island.
      let y = Q.reward(Q.defaultQuiz(), 0, 3).rec;
      const due = Q.owed(y);
      y = Q.markPaid(y, null, false);
      check(due === 90 && Q.owed(y) === 0 && same(y.tried, zeros()), `owed gold paid when the panel opens (${due}) leaves the Good try for the next round`);
    }

    // Junk never throws and gives a valid record.
    const junk = [];
    for (const r0 of [null, 'garbage', 42, { stars: 'x' }, Symbol('x')]) {
      for (const level of [0, -1, 9, '0', NaN]) {
        for (const won of [3, 5, -1, 2.5, '2', NaN, null]) {
          try {
            const res3 = Q.reward(r0, level, won);
            if (!Number.isInteger(res3.gold) || res3.gold < 0 || !Array.isArray(res3.rec.stars) || ![0, 1, 2, 3].includes(res3.newStars) || typeof res3.goodTry !== 'boolean') junk.push(`${show(r0)} ${show(level)} ${show(won)}: ${show(res3)}`);
            Q.markPaid(r0, level, won);
          } catch (e) {
            junk.push(`${show(r0)} ${show(level)} ${show(won)}: threw ${e.message}`);
          }
        }
      }
    }
    const five = Q.reward(Q.defaultQuiz(), 0, 5);
    const half = Q.reward(Q.defaultQuiz(), 0, 2.5);
    check(junk.length === 0 && five.rec.stars[0] === 3 && half.rec.stars[0] === 0, `reward / markPaid never throw on junk; stars won are clamped to 0..3 (5 -> 3, 2.5 -> 0)${junk.length ? ' -> ' + junk.slice(0, 3).join('; ') : ''}`);
    const frozen = deepFreeze(rec({ stars: [1, 1, 0, 0, 0, 0, 0, 0, 0], seen: ['sea-port'] }));
    let pure = true;
    try {
      Q.reward(frozen, 2, 3);
      Q.markPaid(frozen, 0, true);
      Q.noteSeen(frozen, ['sea-bow']);
      Q.mergeQuiz(frozen, frozen);
      Q.owed(frozen);
    } catch {
      pure = false;
    }
    check(pure && frozen.stars[2] === 0, 'the record functions never change the record they are given (they return a new one)');
  }

  // ------------------------------------------------------------------ open islands, passed, totals
  {
    const cases = [
      [zeros(), 1, 0, 0],
      [[1, 0, 0, 0, 0, 0, 0, 0, 0], 2, 1, 1],
      [[1, 2, 0, 0, 0, 0, 0, 0, 0], 3, 2, 3],
      [[3, 3, 3, 3, 3, 3, 3, 3, 2], 9, 9, 26],
      [[3, 3, 3, 3, 3, 3, 3, 3, 3], 9, 9, 27],
      [[0, 3, 3, 0, 0, 0, 0, 0, 0], 1, 0, 0], // the star chain: nothing after a gap counts
      [[2, 0, 3, 3, 0, 0, 0, 0, 0], 2, 1, 2],
    ];
    const bad = cases.filter(([s, o, p, t]) => Q.openLevels(rec({ stars: s })) !== o || Q.passed(rec({ stars: s })) !== p || Q.totalStars(rec({ stars: s })) !== t).map(([s]) => `${s.join('')} -> ${Q.openLevels(rec({ stars: s }))}/${Q.passed(rec({ stars: s }))}/${Q.totalStars(rec({ stars: s }))}`);
    check(bad.length === 0 && Q.openLevels(null) === 1 && Q.passed('junk') === 0, `openLevels / passed / totalStars (the feats quiz 0..9 and stars 0..27) follow the star chain${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ noteSeen and mergeQuiz
  {
    let r = Q.noteSeen(Q.defaultQuiz(), ['sea-port', 'sums-1-add-coins-3-4', 'life-crab', 42, null, 'Sea Port', 'nope-x']);
    check(same(r.seen, ['sea-port', 'life-crab']), `noteSeen keeps bank ids only (no sums, no junk): ${show(r.seen)}`);
    r = Q.noteSeen(r, 'sea-port');
    check(same(r.seen, ['life-crab', 'sea-port']), 'an id asked again moves to the newest end');
    const many = IDS.slice(0, 70);
    r = Q.noteSeen(Q.defaultQuiz(), many);
    check(r.seen.length === 60 && same(r.seen, many.slice(10)), 'at most 60 are kept, the oldest dropped');
    const round = Q.makeRound(QUESTIONS, 0, 3, { unlocked: 1 });
    r = Q.noteSeen(Q.defaultQuiz(), round);
    check(same(r.seen, round.filter((x) => x.cat !== 'sums').map((x) => x.id)), 'a round itself can be noted (its four bank questions)');

    const a = rec({ stars: [3, 1, 2, 0, 0, 0, 0, 0, 0], paid: [3, 0, 2, 0, 0, 0, 0, 0, 0], tried: [1, 0, 1, 0, 0, 0, 0, 0, 0], seen: ['sea-port', 'sea-bow'] });
    const b = rec({ stars: [2, 2, 1, 1, 0, 0, 0, 0, 0], paid: [2, 2, 1, 0, 0, 0, 0, 0, 0], tried: [1, 1, 0, 0, 0, 0, 0, 0, 0], seen: ['sea-bow', 'life-crab'] });
    const m = Q.mergeQuiz(a, b);
    check(same(m.stars, [3, 2, 2, 1, 0, 0, 0, 0, 0]) && same(m.paid, [3, 2, 2, 0, 0, 0, 0, 0, 0]) && same(m.tried, [1, 1, 1, 0, 0, 0, 0, 0, 0]) && same(m.seen, ['life-crab', 'sea-port', 'sea-bow']), `mergeQuiz: stars and paid the larger, tried or-ed, seen merged (${show(m)})`);
    const m2 = Q.mergeQuiz(b, a);
    check(same(m.stars, m2.stars) && same(m.paid, m2.paid) && same(m.tried, m2.tried) && Q.mergeQuiz(m, Q.defaultQuiz()).stars.every((s, i) => s === m.stars[i]), 'merging never lowers anything, whichever tab goes first');
    const big = Q.mergeQuiz(rec({ seen: IDS.slice(0, 60) }), rec({ seen: IDS.slice(60, 120) }));
    check(big.seen.length === 60 && same(big.seen, IDS.slice(0, 60)), 'the merged seen list is capped at 60, this tab\'s newest kept');
  }

  // ------------------------------------------------------------------ parseQuiz: junk -> the default
  {
    const DEFAULT = Q.defaultQuiz();
    const d2 = Q.defaultQuiz();
    d2.stars[0] = 3;
    check(same(DEFAULT, { v: 1, stars: zeros(), paid: zeros(), tried: zeros(), seen: [] }) && Q.defaultQuiz().stars[0] === 0, 'defaultQuiz: nine islands with nothing, a fresh object every call');
    const parse = (raw, known) => {
      try {
        const r = Q.parseQuiz(raw, known);
        const okShape = same(Object.keys(r), ['v', 'stars', 'paid', 'tried', 'seen']) && r.v === 1 && ['stars', 'paid', 'tried'].every((k) => Array.isArray(r[k]) && r[k].length === N && r[k].every((n) => Number.isInteger(n) && !Object.is(n, -0)));
        return okShape ? { r } : { error: `bad shape ${show(r)}` };
      } catch (e) {
        return { error: `threw ${e.message}` };
      }
    };
    const hostile = {};
    Object.defineProperty(hostile, 'stars', { enumerable: true, get() { throw new Error('getter'); } });
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const junk = [
      null, undefined, '', ' ', 'garbage', 'garbage{', '{', '}', '{}', '[]', '[1,2,3]', 'null', 'true', 'false', '42', '"str"',
      'NaN', 'Infinity', '1e400', '{"stars":null,"paid":null}', '{"stars":{},"paid":"x","tried":5,"seen":"sea-port"}',
      '{"stars":"333333333"}', '[{"stars":[1]}]', '{"STARS":[1]}', 42, -1, NaN, Infinity, true, false, [], [1, 2], {}, () => 1,
      Symbol('x'), 10n, new Date(0), /x/, new Map(), hostile, proxy, { stars: proxy, seen: proxy }, '\u0000', '\ud800', '{"stars":[1]',
    ];
    const bad = [];
    for (const raw of junk) {
      const p = parse(raw);
      if (p.error) bad.push(`${show(raw)}: ${p.error}`);
      else if (!same(p.r, DEFAULT)) bad.push(`${show(raw)}: ${show(p.r)}`);
    }
    check(bad.length === 0, `parseQuiz: ${junk.length} kinds of junk (missing, garbage, cut short, wrong types, throwing getters, proxies...) all give the default record${bad.length ? ' -> ' + bad.join('; ') : ''}`);

    // Plain integers only, clamped (the parseShipConfig rules).
    let sourceText = false;
    JSON.parse('1', (k, v, ctx) => { sourceText = !!(ctx && typeof ctx.source === 'string'); return v; });
    const starOf = (lit) => {
      const p = parse(`{"stars":[${lit},0,0,0,0,0,0,0,0],"seen":["sea-port"]}`);
      return p.error ? p.error : !same(p.r.seen, ['sea-port']) ? 'lost the seen list' : p.r.stars[0];
    };
    const cases = [
      ['1', 1], ['3', 3], ['0', 0], ['-0', 0], ['99', 3], ['-3', 0], ['"2"', 2], ['" 2 "', 2], ['"1e1"', 0], ['"2.5"', 0], ['"0x2"', 0],
      ['""', 0], ['2.5', 0], ['-0.5', 0], ['1e400', 0], ['123456789012345678901', 0], ['null', 0], ['true', 0], ['[1]', 0], ['{"v":1}', 0],
      ['"Infinity"', 0], ['"NaN"', 0], ['" "', 0], ['"1 2"', 0], ['"+1"', 0], ['"-1"', 0], ['"３"', 0],
      ...(sourceText ? [['1e0', 0], ['1e1', 0], ['2.0', 0], ['3E0', 0]] : []),
    ];
    const badInt = cases.filter(([lit, want]) => starOf(lit) !== want).map(([lit, want]) => `${lit} -> ${starOf(lit)} (want ${want})`);
    check(badInt.length === 0, `parseQuiz: stars must be plain integers, clamped to 0..3 (${cases.length} cases${sourceText ? ', incl. number literals like 1e0 and 2.0' : ''})${badInt.length ? ' -> ' + badInt.join('; ') : ''}`);
    if (!sourceText) console.log('SKIP  this Node cannot see JSON number literals (1e0, 2.0), only their values; those cases were not run');
    const objCases = [
      [1, 1], [5, 3], [-7, 0], [-0, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [2.5, 0], [Number.MAX_SAFE_INTEGER + 2, 0],
      ['1', 1], [' 2 ', 2], ['1e1', 0], [null, 0], [true, 0], [[1], 0], [{ valueOf: () => 1 }, 0], [new Number(1), 0], [1n, 0],
    ];
    const badObj = objCases.filter(([v, want]) => {
      const p = parse({ stars: [v, 0, 0, 0, 0, 0, 0, 0, 0], paid: [v, 0, 0, 0, 0, 0, 0, 0, 0], tried: [v, 0, 0, 0, 0, 0, 0, 0, 0] });
      return p.error || p.r.stars[0] !== want || p.r.paid[0] !== want || p.r.tried[0] !== Math.min(1, want);
    }).map(([v, want]) => `${show(v)} (want ${want})`);
    check(badObj.length === 0, `parseQuiz on a record object: the same integer rules for stars, paid and tried (NaN, ±Infinity, 2.5, -0, too big, boxed numbers, BigInt...)${badObj.length ? ' -> ' + badObj.join('; ') : ''}`);

    // The star chain, paid ≤ stars, tried 0/1, field by field.
    const chain = parse({ stars: [2, 3, 0, 3, 1, 0, 0, 0, 0], paid: [3, 1, 0, 2, 0, 0, 0, 0, 0], tried: [1, 7, -1, '1', 0, 0, 0, 0, 1] });
    check(!chain.error && same(chain.r.stars, [2, 3, 0, 0, 0, 0, 0, 0, 0]) && same(chain.r.paid, [2, 1, 0, 0, 0, 0, 0, 0, 0]) && same(chain.r.tried, [1, 1, 0, 1, 0, 0, 0, 0, 1]), `the star chain (island 4's stars after a gap are lowered to 0), paid ≤ stars, tried 0/1 (${show(chain.r || chain.error)})`);
    const short = parse('{"stars":[1,2],"paid":[1],"tried":[1],"seen":[]}');
    const long = parse({ stars: Array(50).fill(3), paid: Array(50).fill(3), tried: Array(50).fill(1) });
    check(!short.error && same(short.r.stars, [1, 2, 0, 0, 0, 0, 0, 0, 0]) && same(short.r.paid, [1, 0, 0, 0, 0, 0, 0, 0, 0]) && !long.error && same(long.r.stars, Array(9).fill(3)), 'short lists are padded with 0, long ones cut to nine islands');
    const holes = parse({ stars: [1, , 2], paid: Object.assign([], { 0: 1 }) }); // eslint-disable-line no-sparse-arrays
    check(!holes.error && same(holes.r.stars, zeros().map((z, i) => (i === 0 ? 1 : 0))), 'holes in a list read 0 (and break the chain)');

    // seen: known ids only, newest copy of each, at most 60.
    const known = new Set(IDS);
    const s1 = parse({ seen: ['sea-port', 'nope-id', 'sums-1-add-coins-3-4', 'sea-bow', 'sea-port', 7, null, 'life-crab', '__proto__', 'constructor', 'toString'] }, IDS);
    check(!s1.error && same(s1.r.seen, ['sea-bow', 'sea-port', 'life-crab']), `seen: known ids only, the newest copy of each (${show(s1.r && s1.r.seen)})`);
    const s2 = parse({ seen: ['sea-port', 'sea-made-up', 'sums-1-add-coins-3-4', 'Sea-Port'] });
    const s3 = parse({ seen: ['sea-port', 'sea-made-up'] }, known);
    const s4 = parse({ seen: ['sea-port', 'sea-made-up'] }, QUESTIONS);
    const s5 = parse({ seen: ['sea-port'] }, []);
    check(same(s2.r.seen, ['sea-port', 'sea-made-up']) && same(s3.r.seen, ['sea-port']) && same(s4.r.seen, ['sea-port']) && same(s5.r.seen, []), 'without knownIds any well-formed bank id is kept; knownIds may be ids, a Set or the bank itself');
    const s6 = parse({ seen: [...IDS, ...IDS.slice(0, 5)] }, IDS);
    check(!s6.error && s6.r.seen.length === 60 && same(s6.r.seen, [...IDS.slice(65), ...IDS.slice(0, 5)]), 'at most 60 seen ids, the oldest dropped');
    const s7 = parse({ seen: Array(100000).fill('sea-port') }, IDS);
    check(!s7.error && same(s7.r.seen, ['sea-port']), 'a huge seen list is read quickly and safely');

    // Extra fields, prototype tricks, size.
    const extra = parse('{"v":7,"stars":[1],"gold":99999,"paid":[0],"tried":[0],"seen":[],"hack":true}');
    check(!extra.error && same(extra.r, { ...DEFAULT, stars: [1, 0, 0, 0, 0, 0, 0, 0, 0] }), `unknown fields are dropped, v is always 1 (${show(extra.r || extra.error)})`);
    const p = parse('{"__proto__":{"polluted":1,"stars":[3]},"stars":{"__proto__":[3]},"constructor":{"prototype":{"polluted":1}}}');
    const polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined || [].polluted !== undefined;
    check(!p.error && same(p.r, DEFAULT) && !polluted, `__proto__ / constructor tricks give the default and pollute nothing (${show(p.r || p.error)})`);
    const inherited = parse(Object.create({ stars: [3, 3, 3, 3, 3, 3, 3, 3, 3] }));
    check(!inherited.error && same(inherited.r, DEFAULT), 'inherited (non-own) fields are ignored');
    const times = [];
    const timed = (raw) => {
      const t0 = process.hrtime.bigint();
      const res = parse(raw);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return res;
    };
    const valid = JSON.stringify({ v: 1, stars: [3, 2, 0, 0, 0, 0, 0, 0, 0], paid: zeros(), tried: zeros(), seen: [] });
    const huge = [
      ['2 MB of garbage', 'x'.repeat(2e6), DEFAULT],
      ['a record padded past 8 KB', valid.slice(0, -1) + ',"pad":"' + 'a'.repeat(8 * 1024) + '"}', DEFAULT],
      ['100k nested arrays', '['.repeat(1e5) + ']'.repeat(1e5), DEFAULT],
      ['50k nested objects', '{"stars":'.repeat(5e4) + '1' + '}'.repeat(5e4), DEFAULT],
      ['a deep object in a star', `{"stars":[${'{"a":'.repeat(2000)}1${'}'.repeat(2000)}]}`, DEFAULT],
      ['a record just under 8 KB', valid.slice(0, -1) + ',"pad":"' + 'a'.repeat(8 * 1024 - valid.length - 10) + '"}', JSON.parse(valid)],
    ];
    const badHuge = [];
    for (const [name, raw, want] of huge) {
      const res = timed(raw);
      if (res.error) badHuge.push(`${name}: ${res.error}`);
      else if (!same(res.r, want)) badHuge.push(`${name}: ${show(res.r)}`);
    }
    check(badHuge.length === 0 && Math.max(...times) < 1000, `records over 8 KB are refused; huge and deeply nested input gives a valid record quickly (slowest ${Math.max(...times).toFixed(1)} ms)${badHuge.length ? ' -> ' + badHuge.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ serialize / parse round trips
  {
    const spec = '{"v":1,"stars":[0,0,0,0,0,0,0,0,0],"paid":[0,0,0,0,0,0,0,0,0],"tried":[0,0,0,0,0,0,0,0,0],"seen":["life-octopus-hearts"]}';
    check(Q.serializeQuiz(Q.parseQuiz(spec, IDS)) === spec, 'the §10.1 example record round trips byte for byte');
    const rand = Q.rng(2024);
    const bad = [];
    for (let k = 0; k < 3000; k++) {
      const stars = zeros();
      const reach = Math.floor(rand() * 10);
      for (let i = 0; i < reach && i < N; i++) stars[i] = 1 + Math.floor(rand() * 3);
      const paid = stars.map((s) => Math.floor(rand() * (s + 1)));
      const tried = stars.map(() => (rand() < 0.5 ? 1 : 0));
      const seen = [...new Set(Array.from({ length: Math.floor(rand() * 61) }, () => IDS[Math.floor(rand() * IDS.length)]))];
      const r = { v: 1, stars, paid, tried, seen };
      const text = Q.serializeQuiz(r);
      const back = Q.parseQuiz(text, IDS);
      if (text !== JSON.stringify(r) || !same(back, r) || Q.serializeQuiz(back) !== text) bad.push(text);
    }
    check(bad.length === 0, `serialize -> parse round trips 3,000 random valid records${bad.length ? ' -> ' + bad.slice(0, 2).join('; ') : ''}`);
    let text;
    let threw = '';
    try {
      text = [null, 'garbage', { stars: [5, 1, 1], paid: [9], seen: ['sea-port', 'sea-port', 'x'] }, Symbol('x')].map((v) => Q.serializeQuiz(v));
    } catch (e) {
      threw = e.message;
    }
    check(!threw && text[0] === JSON.stringify(Q.defaultQuiz()) && text[2] === '{"v":1,"stars":[3,1,1,0,0,0,0,0,0],"paid":[3,0,0,0,0,0,0,0,0],"tried":[0,0,0,0,0,0,0,0,0],"seen":["sea-port"]}', `serializeQuiz validates before writing (${threw || text[2]})`);
  }

  // ------------------------------------------------------------------ purity and the rng
  {
    const src = sources['src/quiz.js'];
    check(!/Math\.random/.test(src) && !/\bDate\b/.test(src) && !/localStorage|document|window/.test(src), 'quiz.js uses only its own seeded rng (no Math.random, no clock, no storage, no DOM)');
    const r1 = Q.rng(42);
    const r2 = Q.rng(42);
    const a = Array.from({ length: 1000 }, () => r1());
    const b = Array.from({ length: 1000 }, () => r2());
    let junkOk = true;
    for (const s of [undefined, null, 'x', NaN, -1, 2 ** 40, Symbol('x'), {}, 10n]) {
      try {
        const v = Q.rng(s)();
        if (!(v >= 0 && v < 1)) junkOk = false;
      } catch {
        junkOk = false;
      }
    }
    check(same(a, b) && a.every((v) => v >= 0 && v < 1) && new Set(a).size > 990 && junkOk, 'rng(seed) is mulberry32: repeatable, 0 ≤ n < 1, any seed accepted');
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll quiz checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
