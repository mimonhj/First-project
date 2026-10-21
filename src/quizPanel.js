// The Riddle Bell's panel (SPEC3 §7.3) in #quiz-screen: the map of nine islands, a question with its 3–4
// answers (keys 1–4), the lifebuoy, the answer with its fun fact, the results. Non-modal like the tavern;
// styles in town.css. townMode.js creates it for its view 'quiz'.
//
// createQuizPanel({ root, ctx }) → { open(), close(), onKey(e, down) → handled, refresh(), get active, api }
//
// root: the #quiz-screen section (its ids are looked up inside it, then in the document; a missing one is
//   replaced by a detached element, so a partial page never throws).
// ctx (every member optional; a throwing member counts as missing):
//   quiz: { record() → the quiz record (parsed with parseQuiz here),
//           save(rec, gold, info) → { ok, reason? } | boolean }
//     The panel works out the reward (quiz.js reward / markPaid / noteSeen) and hands main the record as it is
//     once everything is paid (`rec`: stars raised, paid = stars, tried set) and the gold to add. Main writes
//     the record first and the chest second (SPEC3 §0.1, §10.2); if the chest can't be written it writes
//     `info.fallback` (the same stars, the old paid and tried) so the gold stays owed. `info` is
//     { kind: 'round' | 'owed', fallback, level, goodTry, newStars }. A failed save keeps the stars for the
//     visit in main's memory; record() is read again after every save.
//   purse() → gold, unlocked() → the highest level reached (1..9; places questions wait for their sea),
//   hints() → lifebuoys a round (the Sea School; else perks(island.state()).hints), island: { state() },
//   bank → the question list (default quizBank.js QUESTIONS), seed() → a round's seed (default: the clock),
//   audio: { play(name, opts) }, reducedMotion() → boolean,
//   back() → leave the panel for the town (townMode.back(); Back to town, and Esc on the map),
//   react(what, info) → the 3D set's moment: 'open', 'question', 'right' (the professor rings the bell,
//     Quizzle flaps), 'wrong' (Quizzle tilts his head), 'lifebuoy', 'results' ({ stars, gold }), 'map'.
//
// Keys (onKey, while the panel is up): 1–4 (Digit or Numpad) answer, H throws a lifebuoy, Esc goes back a
// step (a round to the map, "Your stars are safe"; the map to the town). Enter and Space press the focused
// button (the browser's own); a held one never presses twice. Pointer double taps never press the control
// that appears under the finger.
import * as Q from './quiz.js';
import * as BANK from './quizBank.js';
import * as ISLAND from './island.js';

const INK = 'stroke="#1d1330" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const CHEST_SVG =
  '<svg class="chest-ico" viewBox="0 0 32 28" aria-hidden="true" focusable="false"><path d="M3.5 12.5C3.5 6 8 3.5 16 3.5S28.5 6 28.5 12.5z" fill="#c07b3a" />' +
  '<rect x="3.5" y="12.5" width="25" height="12.5" rx="2.5" fill="#8b5a2b" /><path d="M9 3.9v8.6M23 3.9v8.6M9 12.5V25M23 12.5V25" stroke-width="2.6" stroke="#ffc93c" />' +
  '<rect x="12.6" y="10" width="6.8" height="7.6" rx="1.8" fill="#ffc93c" /><circle cx="16" cy="13.4" r="1.2" fill="#1d1330" stroke="none" /></svg>';
// The islands' colours by band: lagoon, sand, palm
const BAND_ART = {
  1: ['#8fd3ff', '#f3d58a', '#5cbf60'],
  2: ['#7fdcc9', '#f7b9a2', '#3fae7a'],
  3: ['#a9b3ef', '#cfc6b4', '#4f9a63'],
};
const islandSvg = (band) => {
  const [sea, sand, leaf] = BAND_ART[band] || BAND_ART[1];
  return (
    `<svg viewBox="0 0 48 34" aria-hidden="true" focusable="false"><g ${INK}>` +
    `<ellipse cx="24" cy="27" rx="21.5" ry="5.6" fill="${sea}"/>` +
    `<path d="M8.5 27c1.6-5.4 7.8-8.6 15.5-8.6s13.9 3.2 15.5 8.6c-4.4 1.6-9.6 2.3-15.5 2.3S12.9 28.6 8.5 27z" fill="${sand}"/>` +
    '<path d="M26.6 19.4c-.4-4.8.4-8.8 2.6-12.2" fill="none" stroke-width="3.6"/><path d="M26.6 19.4c-.4-4.8.4-8.8 2.6-12.2" fill="none" stroke="#a0662f" stroke-width="1.6"/>' +
    `<path d="M29.2 7.2c-3.4-3-8.6-2.6-11 .8 3.8-.8 7.4-.4 11-.8zM29.2 7.2c2.6-3.8 7.6-4.4 11-1.4-3.8-.2-7.2.2-11 1.4zM29.2 7.2c-.6 3.8-3.4 6.4-7 7.4 1.8-3 4-5.4 7-7.4zM29.2 7.2c2.2 2.8 5.8 4.4 9.4 4.4-2.8-2-6-3.6-9.4-4.4z" fill="${leaf}"/>` +
    '</g><path d="M13 30.4c3.4.9 7 1.2 11 1.2" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".85"/></svg>'
  );
};
const LOCK_SVG =
  '<svg class="qi-lock" viewBox="0 0 12 14" aria-hidden="true" focusable="false"><path d="M3.2 6V4.4a2.8 2.8 0 0 1 5.6 0V6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<rect x="1.4" y="6" width="9.2" height="7" rx="1.6" fill="currentColor"/></svg>';
// Quizzle, the professor's green-and-yellow macaw
const QUIZZLE_SVG =
  `<svg viewBox="0 0 44 44" aria-hidden="true" focusable="false"><g ${INK}>` +
  '<path d="M15.5 6.4c-1.2-3 .6-5 3.2-4.4-.2 1.8.6 3 2 4z" fill="#3fbf5f"/>' +
  '<path d="M9 41c-3.6-9.4-2.6-21.6 4.8-28.6 5.8-5.4 15.4-5 19 1.6 3.2 5.8 1.8 13.6-3.4 19.4C25.8 37.4 18 40.6 9 41z" fill="#3fbf5f"/>' +
  '<path d="M12.6 39.4c-.6-6.8 3.4-12.6 10-14.4 4.2-1.2 7.6.4 8.2 3.2-2.6 6.2-9.2 10.6-18.2 11.2z" fill="#ffd23c"/>' +
  '<path d="M30.4 12.8c5.6-1.4 10.4 1.6 10.8 7.2.2 3.2-1.6 5.6-4.4 5.6.8-2.6.2-5-2.2-6.2-1.6 1.4-3.4 1.8-5.4 1.2z" fill="#fffaf0"/>' +
  '<path d="M29.6 20.6c1.8 1 3.8 1 5.4-.2.4 1.6 0 3-1.4 3.8-1.6-.4-3-1.6-4-3.6z" fill="#2b2433"/>' +
  '<ellipse cx="24.4" cy="15.4" rx="4.4" ry="4.2" fill="#fff"/></g>' +
  '<circle cx="25.4" cy="15.6" r="1.9" fill="#1d1330"/><circle cx="26" cy="14.9" r=".6" fill="#fff"/>' +
  '<path d="M17.4 19.6c1.2 1 2.6 1.4 4 1.2" fill="none" stroke="#1d1330" stroke-width="1.2" stroke-linecap="round"/></svg>';
const BUOY_SVG =
  '<svg class="buoy" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7.2" fill="none" stroke="#fff" stroke-width="5"/>' +
  '<circle cx="12" cy="12" r="7.2" fill="none" stroke="#e2383d" stroke-width="5" stroke-dasharray="5.65 5.65" stroke-dashoffset="2.8"/>' +
  '<circle cx="12" cy="12" r="9.9" fill="none" stroke="#1d1330" stroke-width="1.8"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#1d1330" stroke-width="1.8"/></svg>';
const STAR_PATH = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z';
const starSvg = (on) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${STAR_PATH}" fill="${on ? '#ffc93c' : '#fffaf0'}" stroke="#1d1330" stroke-width="${on ? 1.8 : 1.6}" stroke-linejoin="round"${on ? '' : ' stroke-dasharray="2.2 1.8"'}/>` +
  (on ? '<path d="M9.4 8.6l1.4-2.6" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>' : '') +
  '</svg>';

const STAR_WORDS = ['no stars yet', '1 of 3 stars', '2 of 3 stars', '3 of 3 stars'];
const NUMBER_WORDS = ['no', 'one', 'two', 'three'];
const GUARD = 350; // ms: the second tap of a double tap never presses the control that appears under it
const STAMP = 450; // ms between the results' stars
const GOOD_TRY = Number.isFinite(Q.GOOD_TRY) ? Q.GOOD_TRY : 10;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const now = () => (globalThis.performance ? performance.now() : Date.now());

export function createQuizPanel({ root = null, ctx = null } = {}) {
  const C = ctx && typeof ctx === 'object' ? ctx : {};
  const R = root || (typeof document !== 'undefined' ? document.getElementById('quiz-screen') : null) || document.createElement('section');
  const $ = (id, tag = 'div') => (R.querySelector && R.querySelector(`#${id}`)) || document.getElementById(id) || document.createElement(tag);
  const el = {
    root: R,
    panel: $('quiz-panel'),
    title: $('quiz-title', 'h2'),
    chest: $('quiz-chest', 'p'),
    map: $('quiz-map'),
    question: $('quiz-question'),
    answers: $('quiz-answers'),
    buoy: $('quiz-lifebuoy', 'button'),
    results: $('quiz-results'),
    next: $('quiz-next-btn', 'button'),
    leave: $('quiz-leave-btn', 'button'),
    back: $('quiz-back-btn', 'button'),
    live: $('quiz-live', 'p'),
  };
  el.head = el.panel.querySelector('.dock-head') || document.createElement('header');
  el.kicker = el.head.querySelector('.dock-kicker') || document.createElement('p');
  el.body = el.panel.querySelector('.dock-body') || el.panel;
  el.exits = el.panel.querySelector('.dock-exits') || null;

  // ---- ctx helpers ----
  const call = (fn, ...a) => {
    try {
      return typeof fn === 'function' ? fn(...a) : undefined;
    } catch (err) {
      console.error(err); // eslint-disable-line no-console
      return undefined;
    }
  };
  const has = (name) => typeof Q[name] === 'function';
  const levels = () => (Array.isArray(Q.QUIZ_LEVELS) ? Q.QUIZ_LEVELS : []);
  const record = () => {
    const raw = C.quiz ? call(C.quiz.record && C.quiz.record.bind(C.quiz)) : undefined;
    return has('parseQuiz') ? Q.parseQuiz(raw ?? null) : raw || null;
  };
  const bank = () => (Array.isArray(C.bank) ? C.bank : Array.isArray(BANK.QUESTIONS) ? BANK.QUESTIONS : []);
  const purse = () => {
    const p = call(C.purse);
    return Number.isFinite(p) ? Math.max(0, Math.floor(p)) : 0; // whole gold, as the chest shows it
  };
  const unlocked = () => {
    const u = call(C.unlocked);
    return Number.isInteger(u) ? Math.max(1, Math.min(9, u)) : 1;
  };
  const hintsPerRound = () => {
    let h = call(C.hints);
    if (!Number.isInteger(h) && C.island && typeof ISLAND.perks === 'function') {
      const p = call(ISLAND.perks, call(C.island.state && C.island.state.bind(C.island)));
      h = p && p.hints;
    }
    return Number.isInteger(h) ? Math.max(0, Math.min(3, h)) : 0;
  };
  const reduced = () => {
    const r = call(C.reducedMotion);
    if (typeof r === 'boolean') return r;
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  };
  const sfx = (name, opts) => C.audio && call(C.audio.play && C.audio.play.bind(C.audio), name, opts);
  const react = (what, info) => call(C.react, what, info);
  const openCount = (rec) => (has('openLevels') ? Q.openLevels(rec) : 1);
  const show = (node, on) => {
    if (!node) return;
    node.classList.toggle('hidden', !on);
    if (!on && node.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  const focus = (node) => {
    if (node && node.focus) node.focus({ preventScroll: false });
  };
  function announce(text) {
    if (!text) return;
    el.live.textContent = el.live.textContent === text ? `${text} ` : text;
  }
  function save(rec, gold, info) {
    const fn = C.quiz && C.quiz.save;
    if (typeof fn !== 'function') return { ok: false, reason: 'storage' };
    const r = call(fn.bind(C.quiz), rec, gold, info);
    if (r === true || (r && r.ok === true)) return { ok: true };
    return { ok: false, reason: (r && r.reason) || 'storage' };
  }

  // ---- state ----
  let active = false;
  let mode = 'map'; // 'map' | 'question' | 'answered' | 'results'
  let modeAt = -Infinity; // when the current controls appeared (the double-tap guard)
  let level = 0; // the island (index into QUIZ_LEVELS)
  let round = []; // makeRound's five questions
  let index = 0;
  let picks = [];
  let correct = 0;
  let removed = new Set(); // this question's answers taken away by lifebuoys
  let buoys = 0; // lifebuoys left this round
  let buoysMax = 0;
  let result = null; // the last round's results
  let note = null; // { text, kind } a line over the map
  let seedCount = 0;
  let timers = [];
  const recent = []; // ids asked this visit and not yet in the saved `seen` list
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers = timers.filter((t) => t !== id);
      fn();
    }, ms);
    timers.push(id);
  };
  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers = [];
  };

  // ---------------------------------------------------------------------------------------------
  // Static DOM
  // ---------------------------------------------------------------------------------------------
  el.chest.innerHTML = `${CHEST_SVG}<span><span class="chest-label">Treasure chest: </span><b id="quiz-chest-gold">0</b> gold</span>`;
  el.chest.classList.add('dock-chest');
  const chestGold = el.chest.querySelector('b');
  const kickerText = el.kicker.textContent || 'Quiz';
  // the lifebuoy sits in the footer with Leave quiz (the body keeps its room for the answers)
  if (el.exits && el.buoy.parentNode !== el.exits) el.exits.insertBefore(el.buoy, el.leave.parentNode === el.exits ? el.leave : null);
  el.buoy.innerHTML = `${BUOY_SVG}<span class="qb-word">Lifebuoy</span>`;
  el.buoy.setAttribute('aria-keyshortcuts', 'H');
  el.next.innerHTML = 'Next <span aria-hidden="true">&#9654;</span>';
  el.panel.classList.add('quiz-panel');
  el.question.setAttribute('tabindex', '-1');
  // How it went and the fun fact: under the answers, so nothing moves under the finger when it appears
  el.feedback = R.querySelector('#quiz-feedback') || document.createElement('div');
  el.feedback.id = 'quiz-feedback';
  el.feedback.className = 'quiz-feedback hidden';
  if (el.feedback.parentNode !== el.body) {
    if (el.answers.parentNode === el.body) el.body.insertBefore(el.feedback, el.answers.nextSibling);
    else el.body.appendChild(el.feedback);
  }

  // ---------------------------------------------------------------------------------------------
  // Modes
  // ---------------------------------------------------------------------------------------------
  function setMode(m) {
    mode = m;
    modeAt = now();
    const inRound = m === 'question' || m === 'answered';
    el.panel.classList.toggle('in-round', inRound);
    el.panel.dataset.mode = m;
    el.kicker.textContent = inRound || m === 'results' ? (levels()[level] || {}).name || kickerText : kickerText;
    show(el.map, m === 'map');
    show(el.question, inRound);
    show(el.answers, inRound);
    show(el.feedback, m === 'answered');
    show(el.results, m === 'results');
    show(el.buoy, m === 'question' && buoysMax > 0);
    show(el.next, m === 'answered');
    show(el.leave, inRound);
    show(el.back, m === 'map' || m === 'results');
    el.body.scrollTop = 0;
  }

  function renderChest(gold = purse()) {
    chestGold.textContent = String(gold);
  }
  function bumpChest() {
    el.chest.classList.remove('bump');
    void el.chest.offsetWidth; // restart the animation
    el.chest.classList.add('bump');
  }

  // ----- the map -----
  function renderMap() {
    const rec = record();
    const open = openCount(rec);
    const L = levels();
    const stars = rec && Array.isArray(rec.stars) ? rec.stars : [];
    const total = stars.reduce((a, b) => a + (b | 0), 0);
    const passed = stars.filter((s) => s > 0).length;
    let html = '<div class="quiz-intro">';
    html += '<p class="qm-hello">Pick an island! Five questions, no timer: take your time.</p>';
    html += `<p class="qm-tally"><span class="qm-star" aria-hidden="true">${starSvg(true)}</span><span>${total} of ${L.length * 3} stars · ${passed} of ${L.length} islands</span></p>`;
    html += '</div>';
    if (note) html += `<p class="quiz-note ${note.kind || ''}" role="note">${esc(note.text)}</p>`;
    html += '<ol class="quiz-isles">';
    L.forEach((isl, i) => {
      const s = Math.max(0, Math.min(3, stars[i] | 0));
      const locked = i >= open;
      const row = Math.floor(i / 3);
      const col = row % 2 ? 2 - (i % 3) : i % 3; // a winding path: left to right, then back
      const link = i === L.length - 1 ? 'end' : i % 3 === 2 ? 'down' : row % 2 ? 'left' : 'right';
      const why = locked ? `Pass ${L[i - 1] ? L[i - 1].name : 'the island before'} first` : '';
      const cls = ['quiz-isle', `band-${isl.band}`, locked ? 'locked' : 'open', s === 3 ? 'done' : '', !locked && i === open - 1 ? 'current' : ''].filter(Boolean).join(' ');
      html +=
        `<li class="qi" data-link="${link}" style="--r:${row + 1};--c:${col + 1}">` +
        `<button type="button" class="${cls}" data-level="${i}"${locked ? ` aria-disabled="true" aria-describedby="quiz-why-${i}"` : ''}>` +
        `<span class="qi-art" aria-hidden="true">${islandSvg(isl.band)}${locked ? `<span class="qi-badge">${LOCK_SVG}</span>` : ''}</span>` +
        `<span class="qi-num" aria-hidden="true">${i + 1}</span>` +
        `<span class="qi-name">${esc(isl.name)}</span>` +
        (locked
          ? `<span class="qi-state">${LOCK_SVG}Locked</span><span class="sr-only" id="quiz-why-${i}">${esc(why)}</span>`
          : `<span class="qi-stars" aria-hidden="true">${[0, 1, 2].map((k) => starSvg(k < s)).join('')}</span><span class="qi-state">${esc(STAR_WORDS[s])}</span>`) +
        '</button></li>';
    });
    html += '</ol>';
    html += '<p class="qm-prize">Pass all nine for the Professor\'s mortarboard!</p>';
    el.map.innerHTML = html;
  }
  function mapButton(i) {
    return el.map.querySelector(`[data-level="${i}"]`);
  }
  function toMap({ focusLevel = null, say = '' } = {}) {
    clearTimers(); // (a coin still in the air lands at once)
    renderChest();
    const back = mode !== 'map'; // (from a round or the results: the 3D set goes back to its map pose)
    round = [];
    setMode('map');
    if (back) react('map');
    renderMap();
    const open = openCount(record());
    const i = focusLevel !== null && focusLevel < open ? focusLevel : open - 1;
    focus(mapButton(i));
    if (say) announce(say);
  }

  // ----- a question -----
  function marksHTML() {
    return round
      .map((_, i) => {
        if (i < index || (i === index && mode === 'answered')) {
          const ok = picks[i] === round[i].right;
          return `<i class="${ok ? 'ok' : 'miss'}">${ok ? '&#10003;' : '&bull;'}</i>`;
        }
        return `<i class="${i === index ? 'cur' : ''}">&#9675;</i>`;
      })
      .join('');
  }
  function progressText() {
    const done = mode === 'answered' ? index + 1 : index;
    const right = picks.slice(0, done).filter((p, i) => p === round[i].right).length;
    return `${right} right so far`;
  }
  function renderQuestion() {
    const q = round[index];
    el.question.innerHTML =
      `<div class="quiz-progress"><span class="qp-count">Question ${index + 1} of ${round.length}</span>` +
      `<span class="qp-marks" aria-hidden="true">${marksHTML()}</span><span class="sr-only">, ${progressText()}</span></div>` +
      `<p class="quiz-q" id="quiz-q-text">${esc(q.q)}</p>`;
    el.answers.innerHTML = q.options
      .map(
        (o, i) =>
          `<button type="button" class="quiz-ans" data-answer="${i}" aria-keyshortcuts="${i + 1}">` +
          `<span class="qa-num" aria-hidden="true">${i + 1}</span><span class="sr-only">${i + 1}, </span>` +
          `<span class="qa-text">${esc(o)}</span><span class="qa-mark" aria-hidden="true"></span><span class="qa-sr sr-only"></span></button>`,
      )
      .join('');
    el.answers.setAttribute('role', 'group');
    el.answers.setAttribute('aria-labelledby', 'quiz-q-text');
    el.answers.dataset.count = String(q.options.length);
    renderBuoy();
  }
  function renderBuoy() {
    const word = el.buoy.querySelector('.qb-word');
    const q = round[index];
    const can = buoys > 0 && q && has('hint') && Q.hint(q, [...removed]) !== null;
    word.textContent = `Lifebuoy (${buoys} left)`;
    el.buoy.setAttribute('aria-disabled', String(!can));
    // (greyed with lifebuoys left: quiz.js hint() keeps two answers to choose from, so it says why)
    el.buoy.title = buoys <= 0 ? 'No lifebuoys left this round' : can ? 'Takes away one wrong answer (H)' : 'Only two answers left: no lifebuoy needed';
  }
  function answerButtons() {
    return [...el.answers.querySelectorAll('.quiz-ans')];
  }
  function showRemoved() {
    for (const b of answerButtons()) {
      const i = Number(b.dataset.answer);
      if (!removed.has(i)) continue;
      b.classList.add('gone');
      b.setAttribute('aria-disabled', 'true');
      b.querySelector('.qa-mark').innerHTML = BUOY_SVG;
      b.querySelector('.qa-sr').textContent = ' (taken away by the lifebuoy)';
    }
  }
  function startQuestion() {
    removed = new Set();
    setMode('question');
    renderQuestion();
    const q = round[index];
    const id = q && q.id;
    if (id && !id.startsWith('sums-')) {
      const k = recent.indexOf(id);
      if (k >= 0) recent.splice(k, 1);
      recent.push(id);
      if (recent.length > 60) recent.splice(0, recent.length - 60);
    }
    focus(el.question);
    announce(`Question ${index + 1} of ${round.length}. ${q.q} Answers: ${q.options.map((o, i) => `${i + 1}, ${o}.`).join(' ')}`);
    react('question', { index, level });
  }

  // ----- answering -----
  function answer(i) {
    if (!active || mode !== 'question') return false;
    const q = round[index];
    if (!q || !Number.isInteger(i) || i < 0 || i >= q.options.length) return false;
    if (removed.has(i)) {
      announce(`${q.options[i]} was taken away by the lifebuoy. Pick another answer!`);
      return false;
    }
    picks[index] = i;
    const ok = i === q.right;
    if (ok) correct++;
    setMode('answered');
    const right = q.options[q.right];
    for (const b of answerButtons()) {
      const k = Number(b.dataset.answer);
      b.setAttribute('aria-disabled', 'true');
      if (k === q.right) {
        b.classList.add('right');
        b.querySelector('.qa-mark').innerHTML = '&#10003;';
        b.querySelector('.qa-sr').textContent = ' (the right answer)';
      } else if (k === i) {
        b.classList.add('picked');
        b.querySelector('.qa-mark').innerHTML = '<span class="qa-pick">your pick</span>';
        b.querySelector('.qa-sr').textContent = ' (your answer)';
      }
    }
    el.question.querySelector('.qp-marks').innerHTML = marksHTML();
    el.question.querySelector('.qp-count + .qp-marks + .sr-only').textContent = `, ${progressText()}`;
    const fb = el.feedback;
    fb.className = `quiz-feedback ${ok ? 'good' : 'oops'}`;
    fb.innerHTML =
      `<span class="qf-bird" aria-hidden="true">${QUIZZLE_SVG}</span>` +
      (ok ? '<p class="qf-say"><b>Right you are!</b></p>' : `<p class="qf-say"><b>Not quite!</b> It's ${esc(right)}.</p>`) +
      (q.fact ? `<p class="qf-fact"><span class="qf-label">Fun fact:</span> ${esc(q.fact)}</p>` : '');
    if (ok) {
      sfx('bell');
      later(() => sfx('squawk'), 380);
    } else sfx('bonk');
    react(ok ? 'right' : 'wrong', { index, level, answer: i, right: q.right });
    focus(el.next);
    // (a short panel scrolls the fact into view; the answers stay where they were). A smooth scroll that a
    // busy frame cut short is finished at once.
    if (fb.scrollIntoView) {
      fb.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      const at = index;
      later(() => {
        if (mode !== 'answered' || index !== at) return;
        const b = el.body.getBoundingClientRect();
        const f = fb.getBoundingClientRect();
        if (f.bottom > b.bottom + 1 || f.top < b.top - 1) fb.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }, 800);
    }
    announce(`${ok ? 'Right!' : `Not quite. The answer is ${right}.`}${q.fact ? ` ${q.fact}` : ''}`);
    return true;
  }

  function useBuoy() {
    if (!active || mode !== 'question') return false;
    const q = round[index];
    if (buoys <= 0) {
      announce(buoysMax > 0 ? 'No lifebuoys left this round.' : 'No lifebuoys yet: build the Sea School!');
      return false;
    }
    const k = has('hint') ? Q.hint(q, [...removed], has('rng') ? Q.rng((index + 1) * 7919 + removed.size) : undefined) : null;
    if (k === null || k === undefined) {
      announce('Only two answers left: you can do it!');
      return false;
    }
    removed.add(k);
    buoys--;
    showRemoved();
    renderBuoy();
    sfx('splash', { volume: 0.5 });
    react('lifebuoy', { index, removed: k });
    announce(`Lifebuoy! ${q.options[k]} is gone. ${buoys} lifebuoy${buoys === 1 ? '' : 's'} left.`);
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains('gone')) focus(answerButtons().find((b) => !b.classList.contains('gone')));
    return true;
  }

  function next() {
    if (!active || mode !== 'answered') return false;
    index++;
    if (index >= round.length) finish();
    else startQuestion();
    return true;
  }

  // ----- a round -----
  function nextSeed() {
    const s = call(C.seed);
    if (Number.isFinite(s)) return s >>> 0;
    seedCount++;
    return ((Date.now() >>> 0) ^ Math.imul(seedCount, 0x9e3779b1)) >>> 0;
  }
  function start(lv, seed) {
    if (!active) return false;
    const L = levels();
    const rec = record();
    const open = openCount(rec);
    if (!Number.isInteger(lv) || lv < 0 || lv >= L.length) return false;
    if (lv >= open) {
      const why = `${L[lv].name} is locked. Pass ${L[lv - 1].name} first!`;
      note = { text: why, kind: 'warn' };
      if (mode === 'map') {
        renderMap();
        focus(mapButton(lv));
      }
      announce(why);
      return false;
    }
    if (!has('makeRound')) return false;
    const r = Q.makeRound(bank(), lv, Number.isFinite(seed) ? seed >>> 0 : nextSeed(), { unlocked: unlocked(), seen: rec.seen || [], recent: recent.slice() });
    if (!Array.isArray(r) || !r.length) return false;
    clearTimers();
    level = lv;
    round = r;
    index = 0;
    picks = [];
    correct = 0;
    result = null;
    note = null;
    buoysMax = hintsPerRound();
    buoys = buoysMax;
    startQuestion();
    return true;
  }

  function finish() {
    const L = levels();
    const won = has('stars') ? Q.stars(correct) : 0;
    const before = record();
    const openBefore = openCount(before);
    const ids = round.map((q) => q.id);
    const seen = has('noteSeen') ? Q.noteSeen(before, ids) : before;
    let r = { gold: 0, rec: seen, newStars: 0, goodTry: false };
    if (has('reward')) r = Q.reward(seen, level, won) || r;
    const target = has('markPaid') ? Q.markPaid(r.rec, level, r.goodTry) : r.rec;
    const saved = save(target, r.gold, { kind: 'round', fallback: r.rec, level, goodTry: r.goodTry, newStars: r.newStars });
    if (saved.ok) recent.length = 0;
    const after = record();
    const openAfter = openCount(after);
    const best = after && after.stars ? after.stars[level] | 0 : won;
    // this island's new stars' gold (the rest of the star gold was owed from an earlier round)
    const isl = L[level] || {};
    const had = before && before.stars ? before.stars[level] | 0 : 0;
    let newGold = 0;
    for (let k = had + 1; k <= had + (r.newStars | 0); k++) newGold += (k === 1 ? isl.first : isl.later) | 0;
    const starGold = Math.max(0, (r.gold | 0) - (r.goodTry ? GOOD_TRY : 0));
    newGold = Math.min(newGold, starGold);
    result = {
      level,
      correct,
      total: round.length,
      stars: won,
      best,
      newStars: r.newStars | 0,
      goodTry: !!r.goodTry,
      newGold,
      oldGold: starGold - newGold,
      owed: r.gold | 0,
      gold: saved.ok ? r.gold | 0 : 0,
      saved: saved.ok,
      reason: saved.ok ? null : saved.reason,
      opened: openAfter > openBefore && level + 1 < L.length ? level + 1 : null,
      nextOpen: level + 1 < Math.min(openAfter, L.length),
    };
    setMode('results');
    renderResults();
    react('results', { stars: won, gold: result.gold, level });
  }

  function renderResults() {
    const L = levels();
    const R2 = result;
    const isl = L[R2.level] || { name: '' };
    const lines = [];
    const score = `${R2.correct} of ${R2.total} right`;
    let head;
    if (R2.stars === 3) head = `${score}: all three stars!`;
    else if (R2.stars === 2) head = `${score}: two stars!`;
    else if (R2.stars === 1) head = `${score}: a star!`;
    else if (R2.correct === 2) head = 'So close: 2 right! Have another go?';
    else head = `${R2.correct} right this time. Have another go?`;
    if (R2.saved && R2.gold > 0) {
      if (R2.newGold > 0) lines.push(['gold', `+${R2.newGold} gold — ${R2.newStars > 1 ? `${NUMBER_WORDS[R2.newStars] || R2.newStars} new stars` : 'new star'}!`]);
      if (R2.oldGold > 0) lines.push(['gold', `+${R2.oldGold} gold for the stars you won before!`]);
      if (R2.goodTry) lines.push(['gold', `+${GOOD_TRY} gold — Good try!`]);
    } else if (!R2.saved && R2.owed > 0) {
      lines.push(['warn', R2.reason === 'chest' ? "Couldn't save your gold this time. It waits for you!" : "Couldn't save your stars, so no gold this time. Your gold waits for you!"]);
    } else if (R2.stars > 0 && R2.newStars === 0) {
      lines.push(['plain', `No new stars this time. Your best here: ${STAR_WORDS[R2.best]}.`]);
    }
    if (R2.opened !== null) lines.push(['open', `${L[R2.opened].name} is open!`]);
    const stars = [0, 1, 2].map((k) => `<span class="qs${k < R2.stars ? ' on' : ''}" style="--i:${k}">${starSvg(k < R2.stars)}</span>`).join('');
    el.results.innerHTML =
      `<div class="qr-stars${reduced() ? ' calm' : ''}" role="img" aria-label="${esc(STAR_WORDS[R2.stars].replace('no stars yet', 'no stars'))}">${stars}</div>` +
      `<p class="qr-score">${esc(head)}</p>` +
      lines.map(([k, t]) => `<p class="qr-line ${k}">${k === 'gold' ? '<span class="coin" aria-hidden="true"></span>' : ''}${esc(t)}</p>`).join('') +
      '<div class="qr-actions">' +
      (R2.nextOpen ? '<button type="button" class="btn qr-btn" data-act="next-quiz">Next quiz <span aria-hidden="true">&#9654;</span></button>' : '') +
      `<button type="button" class="btn ${R2.nextOpen ? 'alt ' : ''}qr-btn" data-act="again">Play again</button>` +
      '<button type="button" class="btn alt qr-btn" data-act="map">Map</button>' +
      '</div>';
    focus(el.results.querySelector('.qr-btn'));
    // the stars stamp in one by one, then the gold flies to the chest
    const calm = reduced();
    for (let k = 0; k < R2.stars; k++) later(() => sfx('coin', { pitch: 0.9 + k * 0.18, volume: 0.7 }), (calm ? 0 : 160) + k * STAMP);
    if (R2.stars === 3) later(() => sfx('cheer'), 160 + 3 * STAMP);
    if (R2.gold > 0) later(() => flyGold(), calm ? 0 : 180 + Math.max(1, R2.stars) * STAMP);
    else renderChest();
    announce(
      [`Round over at ${isl.name}. ${head}`, ...lines.map(([, t]) => t)]
        .join(' ')
        .replace(/ — /g, ': '),
    );
  }

  // "+80 gold" flies from the results to the chest (a bump under reduced motion)
  function flyGold() {
    const from = el.results.querySelector('.qr-line.gold .coin');
    const to = el.chest.querySelector('.chest-ico');
    if (!reduced() && from && to && typeof from.animate === 'function' && from.getClientRects().length) {
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const coin = document.createElement('span');
      coin.className = 'quiz-coin-fly';
      coin.setAttribute('aria-hidden', 'true');
      coin.style.left = `${a.left}px`;
      coin.style.top = `${a.top}px`;
      document.body.appendChild(coin);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const anim = coin.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 40}px) scale(1.5)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.9 },
        ],
        { duration: 700, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' },
      );
      anim.onfinish = anim.oncancel = () => {
        coin.remove();
        landGold();
      };
      return;
    }
    landGold();
  }
  function landGold() {
    renderChest();
    bumpChest();
    sfx('coin', { pitch: 1.25 });
  }

  // ---------------------------------------------------------------------------------------------
  // Owed gold (§10.2): star gold that couldn't be saved before is paid, once, when the panel opens
  // ---------------------------------------------------------------------------------------------
  function payOwed() {
    if (!has('owed') || !has('markPaid')) return;
    const rec = record();
    const g = Q.owed(rec);
    if (!(g > 0)) return;
    const r = save(Q.markPaid(rec, -1, false), g, { kind: 'owed', fallback: rec, level: -1, goodTry: false, newStars: 0 });
    if (r.ok) {
      note = { text: `+${g} gold for the stars you won last time!`, kind: 'gold' };
      later(() => {
        bumpChest();
        sfx('coin');
      }, 250);
    } else note = { text: `${g} gold is waiting for your stars. It's paid once your browser can save again.`, kind: 'warn' };
  }

  // ---------------------------------------------------------------------------------------------
  // Leaving
  // ---------------------------------------------------------------------------------------------
  function leaveRound() {
    if (mode !== 'question' && mode !== 'answered') return false;
    note = { text: 'You left the quiz. Your stars are safe!', kind: '' };
    toMap({ focusLevel: level, say: 'You left the quiz. Your stars are safe.' });
    return true;
  }
  function goBack() {
    if (mode === 'question' || mode === 'answered') return leaveRound();
    if (mode === 'results') {
      toMap({ focusLevel: result ? result.level : null, say: 'The quiz map.' });
      return true;
    }
    call(C.back);
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------------------------
  const tapTooSoon = (e) => !!e && e.detail > 0 && (e.detail > 1 || now() - modeAt < GUARD);
  el.map.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-level]');
    if (!b || mode !== 'map' || tapTooSoon(e)) return;
    start(Number(b.dataset.level));
  });
  el.answers.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-answer]');
    if (!b || tapTooSoon(e)) return;
    answer(Number(b.dataset.answer));
  });
  el.results.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-act]');
    if (!b || mode !== 'results' || tapTooSoon(e)) return;
    const act = b.dataset.act;
    if (act === 'next-quiz') start(result.level + 1);
    else if (act === 'again') start(result.level);
    else toMap({ focusLevel: result.level, say: 'The quiz map.' });
  });
  el.buoy.addEventListener('click', (e) => {
    if (!tapTooSoon(e)) useBuoy();
  });
  el.next.addEventListener('click', (e) => {
    if (!tapTooSoon(e)) next();
  });
  el.leave.addEventListener('click', (e) => {
    if (!tapTooSoon(e)) leaveRound();
  });
  el.back.addEventListener('click', (e) => {
    if (!tapTooSoon(e)) call(C.back);
  });
  // A held Enter or Space presses a button again on every auto-repeat: one press is one answer (A11Y-2).
  el.panel.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.repeat && e.target instanceof HTMLButtonElement) e.preventDefault();
  });

  function onKey(e, down) {
    if (!active || !e || !down) return false;
    const k = String(e.key || '').toLowerCase();
    if (k === 'escape') {
      e.preventDefault();
      if (!e.repeat) goBack();
      return true;
    }
    if ((k === 'enter' || k === ' ') && e.repeat) {
      e.preventDefault();
      return true;
    }
    if (mode === 'question' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code || '') || /^([1-4])$/.exec(e.key || '');
      if (m) {
        e.preventDefault();
        if (!e.repeat) answer(Number(m[1]) - 1);
        return true;
      }
      if (k === 'h') {
        if (!e.repeat) useBuoy();
        return true;
      }
    }
    if (mode === 'answered' && k === 'enter') {
      const a = document.activeElement;
      if (a instanceof HTMLButtonElement && el.panel.contains(a)) return false; // the button's own
      e.preventDefault();
      next();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // Open, close, refresh
  // ---------------------------------------------------------------------------------------------
  function open() {
    if (active) return true;
    active = true;
    note = null;
    result = null;
    show(el.root, true);
    payOwed(); // (before the map: the note says so, and toMap shows the chest)
    toMap();
    const n = openCount(record());
    announce(`Professor Barnacle's Riddle Bell. Pick a quiz island: ${n} of ${levels().length} open.${note ? ` ${note.text}` : ''}`);
    react('open');
    return true;
  }
  function close() {
    if (!active) return;
    active = false;
    clearTimers();
    round = [];
    mode = 'map';
    show(el.root, false);
  }
  function refresh() {
    if (!active) return;
    renderChest();
    if (mode === 'map') {
      const f = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-level]') : null;
      renderMap();
      if (f) focus(mapButton(Number(f.dataset.level)));
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Test hooks (__game.quiz routes here through townMode)
  // ---------------------------------------------------------------------------------------------
  const copyQ = (q) => (q ? { id: q.id, cat: q.cat, q: q.q, options: q.options.slice(), right: q.right, fact: q.fact } : null);
  const api = {
    start: (lv, seed) => start(lv, seed),
    answer: (i) => answer(i),
    hint: () => useBuoy(),
    next: () => next(),
    leave: () => leaveRound(),
    map: () => (mode === 'results' ? (toMap({ focusLevel: result ? result.level : null }), true) : false),
    again: () => (mode === 'results' ? start(result.level) : false),
    nextQuiz: () => (mode === 'results' && result && result.nextOpen ? start(result.level + 1) : false),
    escape: () => (active ? goBack() : false),
    get mode() {
      return active ? mode : null;
    },
    get round() {
      if (!active || !round.length) return null;
      return {
        level,
        index,
        mode,
        total: round.length,
        correct,
        picks: picks.slice(),
        removed: [...removed],
        buoys,
        buoysMax,
        question: copyQ(round[index]),
        questions: round.map(copyQ),
      };
    },
    get result() {
      return result ? { ...result } : null;
    },
    get panel() {
      return el.panel;
    },
  };

  return {
    open,
    close,
    onKey,
    refresh,
    get active() {
      return active;
    },
    api,
  };
}
