// Unit checks for the wardrobe catalogue and records in src/cosmetics.js (plain Node, no browser):
// - the catalogue (SPEC2 §7.9): ids, slots, one free default per slot, prices (1,200 in all), trophies
// - parseLook / parseFeats: whatever is in storage (garbage, tampered or huge) gives a valid record,
//   field by field, without throwing; serializeLook / serializeFeats round trip and are canonical
// - wearing, buying, trophies (sanitizeLook), itemState labels and Surprise me!
// - captainOpts / crewOpts / enemyCrewOpts emit only buildPerson options people.js accepts (§7.10),
//   with hex colours from PALETTE; the default crew look leaves a sailor exactly as they are
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

// The pure modules import nothing, so they are loaded from their source as data: URLs.
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => {
  if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 60) + '…' : v);
  if (typeof v === 'symbol' || typeof v === 'function' || typeof v === 'bigint') return String(v);
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 60) + '…' : s;
  } catch {
    return Object.prototype.toString.call(v);
  }
};
// A small seeded RNG for the tests (mulberry32).
function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

(async () => {
  const K = await load('src/cosmetics.js');
  const { SHIP_TYPES } = await load('src/shipTypes.js');
  const { LOOKS } = await load('src/upgrades.js');
  const { ITEMS, SLOTS, PALETTE, FEAT_IDS, FEAT_PRIZE_TYPES } = K;

  // ------------------------------------------------------------------ the contract (SPEC2 §7.9)
  const CAP = ['hat', 'coat', 'beard', 'hair', 'hairstyle', 'skin', 'body', 'pet', 'patch'];
  const CREW = ['shirt', 'head', 'sash'];
  const CATALOGUE = {
    hat: { free: ['tricorn', 'bandana', 'straw', 'none'], paid: { bicorne: 120, plume: 180 }, trophy: { crown: ['legend', 1] }, def: 'tricorn' },
    coat: { free: ['crimson', 'navy', 'none'], paid: { black: 60, emerald: 60, plum: 60 }, trophy: { admiral: ['captures', 10] }, def: 'crimson' },
    beard: { free: ['full', 'goatee', 'stubble', 'none'], paid: { braids: 80, handlebar: 40 }, trophy: {}, def: 'full' },
    hair: { free: ['brown', 'black', 'ginger', 'blonde', 'grey'], paid: { sea: 50, coral: 50 }, trophy: {}, def: 'brown' },
    hairstyle: { free: ['crop', 'long', 'ponytail', 'bald'], paid: {}, trophy: {}, def: 'crop' },
    skin: { free: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'], paid: {}, trophy: {}, def: 's3' },
    body: { free: ['broad', 'slim'], paid: {}, trophy: {}, def: 'broad' },
    pet: { free: ['none'], paid: { parrot: 150, macaw: 150 }, trophy: { golden: ['rakes', 50] }, def: 'none' },
    patch: { free: ['off', 'on'], paid: {}, trophy: {}, def: 'off' },
    shirt: { free: ['own', 'red', 'blue', 'black', 'teal', 'paint'], paid: { navy: 60, sunset: 60 }, trophy: {}, def: 'own' },
    head: { free: ['mixed', 'bandanas', 'caps'], paid: { tricorns: 80 }, trophy: { skull: ['boardings', 15] }, def: 'mixed' },
    sash: { free: ['own', 'gold', 'red', 'teal', 'purple'], paid: {}, trophy: {}, def: 'own' },
  };
  const NAMES = {
    'hat.bicorne': "Admiral's bicorne", 'hat.plume': "Cavalier's plume", 'hat.crown': "Pirate King's crown", 'coat.admiral': "Admiral's white",
    'beard.braids': 'Blackbeard braids', 'beard.handlebar': 'Curly moustache', 'hair.sea': 'Sea-blue dye', 'hair.coral': 'Coral-pink dye',
    'pet.parrot': 'Red parrot', 'pet.macaw': 'Blue macaw', 'pet.golden': 'Golden parrot', 'shirt.navy': 'Navy jackets',
    'shirt.sunset': 'Sunset stripes', 'head.skull': 'Skull bandanas', 'shirt.paint': "Match the ship's paint",
  };
  const DEFAULT_LOOK = {
    v: 1,
    cap: { hat: 'tricorn', coat: 'crimson', beard: 'full', hair: 'brown', hairstyle: 'crop', skin: 's3', body: 'broad', pet: 'none', patch: 'off' },
    crew: { shirt: 'own', head: 'mixed', sash: 'own' },
    own: [],
  };
  const DEFAULT_LOOK_TEXT = '{"v":1,"cap":{"hat":"tricorn","coat":"crimson","beard":"full","hair":"brown","hairstyle":"crop","skin":"s3","body":"broad","pet":"none","patch":"off"},"crew":{"shirt":"own","head":"mixed","sash":"own"},"own":[]}';
  const SPEC_LOOK_TEXT = '{"v":1,"cap":{"hat":"tricorn","coat":"crimson","beard":"full","hair":"brown","hairstyle":"crop","skin":"s3","body":"broad","pet":"none","patch":"off"},"crew":{"shirt":"own","head":"mixed","sash":"own"},"own":["hat.plume","coat.black"]}';
  const DEFAULT_FEATS = { captures: 0, boardings: 0, rakes: 0, crits: 0, legend: 0, prizes: {} };
  const SPEC_FEATS_TEXT = '{"captures":3,"boardings":5,"rakes":41,"crits":12,"legend":0,"prizes":{"privateer":2,"galleon":1}}';
  const ALL_FEATS = { captures: 10, boardings: 15, rakes: 50, crits: 0, legend: 1, prizes: {} }; // every trophy, exactly

  // buildPerson options people.js accepts: today's options plus the §7.10 extensions, `earring` (§7.9
  // has captainOpts set it) and the two people.js adds for the wardrobe: `vest` (a hex, or null for
  // none) and `hatBadge: 'skull'`. Each entry: the allowed values or a value check.
  const isHex = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
  const oneOf = (...xs) => (v) => xs.includes(v);
  const PERSON_OPTS = {
    seed: (v) => Number.isSafeInteger(v),
    kind: oneOf('pirate', 'man', 'woman', 'kid', 'old'),
    outfit: oneOf('pirate'),
    hat: oneOf('tricorn', 'bandana', 'cap', 'straw', 'kerchief', 'none', 'bicorne', 'plumed', 'crown', 'horned'),
    hatColor: isHex,
    coat: (v) => v === null || isHex(v),
    coatTrim: isHex,
    beard: oneOf('full', 'goatee', 'stubble', 'braids', 'handlebar', 'none', true, false),
    hair: isHex,
    hairStyle: oneOf('crop', 'long', 'ponytail', 'bald'),
    skin: isHex,
    accent: isHex,
    shirt: isHex,
    shirt2: isHex,
    stripes: oneOf(true, false),
    vest: (v) => v === null || v === false || isHex(v),
    hatBadge: oneOf('skull'),
    pants: isHex,
    eyepatch: oneOf(true, false),
    earring: oneOf(true, false),
    pegLeg: oneOf(true, false),
    pet: oneOf('none', 'parrot'),
    petColor: (v) => !!v && typeof v === 'object' && Object.keys(v).sort().join() === 'body,head,wing' && Object.values(v).every(isHex),
    tool: oneOf('mop', 'brush', 'bucket', 'crate', 'rod', 'fiddle', 'hammer', 'lantern', 'none', 'cutlass', 'tape', 'scissors'),
    scale: (v) => Number.isFinite(v) && v > 0,
    detail: oneOf('low'),
    share: oneOf(true, false),
  };
  const HEX_KEYS = ['hatColor', 'coat', 'coatTrim', 'hair', 'skin', 'accent', 'shirt', 'shirt2', 'vest', 'pants'];
  const PALETTE_HEX = new Set(Object.values(PALETTE));
  // Problems with a buildPerson options object ('' when fine). extraHex: colours allowed besides PALETTE.
  function badOpts(o, { extraHex = [], palette = true } = {}) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return 'not an object';
    const out = [];
    for (const k of Object.keys(o)) {
      if (!Object.prototype.hasOwnProperty.call(PERSON_OPTS, k)) out.push(`unknown option ${k}`);
      else if (!PERSON_OPTS[k](o[k])) out.push(`${k} = ${show(o[k])}`);
    }
    if (palette) {
      const hexes = [];
      for (const k of HEX_KEYS) if (isHex(o[k])) hexes.push([k, o[k]]);
      if (o.petColor && typeof o.petColor === 'object') for (const [k, v] of Object.entries(o.petColor)) hexes.push([`petColor.${k}`, v]);
      for (const [k, v] of hexes) if (!PALETTE_HEX.has(v) && !extraHex.includes(v)) out.push(`${k} 0x${v.toString(16)} is not a PALETTE colour`);
    }
    return out.join(', ');
  }

  // A valid look: exactly these fields, known keys, paid items owned, own = known paid ids in catalogue order.
  const PAID = Object.keys(ITEMS).filter((id) => ITEMS[id].price > 0);
  function invalidLook(L) {
    if (!L || typeof L !== 'object' || Array.isArray(L)) return 'not an object';
    if (Object.keys(L).join() !== 'v,cap,crew,own') return `fields ${Object.keys(L)}`;
    if (L.v !== 1) return `v ${show(L.v)}`;
    if (Object.keys(L.cap).join() !== CAP.join()) return `cap fields ${Object.keys(L.cap)}`;
    if (Object.keys(L.crew).join() !== CREW.join()) return `crew fields ${Object.keys(L.crew)}`;
    if (!Array.isArray(L.own)) return 'own is not an array';
    if (L.own.some((id) => !PAID.includes(id))) return `own ${show(L.own)}`;
    if (L.own.join() !== PAID.filter((id) => L.own.includes(id)).join()) return `own order ${show(L.own)}`;
    for (const [g, slots] of [['cap', CAP], ['crew', CREW]]) {
      for (const s of slots) {
        const it = ITEMS[`${s}.${L[g][s]}`];
        if (!it || it.slot !== s) return `${s} = ${show(L[g][s])}`;
        if (it.price && !L.own.includes(it.id)) return `${s} wears ${it.id} without owning it`;
      }
    }
    return '';
  }
  function parseL(raw) {
    try {
      const L = K.parseLook(raw);
      const bad = invalidLook(L);
      return bad ? { error: `invalid look (${bad})` } : { L };
    } catch (e) {
      return { error: `threw ${e && e.message}` };
    }
  }
  function invalidFeats(F) {
    if (!F || typeof F !== 'object' || Array.isArray(F)) return 'not an object';
    if (Object.keys(F).join() !== [...FEAT_IDS, 'prizes'].join()) return `fields ${Object.keys(F)}`;
    for (const id of FEAT_IDS) {
      const n = F[id];
      if (!Number.isInteger(n) || n < 0 || n > (id === 'legend' ? 1 : 1e6) || Object.is(n, -0)) return `${id} ${String(n)}`;
    }
    if (!F.prizes || typeof F.prizes !== 'object' || Array.isArray(F.prizes)) return 'prizes';
    const keys = Object.keys(F.prizes);
    if (keys.join() !== FEAT_PRIZE_TYPES.filter((t) => keys.includes(t)).join()) return `prize keys ${keys}`;
    for (const k of keys) if (!Number.isInteger(F.prizes[k]) || F.prizes[k] < 1 || F.prizes[k] > 9999) return `prize ${k} ${F.prizes[k]}`;
    return '';
  }
  function parseF(raw) {
    try {
      const F = K.parseFeats(raw);
      const bad = invalidFeats(F);
      return bad ? { error: `invalid feats (${bad})` } : { F };
    } catch (e) {
      return { error: `threw ${e && e.message}` };
    }
  }
  const lookWith = (cap = {}, crew = {}, own = []) => {
    const L = JSON.parse(JSON.stringify(DEFAULT_LOOK));
    Object.assign(L.cap, cap);
    Object.assign(L.crew, crew);
    L.own = own;
    return L;
  };

  // ------------------------------------------------------------------ the catalogue
  {
    check(same(SLOTS, { captain: CAP, crew: CREW }), `SLOTS: captain ${SLOTS.captain.join(', ')}; crew ${SLOTS.crew.join(', ')}`);
    const all = [...SLOTS.captain, ...SLOTS.crew];
    check(new Set(all).size === all.length, 'slot names are unique across the captain and the crew');
    check(all.every((s) => typeof K.SLOT_NAMES[s] === 'string' && K.SLOT_NAMES[s].trim().length > 0), `every slot has a heading (${all.map((s) => K.SLOT_NAMES[s]).join(' · ')})`);

    const ids = Object.keys(ITEMS);
    const shapeBad = ids.filter((id) => {
      const it = ITEMS[id];
      return !/^[a-z]+\.[a-z0-9]+$/.test(id) || it.id !== id || `${it.slot}.${it.key}` !== id || !all.includes(it.slot) ||
        it.group !== (CAP.includes(it.slot) ? 'captain' : 'crew');
    });
    check(new Set(ids).size === ids.length && shapeBad.length === 0, `${ids.length} item ids, unique and "slot.key"-shaped with matching id / slot / key / group${shapeBad.length ? ' -> ' + shapeBad.join(', ') : ''}`);

    const problems = [];
    for (const slot of all) {
      const want = CATALOGUE[slot];
      const items = ids.filter((id) => ITEMS[id].slot === slot).map((id) => ITEMS[id]);
      const free = items.filter((it) => !it.price && !it.trophy).map((it) => it.key);
      const paid = Object.fromEntries(items.filter((it) => it.price).map((it) => [it.key, it.price]));
      const trophy = Object.fromEntries(items.filter((it) => it.trophy).map((it) => [it.key, [it.trophy.feat, it.trophy.min]]));
      const defaults = items.filter((it) => it.isDefault);
      if (!same(free, want.free)) problems.push(`${slot} free ${free}`);
      if (!same(paid, want.paid)) problems.push(`${slot} paid ${show(paid)}`);
      if (!same(trophy, want.trophy)) problems.push(`${slot} trophies ${show(trophy)}`);
      if (defaults.length !== 1 || defaults[0].key !== want.def || defaults[0].price || defaults[0].trophy) problems.push(`${slot} defaults ${defaults.map((d) => d.key)}`);
      if (slot !== 'skin' && items[0] && items[0].key !== want.def) problems.push(`${slot}: the default is not listed first`); // skin tones go light to dark
      const names = items.map((it) => it.name);
      if (names.some((n) => typeof n !== 'string' || !n.trim()) || new Set(names).size !== names.length) problems.push(`${slot} names ${names}`);
      for (const it of items) {
        if (!Array.isArray(it.swatch) || !it.swatch.length || !it.swatch.every(isHex)) problems.push(`${it.id} swatch`);
        if (it.price !== undefined && !(Number.isInteger(it.price) && it.price > 0)) problems.push(`${it.id} price ${it.price}`);
        if (it.price && it.trophy) problems.push(`${it.id} is both paid and a trophy`);
      }
    }
    check(problems.length === 0, `the catalogue matches SPEC2 §7.9 slot by slot (free / paid / trophy items, one free default listed first (skin: light to dark), named, with swatches)${problems.length ? ' -> ' + problems.join('; ') : ''}`);

    const badNames = Object.entries(NAMES).filter(([id, n]) => !ITEMS[id] || !ITEMS[id].name.includes(n));
    check(badNames.length === 0, `the named items read as in §7.9 ("Cavalier's plume", "Admiral's white", "Navy jackets"...)${badNames.length ? ' -> ' + badNames.map(([id]) => id).join(', ') : ''}`);

    const total = ids.reduce((s, id) => s + (ITEMS[id].price || 0), 0);
    check(total === 1200, `buying everything costs ${total} gold (1,200)`);
    const trophies = ids.filter((id) => ITEMS[id].trophy);
    const tBad = trophies.filter((id) => {
      const t = ITEMS[id].trophy;
      return !FEAT_IDS.includes(t.feat) || !(Number.isInteger(t.min) && t.min > 0) || typeof t.text !== 'string' || !t.text.trim();
    });
    check(trophies.length === 4 && tBad.length === 0, `${trophies.length} trophies, each naming a FEAT_IDS entry, a minimum and an unlock text (${trophies.map((id) => `${id}: ${ITEMS[id].trophy.feat} ≥ ${ITEMS[id].trophy.min}`).join(', ')})${tBad.length ? ' -> ' + tBad.join(', ') : ''}`);

    let frozen = Object.isFrozen(ITEMS) && Object.isFrozen(PALETTE);
    try {
      'use strict';
      ITEMS['hat.plume'].price = 1;
    } catch {
      // frozen: assignment throws in strict code
    }
    frozen = frozen && ITEMS['hat.plume'].price === 180;
    check(frozen && Object.values(PALETTE).every(isHex), `PALETTE (${Object.keys(PALETTE).length} named hex colours) and ITEMS are frozen`);

    check(same(FEAT_IDS, ['captures', 'boardings', 'rakes', 'crits', 'legend']), `FEAT_IDS: ${FEAT_IDS.join(', ')}`);
    const enemyTypes = Object.keys(SHIP_TYPES).filter((k) => k !== 'player');
    check(same([...FEAT_PRIZE_TYPES].sort(), [...enemyTypes].sort()) && FEAT_PRIZE_TYPES.length === enemyTypes.length, `FEAT_PRIZE_TYPES equals the enemy ship types of shipTypes.js (${FEAT_PRIZE_TYPES.join(', ')})`);

    // Skin tones are people.js SKIN[0..6] (read from its source: people.js needs three.js to load).
    const src = fs.readFileSync(path.join(ROOT, 'src/people.js'), 'utf8');
    const m = src.match(/const SKIN = \[([^\]]*)\]/);
    const skin = m ? m[1].split(',').map((s) => Number(s.trim())) : [];
    const ours = CATALOGUE.skin.free.map((k) => ITEMS[`skin.${k}`].opts.skin);
    check(skin.length === 7 && same(ours, skin), `skin s1…s7 are people.js SKIN[0..6] (${skin.map((v) => '0x' + v.toString(16)).join(', ')})`);
  }

  // ------------------------------------------------------------------ defaults
  {
    const d1 = K.defaultLook();
    const d2 = K.defaultLook();
    d1.cap.hat = 'straw';
    d1.own.push('hat.plume');
    check(same(d2, DEFAULT_LOOK) && d1.cap !== d2.cap && d1.own !== d2.own, `defaultLook: every slot on its free default, nothing owned, a fresh object every call`);
    check(K.serializeLook(K.defaultLook()) === DEFAULT_LOOK_TEXT && K.serializeLook(null) === DEFAULT_LOOK_TEXT, 'the stored default look is exactly the §8 shape');
    const f1 = K.defaultFeats();
    const f2 = K.defaultFeats();
    f1.captures = 3;
    f1.prizes.cutter = 1;
    check(same(f2, DEFAULT_FEATS) && f1.prizes !== f2.prizes, `defaultFeats: ${show(f2)}, a fresh object every call`);
    check(K.serializeFeats(null) === JSON.stringify(DEFAULT_FEATS), `the stored default feats are ${K.serializeFeats(null)}`);
  }

  // ------------------------------------------------------------------ the junk battery (both records)
  const hostile = {};
  Object.defineProperty(hostile, 'cap', { enumerable: true, get() { throw new Error('getter'); } });
  Object.defineProperty(hostile, 'captures', { enumerable: true, get() { throw new Error('getter'); } });
  const thrower = () => { throw new Error('proxy'); };
  const proxy = new Proxy({}, { get: thrower, has: thrower, ownKeys: thrower, getOwnPropertyDescriptor: thrower, getPrototypeOf: thrower });
  const arrayProxy = new Proxy([], { get: thrower, ownKeys: thrower, getOwnPropertyDescriptor: thrower });
  const { proxy: revoked, revoke } = Proxy.revocable({ cap: { hat: 'straw' }, captures: 3 }, {});
  revoke();
  const JUNK = [
    null, undefined, '', ' ', 'garbage', 'garbage{', '{', '}', '{}', '[]', '[1,2,3]', 'null', 'true', 'false', '42', '"str"',
    'NaN', 'Infinity', '-Infinity', '1e400', '{"cap":null,"crew":null,"own":null,"prizes":null}', '{"cap":[],"crew":[],"own":{},"prizes":[]}',
    '{"cap":"straw","crew":"red","own":"hat.plume"}', '[{"cap":{"hat":"straw"},"captures":3}]', '{"CAP":{"hat":"straw"},"Captures":3}',
    42, -1, NaN, Infinity, true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n, Object.create(null),
    new Date(0), /x/, new Map([['cap', { hat: 'straw' }]]), new Set(), new String('{"captures":3}'), [{ cap: { hat: 'straw' }, captures: 3 }],
    hostile, proxy, arrayProxy, revoked, { cap: proxy, crew: arrayProxy, own: proxy, prizes: proxy },
    '\u0000', '\ud800', '{"cap":{"hat":"straw"}', '{"captures":3', '{"captures":3}}', "{'captures':3}", '{"captures":3,}', // cut short, trailing junk
  ];

  // ------------------------------------------------------------------ parseLook
  {
    const bad = [];
    for (const raw of JUNK) {
      const r = parseL(raw);
      if (r.error) bad.push(`${show(raw)}: ${r.error}`);
      else if (!same(r.L, DEFAULT_LOOK)) bad.push(`${show(raw)}: ${show(r.L)}`);
    }
    check(bad.length === 0, `parseLook: ${JUNK.length} kinds of junk (missing, garbage, cut short, wrong types, throwing getters, proxies, revoked proxies...) all give the default look${bad.length ? ' -> ' + bad.join('; ') : ''}`);

    const spec = parseL(SPEC_LOOK_TEXT);
    check(!spec.error && K.serializeLook(spec.L) === SPEC_LOOK_TEXT && same(spec.L.own, ['hat.plume', 'coat.black']), `the §8 example record reads back and is written exactly as stored`);

    // Each slot on its own: a known key of that slot, else its default.
    const cases = [
      [{ hat: 'straw', coat: 'navy', beard: 'stubble', hair: 'ginger', hairstyle: 'ponytail', skin: 's7', body: 'slim', pet: 'none', patch: 'on' }, null],
      [{ hat: 'Straw', coat: 'NAVY', beard: ' stubble', hair: 'ginger ', hairstyle: '', skin: 's8', body: 's1', pet: 'cat', patch: true }, DEFAULT_LOOK.cap],
      [{ hat: 'red', coat: 'tricorn', beard: 'bald', hair: 'crop', hairstyle: 'brown', skin: '3', body: 'broad', pet: 'off', patch: 'none' }, { ...DEFAULT_LOOK.cap, patch: 'off' }], // keys of other slots
      [{ hat: '__proto__', coat: 'constructor', beard: 'toString', hair: 'hasOwnProperty', hairstyle: 'valueOf', skin: '__defineGetter__', body: 'prototype' }, DEFAULT_LOOK.cap],
      [{ hat: ['straw'], coat: { navy: 1 }, beard: 3, hair: null, hairstyle: true, skin: 3, body: undefined, pet: NaN, patch: 1 }, DEFAULT_LOOK.cap],
      [{ hat: 'straw', shirt: 'red', head: 'caps', sash: 'gold' }, { ...DEFAULT_LOOK.cap, hat: 'straw' }], // crew slots in cap are dropped
      [{ hat: 'hat.straw', coat: 'coat.navy', skin: 'skin.s1' }, DEFAULT_LOOK.cap],
    ];
    const badSlots = [];
    for (const [cap, want] of cases) {
      const expect = want || cap;
      for (const raw of [{ cap }, JSON.stringify({ cap })]) {
        const r = parseL(raw);
        if (r.error || !same(r.L.cap, expect) || !same(r.L.crew, DEFAULT_LOOK.crew)) badSlots.push(`${show(cap)} -> ${show(r.L ? r.L.cap : r.error)}`);
      }
    }
    const crewCases = [
      [{ shirt: 'red', head: 'caps', sash: 'teal' }, { shirt: 'red', head: 'caps', sash: 'teal' }],
      [{ shirt: 'paint', head: 'bandanas', sash: 'purple', hat: 'straw' }, { shirt: 'paint', head: 'bandanas', sash: 'purple' }],
      [{ shirt: 'gold', head: 'red', sash: 'mixed' }, DEFAULT_LOOK.crew], // keys of other slots
      [{ shirt: 'Red', head: 'CAPS', sash: '' }, DEFAULT_LOOK.crew],
    ];
    for (const [crew, want] of crewCases) {
      for (const raw of [{ crew }, JSON.stringify({ crew })]) {
        const r = parseL(raw);
        if (r.error || !same(r.L.crew, want) || !same(r.L.cap, DEFAULT_LOOK.cap)) badSlots.push(`${show(crew)} -> ${show(r.L ? r.L.crew : r.error)}`);
      }
    }
    check(badSlots.length === 0, `parseLook: each slot keeps only a known key of that slot, field by field (${(cases.length + crewCases.length) * 2} records)${badSlots.length ? ' -> ' + badSlots.join('; ') : ''}`);

    // own: known paid ids only, deduped, catalogue order; worn paid items must be owned.
    const ownCases = [
      [['hat.plume', 'coat.black'], ['hat.plume', 'coat.black']],
      [['coat.black', 'hat.plume', 'hat.bicorne'], ['hat.bicorne', 'hat.plume', 'coat.black']],
      [['hat.plume', 'hat.plume', 'hat.plume'], ['hat.plume']],
      [['hat.tricorn', 'hat.crown', 'coat.admiral', 'skin.s1', 'shirt.own', 'head.skull', 'pet.golden'], []], // free and trophy ids
      [['hat.nope', 'Hat.plume', ' hat.plume', 'hat.plume ', 'plume', 'hat', '', '__proto__', 'hat.__proto__', 'constructor'], []],
      [[1, null, true, ['hat.plume'], { id: 'hat.plume' }, 'pet.parrot'], ['pet.parrot']],
      [PAID.slice().reverse(), PAID],
    ];
    const badOwn = [];
    for (const [own, want] of ownCases) {
      for (const raw of [{ own }, JSON.stringify({ own })]) {
        const r = parseL(raw);
        if (r.error || !same(r.L.own, want)) badOwn.push(`${show(own)} -> ${show(r.L ? r.L.own : r.error)}`);
      }
    }
    // A long own list: only the first 256 entries are read, at most 64 kept; holes and getters are fine.
    const long = Array(300).fill('hat.nope');
    long[299] = 'hat.plume';
    const lr = parseL({ own: long });
    if (lr.error || lr.L.own.length !== 0) badOwn.push(`a 300-entry list read past 256 entries (${show(lr.L && lr.L.own)})`);
    const holes = [];
    holes[5] = 'hat.plume';
    const hr = parseL({ own: holes });
    if (hr.error || !same(hr.L.own, ['hat.plume'])) badOwn.push(`a sparse list -> ${show(hr.L && hr.L.own)}`);
    const getterOwn = ['hat.plume'];
    Object.defineProperty(getterOwn, 1, { enumerable: true, get() { throw new Error('getter'); } });
    getterOwn.push('pet.parrot');
    const gr = parseL({ own: getterOwn });
    if (gr.error || !same(gr.L.own, ['hat.plume', 'pet.parrot'])) badOwn.push(`a throwing entry -> ${show(gr.L ? gr.L.own : gr.error)}`);
    const t0 = Date.now();
    const big = parseL({ own: new Array(1e7) });
    if (big.error || big.L.own.length || Date.now() - t0 > 500) badOwn.push('a 10M-entry own list was slow or broke');
    check(badOwn.length === 0, `parseLook: own keeps known paid ids only, deduped, in catalogue order (${ownCases.length * 2 + 4} lists)${badOwn.length ? ' -> ' + badOwn.join('; ') : ''}`);

    const worn = [
      [lookWith({ hat: 'plume', coat: 'black' }, { shirt: 'navy' }, []), DEFAULT_LOOK],
      [lookWith({ hat: 'plume', coat: 'black' }, { shirt: 'navy' }, ['coat.black']), lookWith({ coat: 'black' }, {}, ['coat.black'])],
      [lookWith({ pet: 'macaw', beard: 'braids' }, { head: 'tricorns' }, ['beard.braids', 'pet.macaw', 'head.tricorns']), null],
      [lookWith({ hat: 'crown', coat: 'admiral', pet: 'golden' }, { head: 'skull' }, []), null], // trophies stay (sanitizeLook checks them)
    ];
    const badWorn = [];
    for (const [raw, want] of worn) {
      const expect = want || raw;
      for (const r of [parseL(raw), parseL(JSON.stringify(raw))]) if (r.error || !same(r.L, expect)) badWorn.push(`${show(raw)} -> ${show(r.L || r.error)}`);
    }
    check(badWorn.length === 0, `parseLook: a worn paid item that is not owned goes back to the default; owned ones and trophies stay${badWorn.length ? ' -> ' + badWorn.join('; ') : ''}`);

    const r = parseL('{"v":7,"cap":{"hat":"straw","glitter":"yes","shirt":"red"},"crew":{"sash":"gold","hat":"straw"},"own":["pet.parrot"],"gold":999999,"feats":{"legend":1}}');
    check(!r.error && same(r.L, lookWith({ hat: 'straw' }, { sash: 'gold' }, ['pet.parrot'])), `unknown fields are dropped and v is always 1 (${show(r.L || r.error)})`);
    const p = parseL('{"__proto__":{"polluted":1,"cap":{"hat":"straw"}},"cap":{"__proto__":{"hat":"straw"},"constructor":{"prototype":{"polluted":1}}},"own":{"__proto__":["hat.plume"]}}');
    const polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined;
    check(!p.error && same(p.L, DEFAULT_LOOK) && !polluted, `__proto__ / constructor tricks give the default look and pollute nothing`);
    const inherited = parseL(Object.create({ cap: { hat: 'straw' }, own: ['hat.plume'] }));
    const inheritedSlot = parseL({ cap: Object.create({ hat: 'straw' }) });
    check(!inherited.error && same(inherited.L, DEFAULT_LOOK) && !inheritedSlot.error && same(inheritedSlot.L, DEFAULT_LOOK), 'inherited (non-own) fields are ignored');
    const frozen = deepFreeze(lookWith({ hat: 'plume' }, { shirt: 'red' }, ['hat.plume']));
    const fr = parseL(frozen);
    check(!fr.error && same(fr.L, frozen) && fr.L !== frozen && fr.L.cap !== frozen.cap && fr.L.own !== frozen.own, 'a frozen look object is read, and a fresh look returned');
  }

  // ------------------------------------------------------------------ parseFeats
  {
    const bad = [];
    for (const raw of JUNK) {
      const r = parseF(raw);
      if (r.error) bad.push(`${show(raw)}: ${r.error}`);
      else if (!same(r.F, DEFAULT_FEATS)) bad.push(`${show(raw)}: ${show(r.F)}`);
    }
    check(bad.length === 0, `parseFeats: ${JUNK.length} kinds of junk all give empty feats${bad.length ? ' -> ' + bad.join('; ') : ''}`);

    const spec = parseF(SPEC_FEATS_TEXT);
    check(!spec.error && K.serializeFeats(spec.F) === SPEC_FEATS_TEXT, `the §8 example feats read back and are written exactly as stored`);

    let sourceText = false;
    JSON.parse('1', (k, v, ctx) => { sourceText = !!(ctx && typeof ctx.source === 'string'); return v; });
    // [literal, captures (max 1,000,000), legend (max 1), a prize (max 9,999; 0 is left out)]
    const cases = [
      ['0', 0, 0, undefined], ['1', 1, 1, 1], ['3', 3, 1, 3], ['-0', 0, 0, undefined], ['-3', 0, 0, undefined], ['999999', 999999, 1, 9999],
      ['1000000', 1000000, 1, 9999], ['1000001', 1000000, 1, 9999], ['9999', 9999, 1, 9999], ['10000', 10000, 1, 9999],
      ['"7"', 7, 1, 7], ['" 7 "', 7, 1, 7], ['"1e1"', 0, 0, undefined], ['"2.5"', 0, 0, undefined], ['"0x2"', 0, 0, undefined], ['"+1"', 0, 0, undefined],
      ['""', 0, 0, undefined], ['"NaN"', 0, 0, undefined], ['2.5', 0, 0, undefined], ['-0.5', 0, 0, undefined], ['1e400', 0, 0, undefined],
      ['123456789012345678901', 0, 0, undefined], ['null', 0, 0, undefined], ['true', 0, 0, undefined], ['[1]', 0, 0, undefined], ['{"n":1}', 0, 0, undefined],
      ...(sourceText ? [['1e1', 0, 0, undefined], ['2.0', 0, 0, undefined], ['1E0', 0, 0, undefined]] : []),
    ];
    const badCounts = [];
    for (const [lit, c, l, prize] of cases) {
      const r = parseF(`{"captures":${lit},"legend":${lit},"rakes":5,"prizes":{"junk":${lit},"cutter":2}}`);
      const got = r.error ? [r.error] : [r.F.captures, r.F.legend, r.F.prizes.junk, r.F.rakes, r.F.prizes.cutter];
      if (!same(got, [c, l, prize, 5, 2])) badCounts.push(`${lit} -> ${show(got)} (want ${c}, ${l}, ${prize})`);
    }
    check(badCounts.length === 0, `parseFeats: counters are plain integers clamped to [0, 1,000,000], legend to [0, 1], prizes to [0, 9,999] (${cases.length} cases${sourceText ? ', incl. literals like 1e1 and 2.0' : ''})${badCounts.length ? ' -> ' + badCounts.join('; ') : ''}`);

    const objCases = [[3, 3], [-3, 0], [-0, 0], [NaN, 0], [Infinity, 0], [2.5, 0], [Number.MAX_SAFE_INTEGER + 2, 0], ['4', 4], [new Number(4), 0], [{ valueOf: () => 4 }, 0], [4n, 0], [[4], 0]];
    const badObj = objCases.filter(([v, want]) => {
      const r = parseF({ crits: v, boardings: 2 });
      return r.error || r.F.crits !== want || Object.is(r.F.crits, -0) || r.F.boardings !== 2;
    });
    check(badObj.length === 0, `parseFeats on an object: the same counter rules${badObj.length ? ' -> ' + badObj.map(([v]) => show(v)).join(', ') : ''}`);

    const pr = parseF('{"prizes":{"galleon":1,"player":4,"Cutter":2,"__proto__":{"cutter":3},"toString":1,"constructor":2,"phantom":"2","raider":0,"junk":-4,"cutter":5}}');
    check(!pr.error && same(pr.F.prizes, { cutter: 5, galleon: 1, phantom: 2 }), `prizes: enemy ship types only, plain integers, zeros left out, written in FEAT_PRIZE_TYPES order (${show(pr.F ? pr.F.prizes : pr.error)})`);
    const fbf = parseF('{"captures":"x","boardings":4,"rakes":2.5,"crits":"12","legend":5,"prizes":[1,2]}');
    check(!fbf.error && same(fbf.F, { captures: 0, boardings: 4, rakes: 0, crits: 12, legend: 1, prizes: {} }), `parseFeats falls back field by field (${show(fbf.F || fbf.error)})`);
    const ex = parseF('{"captures":1,"kills":99,"gold":5,"prizes":{"cutter":1},"v":2}');
    check(!ex.error && same(ex.F, { ...DEFAULT_FEATS, captures: 1, prizes: { cutter: 1 } }), 'unknown fields are dropped');
    const p = parseF('{"__proto__":{"polluted":1,"captures":3},"prizes":{"__proto__":{"polluted":1}},"constructor":{"prototype":{"polluted":1}}}');
    check(!p.error && same(p.F, DEFAULT_FEATS) && ({}).polluted === undefined, '__proto__ / constructor tricks give empty feats and pollute nothing');
    check(same(K.parseFeats(Object.create({ captures: 3 })), DEFAULT_FEATS) && same(K.parseFeats({ prizes: Object.create({ cutter: 3 }) }), DEFAULT_FEATS), 'inherited (non-own) counters are ignored');
  }

  // ------------------------------------------------------------------ size and depth (both records)
  {
    const times = [];
    const timed = (fn, raw) => {
      const t0 = process.hrtime.bigint();
      const res = fn(raw);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return res;
    };
    const L = (cap) => JSON.stringify({ v: 1, cap });
    const huge = [
      ['2 MB of garbage', 'x'.repeat(2e6), DEFAULT_LOOK, DEFAULT_FEATS],
      ['a 1 MB record', JSON.stringify({ cap: { hat: 'straw' }, captures: 3, pad: 'a'.repeat(1e6) }), DEFAULT_LOOK, DEFAULT_FEATS],
      ['a record just over 16 KB', JSON.stringify({ cap: { hat: 'straw' }, captures: 3, pad: 'a'.repeat(16 * 1024) }), DEFAULT_LOOK, DEFAULT_FEATS],
      ['a record just under 16 KB', JSON.stringify({ cap: { hat: 'straw' }, captures: 3, pad: 'a'.repeat(15 * 1024) }), lookWith({ hat: 'straw' }), { ...DEFAULT_FEATS, captures: 3 }],
      ['a 15 KB key', L({ hat: 'straw'.repeat(3000) }), DEFAULT_LOOK, DEFAULT_FEATS],
      ['100k nested arrays', '['.repeat(1e5) + ']'.repeat(1e5), DEFAULT_LOOK, DEFAULT_FEATS],
      ['8k nested arrays (under the size cap)', '['.repeat(8e3) + ']'.repeat(8e3), DEFAULT_LOOK, DEFAULT_FEATS],
      ['50k nested objects', '{"cap":'.repeat(5e4) + '1' + '}'.repeat(5e4), DEFAULT_LOOK, DEFAULT_FEATS],
      ['2k nested objects (under the size cap)', '{"captures":'.repeat(1300) + '1' + '}'.repeat(1300), DEFAULT_LOOK, DEFAULT_FEATS],
      ['a deep object in a slot', `{"cap":{"hat":${'{"a":'.repeat(2500)}1${'}'.repeat(2500)}}}`, DEFAULT_LOOK, DEFAULT_FEATS],
      ['an own list of 3,000 ids', JSON.stringify({ own: Array(3000).fill('hat.plume') }), DEFAULT_LOOK, DEFAULT_FEATS],
    ];
    const bad = [];
    for (const [name, raw, wantL, wantF] of huge) {
      const rl = timed(parseL, raw);
      const rf = timed(parseF, raw);
      if (rl.error || !same(rl.L, wantL)) bad.push(`${name} (look): ${rl.error || show(rl.L)}`);
      if (rf.error || !same(rf.F, wantF)) bad.push(`${name} (feats): ${rf.error || show(rf.F)}`);
    }
    check(bad.length === 0 && Math.max(...times) < 1000, `huge and deeply nested input gives valid records quickly (slowest ${Math.max(...times).toFixed(1)} ms)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ round trips and rewrites
  {
    const rng = rngOf(99);
    const pickOf = (arr) => arr[Math.floor(rng() * arr.length)];
    const keysOf = (slot) => Object.values(ITEMS).filter((it) => it.slot === slot).map((it) => it.key);
    let n = 0;
    const bad = [];
    for (let i = 0; i < 500; i++) {
      const own = PAID.filter(() => rng() < 0.4);
      const L = lookWith();
      for (const s of CAP) L.cap[s] = pickOf(keysOf(s));
      for (const s of CREW) L.crew[s] = pickOf(keysOf(s));
      for (const g of ['cap', 'crew']) for (const s of g === 'cap' ? CAP : CREW) if (ITEMS[`${s}.${L[g][s]}`].price && !own.includes(`${s}.${L[g][s]}`)) own.push(`${s}.${L[g][s]}`);
      L.own = PAID.filter((id) => own.includes(id));
      const text = K.serializeLook(L);
      const back = parseL(text);
      n++;
      if (back.error || !same(back.L, L) || K.serializeLook(back.L) !== text || text !== JSON.stringify(L)) bad.push(`${text} -> ${show(back.L || back.error)}`);
    }
    for (const slot of [...CAP, ...CREW]) {
      for (const key of keysOf(slot)) {
        const L = lookWith();
        L[CAP.includes(slot) ? 'cap' : 'crew'][slot] = key;
        if (ITEMS[`${slot}.${key}`].price) L.own = [`${slot}.${key}`];
        const back = parseL(K.serializeLook(L));
        n++;
        if (back.error || !same(back.L, L)) bad.push(`${slot}.${key}`);
      }
    }
    check(bad.length === 0, `serializeLook -> parseLook round trips every item and ${n - Object.keys(ITEMS).length} random looks (${n} looks)${bad.length ? ' -> ' + bad.slice(0, 3).join('; ') : ''}`);

    const badF = [];
    for (let i = 0; i < 300; i++) {
      const F = { captures: Math.floor(rng() * 1e6), boardings: Math.floor(rng() * 50), rakes: Math.floor(rng() * 500), crits: Math.floor(rng() * 99), legend: rng() < 0.5 ? 1 : 0, prizes: {} };
      for (const t of FEAT_PRIZE_TYPES) if (rng() < 0.4) F.prizes[t] = 1 + Math.floor(rng() * 9999);
      const text = K.serializeFeats(F);
      const back = parseF(text);
      if (back.error || !same(back.F, F) || K.serializeFeats(back.F) !== text) badF.push(text);
    }
    check(badF.length === 0, `serializeFeats -> parseFeats round trips 300 random feats${badF.length ? ' -> ' + badF.slice(0, 2).join('; ') : ''}`);

    let texts;
    try {
      texts = [K.serializeLook({ cap: { hat: 'plume', coat: 'navy', glitter: 1 }, own: ['coat.black', 'hat.nope'], extra: true }), K.serializeFeats({ captures: 2.5, rakes: '9', prizes: { player: 1, cutter: 2 }, extra: 1 })];
    } catch (e) {
      texts = [e.message];
    }
    check(same(texts, [JSON.stringify(lookWith({ coat: 'navy' }, {}, ['coat.black'])), JSON.stringify({ ...DEFAULT_FEATS, rakes: 9, prizes: { cutter: 2 } })]), `serializeLook / serializeFeats validate before writing (${texts.map((t) => show(t)).join(' | ')})`);
    let junkText;
    try {
      junkText = [null, undefined, 'garbage', 42, Symbol('x'), () => 1, [], new Proxy({}, { ownKeys() { throw new Error('x'); } })].map((v) => [K.serializeLook(v), K.serializeFeats(v)]);
    } catch (e) {
      junkText = [[e.message]];
    }
    check(junkText.every(([l, f]) => l === DEFAULT_LOOK_TEXT && f === JSON.stringify(DEFAULT_FEATS)), 'serializing junk writes the defaults');

    // main's loadRecord() rewrites a record when serialize(parse(raw)) !== raw.
    const keep = [DEFAULT_LOOK_TEXT, SPEC_LOOK_TEXT].filter((raw) => K.serializeLook(K.parseLook(raw)) !== raw)
      .concat([JSON.stringify(DEFAULT_FEATS), SPEC_FEATS_TEXT].filter((raw) => K.serializeFeats(K.parseFeats(raw)) !== raw));
    const fixLook = [
      SPEC_LOOK_TEXT.replace('"own":["hat.plume","coat.black"]', '"own":["coat.black","hat.plume"]'),
      SPEC_LOOK_TEXT.replace('"own":["hat.plume","coat.black"]', '"own":["hat.plume","coat.black","hat.plume"]'),
      SPEC_LOOK_TEXT.replace('"hat":"tricorn"', '"hat":"bicorne"'),
      SPEC_LOOK_TEXT.replace('"v":1', '"v":2'),
      SPEC_LOOK_TEXT.replace('"skin":"s3"', '"skin":"s9"'),
      SPEC_LOOK_TEXT.replace(',"own":["hat.plume","coat.black"]', ''),
      'garbage',
    ].filter((raw) => K.serializeLook(K.parseLook(raw)) === raw);
    const fixFeats = [
      SPEC_FEATS_TEXT.replace('"prizes":{"privateer":2,"galleon":1}', '"prizes":{"galleon":1,"privateer":2}'),
      SPEC_FEATS_TEXT.replace('"captures":3', '"captures":"3"'),
      SPEC_FEATS_TEXT.replace('"legend":0', '"legend":2'),
      SPEC_FEATS_TEXT.replace('"galleon":1', '"galleon":1,"cutter":0'),
      SPEC_FEATS_TEXT.replace(',"prizes":{"privateer":2,"galleon":1}', ''),
    ].filter((raw) => K.serializeFeats(K.parseFeats(raw)) === raw);
    check(keep.length + fixLook.length + fixFeats.length === 0, `canonical records are kept as they are; looks and feats that needed fixing would be rewritten${keep.length + fixLook.length + fixFeats.length ? ' -> ' + [...keep, ...fixLook, ...fixFeats].join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ trophies, wearing and buying
  {
    // sanitizeLook: a worn trophy that is not earned goes back to the default (on load).
    const trophyLook = lookWith({ hat: 'crown', coat: 'admiral', pet: 'golden' }, { head: 'skull' });
    const none = K.sanitizeLook(trophyLook, K.defaultFeats());
    const all = K.sanitizeLook(trophyLook, ALL_FEATS);
    const almost = K.sanitizeLook(trophyLook, { captures: 9, boardings: 14, rakes: 49, legend: 0 });
    const some = K.sanitizeLook(JSON.stringify(trophyLook), JSON.stringify({ captures: 12, rakes: 3 }));
    check(same(none, DEFAULT_LOOK) && same(all, trophyLook) && same(almost, DEFAULT_LOOK) && same(some, lookWith({ coat: 'admiral' })),
      'sanitizeLook: unearned trophies go back to their defaults (one short of the mark too); earned ones stay; strings are read as records');
    const frozenLook = deepFreeze(JSON.parse(JSON.stringify(trophyLook)));
    const s2 = K.sanitizeLook(frozenLook, null);
    check(s2 !== frozenLook && same(frozenLook, trophyLook) && invalidLook(s2) === '', 'sanitizeLook never changes the look it is given');
    let sanJunk = '';
    for (const a of [null, 'x', proxy, revoked, 42]) for (const b of [null, 'x', proxy, revoked, 42]) {
      try {
        if (!same(K.sanitizeLook(a, b), DEFAULT_LOOK)) sanJunk += `${show(a)}/${show(b)} `;
      } catch (e) {
        sanJunk += `threw ${e.message} `;
      }
    }
    check(sanJunk === '', `sanitizeLook of junk gives the default look${sanJunk ? ' -> ' + sanJunk : ''}`);

    // wear()
    const base = deepFreeze(lookWith({}, {}, ['pet.parrot']));
    const snapshot = JSON.stringify(base);
    const W = (id, feats = null, look = base) => K.wear(look, feats, id);
    const results = {
      free: W('hat.straw'),
      crew: W('shirt.red'),
      ownedPaid: W('pet.parrot'),
      unownedPaid: W('hat.plume'),
      lockedTrophy: W('hat.crown'),
      lockedNearly: W('coat.admiral', { captures: 9 }),
      earnedTrophy: W('coat.admiral', { captures: 10 }),
      unknown: W('hat.nope'),
    };
    const want = {
      free: [true, null, lookWith({ hat: 'straw' }, {}, ['pet.parrot'])],
      crew: [true, null, lookWith({}, { shirt: 'red' }, ['pet.parrot'])],
      ownedPaid: [true, null, lookWith({ pet: 'parrot' }, {}, ['pet.parrot'])],
      unownedPaid: [false, 'not-owned', base],
      lockedTrophy: [false, 'locked', base],
      lockedNearly: [false, 'locked', base],
      earnedTrophy: [true, null, lookWith({ coat: 'admiral' }, {}, ['pet.parrot'])],
      unknown: [false, 'unknown', base],
    };
    const bad = Object.keys(want).filter((k) => {
      const r = results[k];
      return !r || r.ok !== want[k][0] || r.reason !== want[k][1] || !same(r.look, want[k][2]) || r.look === base;
    });
    check(bad.length === 0 && JSON.stringify(base) === snapshot, `wear: free, crew and owned items go on; an unowned paid item is refused ('not-owned'), an unearned trophy too ('locked'), unknown ids ('unknown'); the look given is never changed${bad.length ? ' -> ' + bad.map((k) => `${k}: ${show(results[k])}`).join('; ') : ''}`);
    const unknownIds = [undefined, null, '', 'hat', 'hat.', '.plume', 'plume', 'hat.__proto__', '__proto__', 'constructor', 'toString', 'hat.plume ', 'HAT.PLUME', 42, {}, ['hat.straw'], Symbol('x')];
    const badUnknown = unknownIds.filter((id) => {
      try {
        const r = K.wear(base, null, id);
        return r.ok || r.reason !== 'unknown' || !same(r.look, base);
      } catch {
        return true;
      }
    });
    check(badUnknown.length === 0, `wear: ${unknownIds.length} unknown ids are refused as 'unknown'${badUnknown.length ? ' -> ' + badUnknown.map(show).join(', ') : ''}`);
    const fromTrophy = K.wear(lookWith({ hat: 'crown' }), null, 'beard.goatee');
    check(fromTrophy.ok && same(fromTrophy.look, lookWith({ beard: 'goatee' })), 'wear: an unearned trophy in the look is sanitised away when something else is worn');

    // buy()
    const B = (id, purse, look = base) => K.buy(look, purse, id);
    const cases = [
      ['hat.plume', 180, true, null, 180, lookWith({ hat: 'plume' }, {}, ['hat.plume', 'pet.parrot'])],
      ['hat.plume', 1e9, true, null, 180, lookWith({ hat: 'plume' }, {}, ['hat.plume', 'pet.parrot'])],
      ['shirt.sunset', 60, true, null, 60, lookWith({}, { shirt: 'sunset' }, ['pet.parrot', 'shirt.sunset'])],
      ['hat.plume', 179, false, 'poor', 0, base],
      ['hat.plume', 0, false, 'poor', 0, base],
      ['hat.plume', -500, false, 'poor', 0, base],
      ['hat.plume', NaN, false, 'poor', 0, base],
      ['hat.plume', '500', false, 'poor', 0, base],
      ['hat.plume', undefined, false, 'poor', 0, base],
      ['hat.plume', Infinity, false, 'poor', 0, base],
      ['pet.parrot', 1000, false, 'owned', 0, base],
      ['hat.straw', 1000, false, 'free', 0, base],
      ['shirt.paint', 1000, false, 'free', 0, base],
      ['hat.crown', 1e9, false, 'trophy', 0, base],
      ['head.skull', 1e9, false, 'trophy', 0, base],
      ['hat.nope', 1e9, false, 'unknown', 0, base],
      ['__proto__', 1e9, false, 'unknown', 0, base],
    ];
    const badBuy = [];
    for (const [id, purse, ok, reason, cost, look] of cases) {
      let r;
      try {
        r = B(id, purse);
      } catch (e) {
        badBuy.push(`${id} ${purse}: threw ${e.message}`);
        continue;
      }
      if (r.ok !== ok || r.reason !== reason || r.cost !== cost || !same(r.look, look) || r.look === base) badBuy.push(`${id} with ${String(purse)}: ${show(r)}`);
    }
    check(badBuy.length === 0 && JSON.stringify(base) === snapshot, `buy: owns and wears a paid item for its price; refuses 'poor' (incl. NaN, '500', -500, Infinity purses), 'owned', 'free', 'trophy', 'unknown' with cost 0 (${cases.length} cases)${badBuy.length ? ' -> ' + badBuy.join('; ') : ''}`);

    // Buying the whole shop with exactly 1,200 gold.
    let look = K.defaultLook();
    let purse = 1200;
    let refused = '';
    for (const id of PAID) {
      const r = K.buy(look, purse, id);
      if (!r.ok) refused += `${id}:${r.reason} `;
      purse -= r.cost;
      look = r.look;
    }
    check(!refused && purse === 0 && same(look.own, PAID) && invalidLook(look) === '', `1,200 gold buys every paid item exactly (own in catalogue order: ${look.own.length} items)${refused ? ' -> ' + refused : ''}`);
  }

  // ------------------------------------------------------------------ itemState
  {
    const look = lookWith({ pet: 'parrot', coat: 'none' }, { shirt: 'teal' }, ['pet.parrot']);
    const S = (id, purse = 100, feats = null) => K.itemState(look, feats, purse, id);
    const cases = [
      ['hat.tricorn', S('hat.tricorn'), { worn: true, owned: true, free: true, price: 0, affordable: true, locked: false, lockText: '', label: 'Free' }],
      ['hat.straw', S('hat.straw', 0), { worn: false, owned: true, free: true, price: 0, affordable: true, locked: false, lockText: '', label: 'Free' }],
      ['shirt.teal', S('shirt.teal'), { worn: true, owned: true, free: true, price: 0, affordable: true, locked: false, lockText: '', label: 'Free' }],
      ['pet.parrot', S('pet.parrot', 0), { worn: true, owned: true, free: false, price: 150, affordable: true, locked: false, lockText: '', label: 'Owned' }],
      ['hat.bicorne 120', S('hat.bicorne', 120), { worn: false, owned: false, free: false, price: 120, affordable: true, locked: false, lockText: '', label: '120 gold' }],
      ['hat.plume 150', S('hat.plume', 150), { worn: false, owned: false, free: false, price: 180, affordable: false, locked: false, lockText: '', label: 'Need 30 more gold' }],
      ['hat.plume NaN', S('hat.plume', NaN), { worn: false, owned: false, free: false, price: 180, affordable: false, locked: false, lockText: '', label: 'Need 180 more gold' }],
      ['coat.admiral', S('coat.admiral', 1e6), { worn: false, owned: false, free: false, price: 0, affordable: false, locked: true, lockText: 'Locked: capture 10 ships', label: 'Locked: capture 10 ships' }],
      ['coat.admiral won', S('coat.admiral', 0, { captures: 10 }), { worn: false, owned: true, free: false, price: 0, affordable: true, locked: false, lockText: '', label: 'Trophy won' }],
    ];
    const bad = cases.filter(([, got, want]) => !same(got, want)).map(([name, got]) => `${name}: ${show(got)}`);
    check(bad.length === 0, `itemState: worn / owned / free / price / affordable / locked and the state line ("Free", "Owned", "120 gold", "Need 30 more gold", "Locked: capture 10 ships")${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    const locks = Object.values(ITEMS).filter((it) => it.trophy).map((it) => K.itemState(null, null, 0, it.id));
    check(locks.every((s) => s.locked && /^Locked: \S/.test(s.lockText) && s.label === s.lockText && !s.affordable), `every trophy reads "Locked: …" until it is won (${locks.map((s) => s.lockText).join(' | ')})`);
    let nul = [];
    try {
      nul = ['hat.nope', '__proto__', undefined, 7, 'toString'].map((id) => K.itemState(look, null, 0, id));
    } catch (e) {
      nul = [e.message];
    }
    check(nul.every((s) => s === null), 'itemState of an unknown id is null');
    const everyItem = Object.keys(ITEMS).every((id) => {
      const s = K.itemState(look, ALL_FEATS, 0, id);
      return s && Object.keys(s).join() === 'worn,owned,free,price,affordable,locked,lockText,label' && typeof s.label === 'string' && s.label.length > 0;
    });
    check(everyItem, 'itemState gives every item a full state with a non-empty label');
  }

  // ------------------------------------------------------------------ Surprise me!
  {
    const start = deepFreeze(lookWith({ hat: 'plume', pet: 'parrot', coat: 'admiral' }, { shirt: 'navy', head: 'tricorns' }, ['hat.plume', 'pet.parrot', 'shirt.navy', 'head.tricorns']));
    const snapshot = JSON.stringify(start);
    const bad = [];
    const seen = {};
    for (const group of ['captain', 'crew']) {
      const g = group === 'captain' ? 'cap' : 'crew';
      const other = group === 'captain' ? 'crew' : 'cap';
      for (let seed = 1; seed <= 400; seed++) {
        const from = seed % 2 ? start : K.defaultLook();
        const r = K.surprise(from, group, rngOf(seed));
        const again = K.surprise(from, group, rngOf(seed));
        const err = invalidLook(r);
        if (err) bad.push(`${group} ${seed}: ${err}`);
        else {
          if (!same(r[other], from[other])) bad.push(`${group} ${seed}: changed the ${other} slots`);
          if (!same(r.own, from.own)) bad.push(`${group} ${seed}: changed own`);
          const slots = SLOTS[group];
          const nonFree = slots.filter((s) => {
            const it = ITEMS[`${s}.${r[g][s]}`];
            return it.price || it.trophy;
          });
          if (nonFree.length) bad.push(`${group} ${seed}: wears ${nonFree.join(', ')}`);
          if (slots.every((s) => r[g][s] === from[g][s])) bad.push(`${group} ${seed}: nothing changed`);
          if (!same(r, again)) bad.push(`${group} ${seed}: not deterministic`);
          for (const s of slots) (seen[s] = seen[s] || new Set()).add(r[g][s]);
        }
      }
    }
    check(bad.length === 0 && JSON.stringify(start) === snapshot, `surprise: 800 rolls put only free items on one group, leave the other group and own alone, always change something, repeat with the same rng${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    const missing = [...CAP, ...CREW].filter((s) => !CATALOGUE[s].free.every((k) => seen[s] && seen[s].has(k)));
    check(missing.length === 0, `surprise reaches every free option of every slot${missing.length ? ' -> missing in ' + missing.join(', ') : ''}`);
    const weird = [];
    const rngs = [() => NaN, () => 1, () => -5, () => Infinity, () => 0.9999999999, () => { throw new Error('rng'); }, () => Symbol('x'), () => '0.5', null, undefined, 42, {}];
    for (const r of rngs) {
      for (const group of ['captain', 'crew']) {
        try {
          const out = K.surprise(start, group, r);
          if (invalidLook(out)) weird.push(`${show(r)}: ${invalidLook(out)}`);
        } catch (e) {
          weird.push(`${show(r)} threw ${e.message}`);
        }
      }
    }
    const groups = ['Captain', 'cap', 'all', '', null, undefined, 3, '__proto__'].map((g) => {
      try {
        return same(K.surprise(start, g, rngOf(1)), start);
      } catch {
        return false;
      }
    });
    check(weird.length === 0 && groups.every(Boolean), `surprise with a broken rng still gives a valid look; an unknown group changes nothing${weird.length ? ' -> ' + weird.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ captainOpts
  {
    const REQUIRED = ['kind', 'outfit', 'seed', 'hat', 'hatColor', 'coat', 'coatTrim', 'beard', 'hair', 'hairStyle', 'skin', 'eyepatch', 'earring', 'pet', 'shirt', 'stripes', 'shirt2', 'accent', 'pants', 'tool'];
    const d = K.captainOpts(K.defaultLook());
    const shape = REQUIRED.filter((k) => !(k in d));
    check(
      !badOpts(d) && !shape.length && d.kind === 'pirate' && d.outfit === 'pirate' && d.seed === 7 && d.hat === 'tricorn' && d.hatColor === PALETTE.hatBlack &&
        isHex(d.coat) && d.beard === 'full' && d.hairStyle === 'crop' && d.skin === 0xefb488 && d.eyepatch === false && d.earring === true &&
        d.pet === 'none' && !('petColor' in d) && d.tool === 'none',
      `captainOpts (default): a pirate in a tricorn and crimson coat, full beard, brown crop, skin s3, seed 7${badOpts(d) || shape.length ? ' -> ' + badOpts(d) + ' missing ' + shape : ''}`,
    );
    // Every captain item: the options people.js understands, colours from PALETTE, the item visible in them.
    const bad = [];
    const HAT = { tricorn: 'tricorn', bandana: 'bandana', straw: 'straw', none: 'none', bicorne: 'bicorne', plume: 'plumed', crown: 'crown' };
    for (const id of Object.keys(ITEMS).filter((i) => ITEMS[i].group === 'captain')) {
      const it = ITEMS[id];
      const L = K.wear(lookWith({}, {}, PAID), ALL_FEATS, id).look;
      const o = K.captainOpts(L);
      const t = K.captainOpts(K.defaultLook(), id); // the same item as a try-on
      const err = badOpts(o) || badOpts(t);
      if (err) bad.push(`${id}: ${err}`);
      if (!same(o, t)) bad.push(`${id}: try-on differs from wearing it`);
      const miss = REQUIRED.filter((k) => !(k in o));
      if (miss.length) bad.push(`${id}: missing ${miss}`);
      const k = it.key;
      const shows = {
        hat: () => o.hat === HAT[k],
        coat: () => (k === 'none' ? o.coat === null && o.stripes === true && isHex(o.vest) : o.coat === it.opts.coat && isHex(o.coat) && o.vest === null),
        beard: () => o.beard === k,
        hair: () => o.hair === it.opts.hair,
        hairstyle: () => o.hairStyle === k,
        skin: () => o.skin === PALETTE[k],
        body: () => o.kind === (k === 'slim' ? 'woman' : 'pirate') && o.outfit === 'pirate',
        pet: () => (k === 'none' ? o.pet === 'none' && !('petColor' in o) : o.pet === 'parrot' && PERSON_OPTS.petColor(o.petColor)),
        patch: () => o.eyepatch === (k === 'on'),
      }[it.slot];
      if (!shows()) bad.push(`${id}: not in the options (${show(o)})`);
    }
    check(bad.length === 0, `captainOpts: every captain item gives valid buildPerson options with PALETTE colours, shows in them, and tries on the same${bad.length ? ' -> ' + bad.slice(0, 5).join('; ') : ''}`);
    const parrots = ['pet.parrot', 'pet.macaw', 'pet.golden'].map((id) => JSON.stringify(K.captainOpts(null, id).petColor));
    const hairs = Object.keys(ITEMS).filter((id) => ITEMS[id].slot === 'hair').map((id) => K.captainOpts(null, id).hair);
    const coats = Object.keys(ITEMS).filter((id) => ITEMS[id].slot === 'coat').map((id) => K.captainOpts(null, id).coat);
    check(new Set(parrots).size === 3 && new Set(hairs).size === hairs.length && new Set(coats).size === coats.length, 'parrots, hair colours and coats all look different');
    const trialJunk = ['shirt.red', 'hat.nope', null, 42, {}, '__proto__'].every((tr) => same(K.captainOpts(K.defaultLook(), tr), d));
    check(trialJunk, 'captainOpts ignores a crew item or an unknown id as the try-on');
    const a = K.captainOpts(null, 'pet.parrot');
    a.petColor.body = 1;
    a.hat = 'cap';
    check(same(K.captainOpts(null, 'pet.parrot').petColor, ITEMS['pet.parrot'].opts.petColor) && K.captainOpts(null).hat === 'tricorn', 'captainOpts returns fresh objects (changing them changes nothing)');
  }

  // ------------------------------------------------------------------ crewOpts
  {
    // The six cleaning-crew sailors on the docked ship (sparrow.js) and other bases the game uses.
    const BASES = [
      { kind: 'pirate', tool: 'mop', hat: 'bandana', seed: 11 },
      { kind: 'pirate', tool: 'mop', hat: 'tricorn', seed: 23, beard: true },
      { kind: 'pirate', tool: 'brush', seed: 41, hat: 'none', shirt: 0x3f8fd8 },
      { kind: 'pirate', tool: 'bucket', seed: 13, hat: 'tricorn' },
      { kind: 'pirate', tool: 'brush', seed: 5, hat: 'bandana' },
      { kind: 'kid', tool: 'brush', seed: 2 },
      { kind: 'pirate', seed: 1, tool: 'cutlass', share: true, detail: 'low', scale: 1.05 },
    ];
    const bad = [];
    for (const base of BASES) {
      const frozen = deepFreeze({ ...base });
      for (const paint of [LOOKS.hull[2], undefined]) {
        const o = K.crewOpts(K.defaultLook(), 99, frozen, paint);
        if (!same(o, base) || o === frozen || Object.keys(o).join() !== Object.keys(base).join()) bad.push(`${show(base)} -> ${show(o)}`);
      }
    }
    check(bad.length === 0, `crewOpts with the default crew look leaves each sailor's options exactly as they were (${BASES.length} sailors, a fresh copy)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    check(same(K.crewOpts(null, 3), { kind: 'pirate', seed: 3 }) && same(K.crewOpts(K.defaultLook(), 3.7, null, null), { kind: 'pirate', seed: 3 }) && same(K.crewOpts(null, NaN), { kind: 'pirate', seed: 0 }), 'crewOpts without base options: a pirate sailor with that seed');

    const want = {
      'shirt.red': { stripes: true, shirt: PALETTE.scarlet, vest: null },
      'shirt.blue': { stripes: true, shirt: PALETTE.blue, vest: null },
      'shirt.black': { stripes: true, shirt: PALETTE.ink, vest: null },
      'shirt.teal': { stripes: false, shirt: PALETTE.teal, vest: null },
      'shirt.navy': { stripes: false, coat: PALETTE.navy, vest: null },
      'shirt.sunset': { stripes: true, vest: null },
      'head.bandanas': { hat: 'bandana' },
      'head.caps': { hat: 'cap' },
      'head.tricorns': { hat: 'tricorn' },
      'head.skull': { hat: 'bandana', hatColor: PALETTE.ink, hatBadge: 'skull' },
      'sash.gold': { accent: PALETTE.gold },
      'sash.red': { accent: PALETTE.scarlet },
      'sash.teal': { accent: PALETTE.teal },
      'sash.purple': { accent: PALETTE.purple },
    };
    const badItems = [];
    for (const [id, fields] of Object.entries(want)) {
      for (const base of BASES) {
        const L = K.wear(lookWith({}, {}, PAID), ALL_FEATS, id).look;
        const o = K.crewOpts(L, 4, base, LOOKS.hull[0]);
        const t = K.crewOpts(K.defaultLook(), 4, base, LOOKS.hull[0], id);
        const err = badOpts(o, { extraHex: [base.shirt] });
        if (err) badItems.push(`${id}: ${err}`);
        if (!same(o, t)) badItems.push(`${id}: try-on differs`);
        const off = Object.keys(fields).filter((k) => o[k] !== fields[k]);
        if (off.length) badItems.push(`${id} on ${base.seed}: ${off.map((k) => `${k} ${show(o[k])}`).join(', ')}`);
        const kept = ['kind', 'seed', 'tool', 'share', 'detail', 'scale'].filter((k) => k in base && o[k] !== base[k]);
        if (kept.length) badItems.push(`${id} lost the sailor's ${kept}`);
      }
    }
    check(badItems.length === 0, `crewOpts: each uniform item is merged over the sailor's own options (kind, seed, tool kept) with valid options and PALETTE colours${badItems.length ? ' -> ' + badItems.slice(0, 5).join('; ') : ''}`);

    // Match the ship's paint: shirt = the hull paint's top, stripes = its bottom.
    const paintBad = [];
    const L = K.wear(K.defaultLook(), null, 'shirt.paint').look;
    for (const hull of LOOKS.hull) {
      const o = K.crewOpts(L, 4, BASES[0], hull);
      if (o.shirt !== hull.top || o.shirt2 !== hull.bottom || o.stripes !== true || o.vest !== null || badOpts(o, { extraHex: [hull.top, hull.bottom] })) paintBad.push(`${hull.id}: ${show(o)}`);
    }
    for (const junk of [null, undefined, {}, { top: 'red', bottom: 1 }, { top: -1, bottom: 2 }, { top: 0x1000000, bottom: 0 }, proxy, revoked, 'honey', 42]) {
      const o = K.crewOpts(L, 4, BASES[0], junk);
      if (o.shirt !== LOOKS.hull[0].top || o.shirt2 !== LOOKS.hull[0].bottom || badOpts(o)) paintBad.push(`${show(junk)}: ${show(o)}`);
    }
    check(paintBad.length === 0, `"Match the ship's paint" stripes the shirts in each of the ${LOOKS.hull.length} hull paints (shirt = top, stripes = bottom); a missing paint gives the stock Honey & Teal${paintBad.length ? ' -> ' + paintBad.join('; ') : ''}`);

    let hostileBase = '';
    for (const b of [proxy, revoked, arrayProxy, hostile, [], 'pirate', 42]) {
      try {
        const o = K.crewOpts(lookWith({}, { shirt: 'red' }), 6, b, null);
        if (badOpts(o) || o.seed === undefined && !('kind' in o)) hostileBase += `${show(b)} `;
      } catch (e) {
        hostileBase += `${show(b)} threw ${e.message} `;
      }
    }
    check(hostileBase === '', `crewOpts with hostile or broken base options never throws${hostileBase ? ' -> ' + hostileBase : ''}`);
  }

  // ------------------------------------------------------------------ enemyCrewOpts
  {
    const bad = [];
    const looks = {};
    for (const type of FEAT_PRIZE_TYPES) {
      looks[type] = [];
      for (let seed = 0; seed < 60; seed++) {
        const o = K.enemyCrewOpts(type, seed);
        const err = badOpts(o);
        if (err) bad.push(`${type} ${seed}: ${err}`);
        if (o.seed !== seed) bad.push(`${type} ${seed}: seed ${o.seed}`);
        if (!same(o, K.enemyCrewOpts(type, seed))) bad.push(`${type} ${seed}: not deterministic`);
        looks[type].push(o);
      }
    }
    check(bad.length === 0, `enemyCrewOpts: every enemy type × 60 seeds gives valid, deterministic buildPerson options with PALETTE colours${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    const all = (type, fn) => looks[type].every(fn);
    const some = (type, fn) => looks[type].some(fn);
    const faction = {
      'cutter/privateer: black and red bandanas': ['cutter', 'privateer'].every((t) => all(t, (o) => o.hat === 'bandana' && [PALETTE.ink, PALETTE.scarlet].includes(o.hatColor)) && some(t, (o) => o.hatColor === PALETTE.ink) && some(t, (o) => o.hatColor === PALETTE.scarlet)),
      'prahu/junk: straw hats and kerchiefs': ['prahu', 'junk'].every((t) => all(t, (o) => ['straw', 'kerchief'].includes(o.hat)) && some(t, (o) => o.hat === 'straw') && some(t, (o) => o.hat === 'kerchief')),
      'corsair: red bandanas, dark vests': all('corsair', (o) => o.hat === 'bandana' && o.hatColor === PALETTE.scarlet && o.vest === PALETTE.ink),
      "man-o'-war: navy coats and tricorns": all('manowar', (o) => o.hat === 'tricorn' && o.coat === PALETTE.navy),
      'galleon: caps, yellow or red shirts, man build': all('galleon', (o) => o.kind === 'man' && o.hat === 'cap' && [PALETTE.gold, PALETTE.scarlet].includes(o.shirt)) && some('galleon', (o) => o.shirt === PALETTE.gold) && some('galleon', (o) => o.shirt === PALETTE.scarlet),
      'raider: horned helmets, beards, fur-brown vests': all('raider', (o) => o.hat === 'horned' && ['full', 'braids'].includes(o.beard) && o.vest === PALETTE.fur) && some('raider', (o) => o.beard === 'full') && some('raider', (o) => o.beard === 'braids'),
      'phantom: pale green skin, dark grey rags, no hats': all('phantom', (o) => o.skin === 0x9fe0c0 && o.hat === 'none' && o.shirt === PALETTE.rags),
      'inferno: a look of its own': all('inferno', (o) => o.hat === 'bandana' && o.hatColor === PALETTE.soot),
    };
    // Neighbouring seeds (a ship's sailors) differ: every pick shows both ways within seeds 1–8,
    // and no pick repeats more than 4 times in a row over 200 seeds (the first pick: twice).
    const varied = {
      'cutter bandanas': (o) => o.hatColor, 'prahu hats': (o) => o.hat, 'galleon shirts': (o) => o.shirt, 'galleon caps': (o) => o.hatColor, 'raider beards': (o) => o.beard,
    };
    for (const [name, key] of Object.entries(varied)) {
      const type = name.split(' ')[0];
      const vals = Array.from({ length: 200 }, (_, s) => key(K.enemyCrewOpts(type, s)));
      let run = 1;
      let longest = 1;
      for (let i = 1; i < vals.length; i++) longest = Math.max(longest, (run = vals[i] === vals[i - 1] ? run + 1 : 1));
      const first = name !== 'galleon caps';
      faction[`${name} vary from sailor to sailor (longest run ${longest})`] = new Set(vals.slice(1, 9)).size > 1 && longest <= (first ? 2 : 4);
    }
    const off = Object.keys(faction).filter((k) => !faction[k]);
    check(off.length === 0, `enemyCrewOpts: each faction has its look (${Object.keys(faction).length} factions)${off.length ? ' -> ' + off.join('; ') : ''}`);
    let plain;
    try {
      plain = [['player', 3], ['nope', 3], ['__proto__', 3], ['constructor', 3], [undefined, 3], [42, 3], ['cutter', NaN], ['cutter', undefined]].map(([t, s]) => K.enemyCrewOpts(t, s));
    } catch (e) {
      plain = [e.message];
    }
    check(plain.slice(0, 6).every((o) => same(o, { kind: 'pirate', seed: 3 })) && plain.slice(6).every((o) => o.seed === 0 && !badOpts(o)), 'enemyCrewOpts: an unknown type is a plain pirate; a broken seed is 0');
  }

  // ------------------------------------------------------------------ nothing ever throws
  {
    const junk = [undefined, null, 0, -1, NaN, Infinity, '', 'x', '{}', 'hat.plume', 'captain', [], {}, Symbol('s'), 1n, () => 0.5, proxy, revoked, hostile];
    const fns = ['defaultLook', 'parseLook', 'serializeLook', 'sanitizeLook', 'defaultFeats', 'parseFeats', 'serializeFeats', 'itemState', 'wear', 'buy', 'surprise', 'captainOpts', 'crewOpts', 'enemyCrewOpts'];
    const bad = [];
    let calls = 0;
    const rng = rngOf(5);
    for (const f of fns) {
      for (let i = 0; i < 600; i++) {
        const args = [0, 1, 2, 3, 4].map(() => junk[Math.floor(rng() * junk.length)]);
        calls++;
        try {
          K[f](...args);
        } catch (e) {
          bad.push(`${f}(${args.map(show).join(', ')}): ${e.message}`);
        }
      }
    }
    check(bad.length === 0, `no cosmetics function throws on junk arguments (${calls} random calls)${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    const before = JSON.stringify(ITEMS) + JSON.stringify(PALETTE);
    K.captainOpts(null, 'pet.golden').petColor.body = 0;
    K.crewOpts(null, 1, null, null, 'shirt.navy').coat = 0;
    check(JSON.stringify(ITEMS) + JSON.stringify(PALETTE) === before, 'the catalogue is never changed by the functions');
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll cosmetics checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
