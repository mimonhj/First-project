// The captain's and crew's looks from Polly's Plumes & Trims (pure data + logic, no three.js, no
// imports, so the game, the tests and Node can all load it). SPEC2 §7.9, §8.
//
// Items: ITEMS['<slot>.<key>'] = { id, slot, key, group, name, price?, trophy?, swatch, isDefault?, opts }.
// Slot names are unique across the two groups ('captain' slots live in look.cap, 'crew' slots in
// look.crew). Every slot has exactly one default, and it is free; paid items cost treasure-chest gold
// and are remembered in look.own once bought; trophies are never bought, they unlock by feats.
//
// A look is { v: 1, cap: { <captain slot>: key }, crew: { <crew slot>: key }, own: [paid item ids] }
// and is stored as exactly that JSON (serializeLook). Feats are { captures, boardings, rakes, crits,
// legend, prizes: { <enemy type>: count } } (serializeFeats). parseLook / parseFeats accept anything
// (missing, blocked or tampered storage, or an object) and never throw: field by field, own
// properties only, a hostile object counts as missing, unknown fields are dropped.
//
// captainOpts / crewOpts / enemyCrewOpts turn looks into buildPerson() options (people.js, §7.10),
// using only hex colours from PALETTE (plus the hull paint main passes in for "Match the ship's paint").

/** Named colours used by the items and the person options (every hex the options emit is in here). */
export const PALETTE = Object.freeze({
  // hats, coats and trims
  hatBlack: 0x2b2433,
  ink: 0x26232e,
  scarlet: 0xe2383d,
  crimson: 0xb3262f,
  navy: 0x2c3e7a,
  emerald: 0x1f8a55,
  plum: 0x6b2f8f,
  admiral: 0xf6f1e4,
  gold: 0xffc93c,
  silver: 0xc7d0dd,
  straw: 0xf2cf6b,
  // shirts, sashes and breeches
  cream: 0xfaf3e3,
  white: 0xfffaf0,
  blue: 0x2f5fd0,
  sky: 0x2f86ea,
  teal: 0x16a5a2,
  purple: 0x8a5bd6,
  orange: 0xf28a2e,
  rose: 0xff5fa2,
  breeches: 0x3b3442,
  leather: 0x5a3a26,
  linen: 0xd9c8a8,
  honey: 0xf3b23f, // the stock hull paint's bottom ("Match the ship's paint" without a hull paint)
  // hair
  hairBrown: 0x4a2c1a,
  hairBlack: 0x1d1b26,
  ginger: 0xc8641e,
  blonde: 0xe8b64a,
  hairGrey: 0xbfc5cf,
  seaDye: 0x2fb3d6,
  coralDye: 0xff7f86,
  // skin tones: people.js SKIN[0..6]
  s1: 0xffdcbf,
  s2: 0xf9c9a0,
  s3: 0xefb488,
  s4: 0xe0a172,
  s5: 0xc98756,
  s6: 0xa86a43,
  s7: 0x87502f,
  // parrots
  goldenBody: 0xffcc3a,
  goldenWing: 0xffe27a,
  goldenHead: 0xfff3b0,
  // enemy crews
  fur: 0x7a5232,
  steel: 0xa7afb9,
  ghostSkin: 0x9fe0c0,
  ghostHair: 0xc2dccf,
  rags: 0x4a4d52,
  ragsDark: 0x34363b,
  soot: 0x2a2730,
  ember: 0xf2602a,
  bare: 0xe8dcc4, // swatch for "none" items (no colour to show)
});
const C = PALETTE;

export const SLOTS = Object.freeze({
  captain: Object.freeze(['hat', 'coat', 'beard', 'hair', 'hairstyle', 'skin', 'body', 'pet', 'patch']),
  crew: Object.freeze(['shirt', 'head', 'sash']),
});

/** UI group headings, also used for announcements ("Hat: Bandana"). */
export const SLOT_NAMES = Object.freeze({
  hat: 'Hat', coat: 'Coat', beard: 'Beard', hair: 'Hair colour', hairstyle: 'Hairstyle', skin: 'Skin', body: 'Body',
  pet: 'Pet', patch: 'Eyepatch', shirt: 'Shirts', head: 'Headgear', sash: 'Sash',
});

export const FEAT_IDS = Object.freeze(['captures', 'boardings', 'rakes', 'crits', 'legend']);
/** Enemy ship types whose captures are counted in feats.prizes (SHIP_TYPES minus the player). */
export const FEAT_PRIZE_TYPES = Object.freeze(['cutter', 'privateer', 'prahu', 'junk', 'corsair', 'manowar', 'inferno', 'galleon', 'raider', 'phantom']);

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------
// One row per item, in display order inside its slot (the default first; skin tones light to dark):
// [key, name, swatch, opts, extra] — extra: { price } | { trophy } | { isDefault: true }.
// `opts` is what wearing it adds to the person's buildPerson options.
const coat = (colour, trim) => ({ coat: colour, coatTrim: trim, stripes: false, shirt: C.cream, shirt2: C.cream, vest: null });
const CATALOGUE = {
  // ----- captain -----
  hat: [
    ['tricorn', 'Tricorn', [C.hatBlack, C.gold], { hat: 'tricorn', hatColor: C.hatBlack }, { isDefault: true }],
    ['bandana', 'Bandana', [C.scarlet], { hat: 'bandana', hatColor: C.scarlet }],
    ['straw', 'Straw hat', [C.straw], { hat: 'straw', hatColor: C.straw }],
    ['none', 'No hat', [C.bare], { hat: 'none', hatColor: C.hatBlack }],
    ['bicorne', "Admiral's bicorne", [C.hatBlack, C.gold], { hat: 'bicorne', hatColor: C.hatBlack }, { price: 120 }],
    ['plume', "Cavalier's plume", [C.hatBlack, C.scarlet], { hat: 'plumed', hatColor: C.hatBlack }, { price: 180 }],
    ['crown', "Pirate King's crown", [C.gold, C.scarlet], { hat: 'crown', hatColor: C.gold },
      { trophy: { feat: 'legend', min: 1, text: 'capture the Phantom Galleon', unit: 'Phantom Galleon captured' } }],
  ],
  coat: [
    // with a coat: a plain cream shirt in the open front; "none" is the striped shirt and a vest
    ['crimson', 'Crimson coat', [C.crimson, C.gold], coat(C.crimson, C.gold), { isDefault: true }],
    ['navy', 'Navy coat', [C.navy, C.gold], coat(C.navy, C.gold)],
    ['none', 'Shirt and vest', [C.scarlet, C.leather], { coat: null, coatTrim: C.gold, stripes: true, shirt: C.scarlet, shirt2: C.white, vest: C.leather }],
    ['black', 'Black coat', [C.ink, C.scarlet], coat(C.ink, C.scarlet), { price: 60 }],
    ['emerald', 'Emerald coat', [C.emerald, C.gold], coat(C.emerald, C.gold), { price: 60 }],
    ['plum', 'Plum coat', [C.plum, C.silver], coat(C.plum, C.silver), { price: 60 }],
    ['admiral', "Admiral's white coat", [C.admiral, C.gold], coat(C.admiral, C.gold),
      { trophy: { feat: 'captures', min: 10, text: 'capture 10 ships', unit: 'captures' } }],
  ],
  beard: [
    ['full', 'Full beard', [C.hairBrown], { beard: 'full' }, { isDefault: true }],
    ['goatee', 'Goatee', [C.hairBrown], { beard: 'goatee' }],
    ['stubble', 'Stubble', [C.s4], { beard: 'stubble' }],
    ['none', 'Clean-shaven', [C.bare], { beard: 'none' }],
    ['braids', 'Blackbeard braids', [C.hairBlack, C.gold], { beard: 'braids' }, { price: 80 }],
    ['handlebar', 'Curly moustache', [C.hairBrown], { beard: 'handlebar' }, { price: 40 }],
  ],
  hair: [
    ['brown', 'Brown', [C.hairBrown], { hair: C.hairBrown }, { isDefault: true }],
    ['black', 'Black', [C.hairBlack], { hair: C.hairBlack }],
    ['ginger', 'Ginger', [C.ginger], { hair: C.ginger }],
    ['blonde', 'Blonde', [C.blonde], { hair: C.blonde }],
    ['grey', 'Grey', [C.hairGrey], { hair: C.hairGrey }],
    ['sea', 'Sea-blue dye', [C.seaDye], { hair: C.seaDye }, { price: 50 }],
    ['coral', 'Coral-pink dye', [C.coralDye], { hair: C.coralDye }, { price: 50 }],
  ],
  hairstyle: [
    ['crop', 'Cropped', [C.hairBrown], { hairStyle: 'crop' }, { isDefault: true }],
    ['long', 'Long', [C.hairBrown], { hairStyle: 'long' }],
    ['ponytail', 'Ponytail', [C.hairBrown], { hairStyle: 'ponytail' }],
    ['bald', 'Bald', [C.s3], { hairStyle: 'bald' }],
  ],
  skin: [1, 2, 3, 4, 5, 6, 7].map((n) => {
    const hex = C[`s${n}`];
    return [`s${n}`, `Tone ${n}`, [hex], { skin: hex }, n === 3 ? { isDefault: true } : undefined];
  }),
  body: [
    ['broad', 'Broad', [C.crimson], { kind: 'pirate' }, { isDefault: true }],
    ['slim', 'Slim', [C.crimson], { kind: 'woman' }],
  ],
  pet: [
    ['none', 'No pet', [C.bare], { pet: 'none' }, { isDefault: true }],
    ['parrot', 'Red parrot', [C.scarlet, C.blue], { pet: 'parrot', petColor: { body: C.scarlet, wing: C.blue, head: C.gold } }, { price: 150 }],
    ['macaw', 'Blue macaw', [C.sky, C.gold], { pet: 'parrot', petColor: { body: C.sky, wing: C.blue, head: C.gold } }, { price: 150 }],
    ['golden', 'Golden parrot', [C.goldenBody, C.goldenWing], { pet: 'parrot', petColor: { body: C.goldenBody, wing: C.goldenWing, head: C.goldenHead } },
      { trophy: { feat: 'rakes', min: 50, text: 'land 50 raking shots', unit: 'raking shots' } }],
  ],
  patch: [
    ['off', 'No eyepatch', [C.bare], { eyepatch: false }, { isDefault: true }],
    ['on', 'Eyepatch', [C.ink], { eyepatch: true }],
  ],
  // ----- crew uniform (merged over each sailor's own options; own / mixed change nothing) -----
  shirt: [
    ['own', 'Their own clothes', [C.bare], {}, { isDefault: true }],
    // (no vests: every sailor shows the uniform)
    ['red', 'Red stripes', [C.scarlet, C.white], { stripes: true, shirt: C.scarlet, shirt2: C.white, vest: null }],
    ['blue', 'Blue stripes', [C.blue, C.white], { stripes: true, shirt: C.blue, shirt2: C.white, vest: null }],
    ['black', 'Black stripes', [C.ink, C.white], { stripes: true, shirt: C.ink, shirt2: C.white, vest: null }],
    ['teal', 'Teal shirts', [C.teal], { stripes: false, shirt: C.teal, shirt2: C.teal, vest: null }],
    // the colours come from the hull paint (crewOpts); these are the stock paint's
    ['paint', "Match the ship's paint", [C.teal, C.honey], { stripes: true, shirt: C.teal, shirt2: C.honey, vest: null }],
    ['navy', 'Navy jackets', [C.navy, C.gold], { ...coat(C.navy, C.gold) }, { price: 60 }],
    ['sunset', 'Sunset stripes', [C.orange, C.rose], { stripes: true, shirt: C.orange, shirt2: C.rose, vest: null }, { price: 60 }],
  ],
  head: [
    ['mixed', 'Their own hats', [C.bare], {}, { isDefault: true }],
    ['bandanas', 'Bandanas', [C.scarlet], { hat: 'bandana', hatColor: C.scarlet }],
    ['caps', 'Caps', [C.navy], { hat: 'cap', hatColor: C.navy }],
    ['tricorns', 'Tricorns', [C.hatBlack, C.gold], { hat: 'tricorn', hatColor: C.hatBlack }, { price: 80 }],
    ['skull', 'Skull bandanas', [C.ink, C.white], { hat: 'bandana', hatColor: C.ink, hatBadge: 'skull' },
      { trophy: { feat: 'boardings', min: 15, text: 'fight 15 boardings', unit: 'boardings' } }],
  ],
  sash: [
    ['own', 'Their own sashes', [C.bare], {}, { isDefault: true }],
    ['gold', 'Gold sashes', [C.gold], { accent: C.gold }],
    ['red', 'Red sashes', [C.scarlet], { accent: C.scarlet }],
    ['teal', 'Teal sashes', [C.teal], { accent: C.teal }],
    ['purple', 'Purple sashes', [C.purple], { accent: C.purple }],
  ],
};

const GROUP_OF = {}; // slot -> 'captain' | 'crew'
for (const g of ['captain', 'crew']) for (const s of SLOTS[g]) GROUP_OF[s] = g;
const LOOK_KEY = { captain: 'cap', crew: 'crew' }; // where a group's slots live in a look

function freezeDeep(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) freezeDeep(v);
  }
  return o;
}

/** Every item by id ('hat.plume'), slots in SLOTS order, items in display order. Frozen. */
export const ITEMS = (() => {
  const out = {};
  for (const slot of [...SLOTS.captain, ...SLOTS.crew]) {
    for (const [key, name, swatch, opts, extra = {}] of CATALOGUE[slot]) {
      const id = `${slot}.${key}`;
      const it = { id, slot, key, group: GROUP_OF[slot], name, swatch, opts };
      if (extra.price) it.price = extra.price;
      if (extra.trophy) it.trophy = extra.trophy;
      if (extra.isDefault) it.isDefault = true;
      out[id] = it;
    }
  }
  return freezeDeep(out);
})();

const ALL_IDS = Object.keys(ITEMS);
const PAID_IDS = ALL_IDS.filter((id) => ITEMS[id].price > 0); // catalogue order = the order `own` is written in
const FREE_KEYS = {}; // slot -> keys of its free items
const DEFAULT_KEY = {}; // slot -> its default key
for (const id of ALL_IDS) {
  const it = ITEMS[id];
  if (!it.price && !it.trophy) (FREE_KEYS[it.slot] = FREE_KEYS[it.slot] || []).push(it.key);
  if (it.isDefault) DEFAULT_KEY[it.slot] = it.key;
}

// ---------------------------------------------------------------------------
// Validation helpers (the parseShipConfig rules of upgrades.js)
// ---------------------------------------------------------------------------
const MAX_RAW = 16 * 1024; // a real look or feats record is ~300 characters; anything far bigger is junk
const MAX_OWN = 64; // at most this many `own` entries are kept...
const OWN_SCAN = 256; // ...out of the first this many in the record
const MAX_COUNT = 1000000;
const MAX_PRIZE = 9999;
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
const isHex = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;

// Read one field; a hostile object (throwing getter or proxy) just counts as missing.
function field(o, k) {
  try {
    return hasOwn(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
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

// Storage text -> object for clean(); null for anything unreadable. Throws only on bad JSON
// (the callers catch it).
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

/** The item with this id, or null (own properties only: '__proto__', 'toString'... are not items). */
function item(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null;
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------
/** A fresh default look: every slot on its free default, nothing bought. */
export function defaultLook() {
  const look = { v: 1, cap: {}, crew: {}, own: [] };
  for (const s of SLOTS.captain) look.cap[s] = DEFAULT_KEY[s];
  for (const s of SLOTS.crew) look.crew[s] = DEFAULT_KEY[s];
  return look;
}

function cleanLook(obj) {
  const look = defaultLook();
  if (!isRecord(obj)) return look;
  // own: known paid ids only, deduped, in catalogue order
  const ownRaw = field(obj, 'own');
  const owned = new Set();
  if (isArray(ownRaw)) {
    let len = 0;
    try {
      len = ownRaw.length;
    } catch {
      len = 0;
    }
    const n = Number.isSafeInteger(len) ? Math.min(len, OWN_SCAN) : 0;
    for (let i = 0; i < n && owned.size < MAX_OWN; i++) {
      const it = item(field(ownRaw, i));
      if (it && it.price > 0) owned.add(it.id);
    }
  }
  look.own = PAID_IDS.filter((id) => owned.has(id));
  // slots: a known key of that slot; a paid item must be owned (trophies are checked by sanitizeLook)
  for (const group of ['captain', 'crew']) {
    const rec = field(obj, LOOK_KEY[group]);
    if (!isRecord(rec)) continue;
    for (const slot of SLOTS[group]) {
      const key = field(rec, slot);
      const it = typeof key === 'string' ? item(`${slot}.${key}`) : null;
      if (!it || it.slot !== slot) continue;
      if (it.price > 0 && !owned.has(it.id)) continue;
      look[LOOK_KEY[group]][slot] = it.key;
    }
  }
  return look;
}

/**
 * Read a stored look (the string from storage, or null, or a look object). Never throws:
 * unreadable input gives the default look, and each slot falls back to its default on its own.
 */
export function parseLook(raw) {
  try {
    if (typeof raw === 'string') {
      const obj = readJson(raw);
      return cleanLook(obj);
    }
    return cleanLook(raw);
  } catch {
    return defaultLook();
  }
}

/** JSON for storage: validated first, always { v, cap, crew, own } in that order. */
export function serializeLook(look) {
  const L = parseLook(look);
  return JSON.stringify({ v: 1, cap: L.cap, crew: L.crew, own: L.own });
}

// Has this trophy been won with these (validated) feats?
const earned = (it, F) => !it.trophy || F[it.trophy.feat] >= it.trophy.min;

/** A validated copy of the look with every trophy that the feats have not earned back on its default. */
export function sanitizeLook(look, feats) {
  const L = parseLook(look);
  const F = parseFeats(feats);
  for (const group of ['captain', 'crew']) {
    const rec = L[LOOK_KEY[group]];
    for (const slot of SLOTS[group]) {
      const it = ITEMS[`${slot}.${rec[slot]}`];
      if (!earned(it, F)) rec[slot] = DEFAULT_KEY[slot];
    }
  }
  return L;
}

// ---------------------------------------------------------------------------
// Feats
// ---------------------------------------------------------------------------
/** Fresh feats: nothing done yet. */
export function defaultFeats() {
  const feats = {};
  for (const id of FEAT_IDS) feats[id] = 0;
  feats.prizes = {};
  return feats;
}

function cleanFeats(obj) {
  const feats = defaultFeats();
  if (!isRecord(obj)) return feats;
  for (const id of FEAT_IDS) {
    const n = readInt(field(obj, id), id === 'legend' ? 1 : MAX_COUNT);
    if (n !== null) feats[id] = n;
  }
  const prizes = field(obj, 'prizes');
  if (isRecord(prizes)) {
    for (const type of FEAT_PRIZE_TYPES) {
      const n = readInt(field(prizes, type), MAX_PRIZE);
      if (n) feats.prizes[type] = n; // zero counts are left out
    }
  }
  return feats;
}

/** Read stored feats (string, null or object). Never throws; each counter falls back to 0 on its own. */
export function parseFeats(raw) {
  try {
    if (typeof raw === 'string') return cleanFeats(readJson(raw));
    return cleanFeats(raw);
  } catch {
    return defaultFeats();
  }
}

/** JSON for storage: validated first, counters in FEAT_IDS order, then prizes. */
export function serializeFeats(feats) {
  return JSON.stringify(parseFeats(feats));
}

// ---------------------------------------------------------------------------
// The wardrobe
// ---------------------------------------------------------------------------
const goldOf = (purse) => (typeof purse === 'number' && Number.isFinite(purse) ? purse : 0);

/**
 * What the wardrobe shows for an item: { worn, owned, free, price, affordable, locked, lockText, label }.
 * owned = can be worn without paying (free, bought, or a trophy won); label is the state line
 * ("Free", "Owned", "Trophy won", "120 gold", "Need 30 more gold", "Locked: capture 10 ships").
 * null for an unknown id.
 */
export function itemState(look, feats, purse, id) {
  const it = item(id);
  if (!it) return null;
  const L = parseLook(look);
  const F = parseFeats(feats);
  const free = !it.price && !it.trophy;
  const won = !!it.trophy && earned(it, F);
  const owned = free || won || (it.price > 0 && L.own.includes(it.id));
  const price = it.price || 0;
  const gold = goldOf(purse);
  const locked = !!it.trophy && !won;
  const affordable = !locked && (owned || gold >= price);
  const lockText = locked ? `Locked: ${it.trophy.text}` : '';
  let label;
  if (locked) label = lockText;
  else if (free) label = 'Free';
  else if (won) label = 'Trophy won';
  else if (owned) label = 'Owned';
  else if (affordable) label = `${price} gold`;
  else label = `Need ${Math.ceil(price - gold)} more gold`;
  return { worn: L[LOOK_KEY[it.group]][it.slot] === it.key, owned, free, price, affordable, locked, lockText, label };
}

/**
 * Put an item on: { ok, look, reason }. look is always a new validated look (the input is never
 * changed); on a refusal it is the same look, unchanged. reason: null | 'unknown' | 'not-owned' | 'locked'.
 */
export function wear(look, feats, id) {
  const L = sanitizeLook(look, feats);
  const it = item(id);
  if (!it) return { ok: false, look: L, reason: 'unknown' };
  if (it.trophy && !earned(it, parseFeats(feats))) return { ok: false, look: L, reason: 'locked' };
  if (it.price > 0 && !L.own.includes(it.id)) return { ok: false, look: L, reason: 'not-owned' };
  L[LOOK_KEY[it.group]][it.slot] = it.key;
  return { ok: true, look: L, reason: null };
}

/**
 * Buy a paid item with treasure-chest gold: { ok, look, cost, reason }. On success the new look owns
 * and wears it and cost is its price (the caller takes it from the chest and saves); on a refusal
 * cost is 0 and the look is unchanged. reason: null | 'unknown' | 'owned' | 'free' | 'trophy' | 'poor'.
 */
export function buy(look, purse, id) {
  const L = parseLook(look);
  const it = item(id);
  const no = (reason) => ({ ok: false, look: L, cost: 0, reason });
  if (!it) return no('unknown');
  if (it.trophy) return no('trophy');
  if (!it.price) return no('free');
  if (L.own.includes(it.id)) return no('owned');
  if (!(goldOf(purse) >= it.price)) return no('poor');
  L.own = PAID_IDS.filter((p) => p === it.id || L.own.includes(p));
  L[LOOK_KEY[it.group]][it.slot] = it.key;
  return { ok: true, look: L, cost: it.price, reason: null };
}

/**
 * Surprise me!: a new look where every slot of one group ('captain' or 'crew') wears a random FREE
 * item (paid and trophy items stay owned, just not worn); the other group and `own` are untouched.
 * Something always changes. rng() → [0, 1) (Math.random when missing).
 */
export function surprise(look, group, rng) {
  const L = parseLook(look);
  if (group !== 'captain' && group !== 'crew') return L;
  const rand = typeof rng === 'function' ? rng : Math.random;
  const roll = (n) => {
    let x = 0;
    try {
      x = Number(rand());
    } catch {
      x = 0;
    }
    if (!Number.isFinite(x)) x = 0;
    return clamp(Math.floor(x * n), 0, n - 1);
  };
  const rec = L[LOOK_KEY[group]];
  const before = { ...rec };
  for (const slot of SLOTS[group]) {
    const keys = FREE_KEYS[slot];
    rec[slot] = keys[roll(keys.length)];
  }
  if (SLOTS[group].every((s) => rec[s] === before[s])) {
    const slots = SLOTS[group].filter((s) => FREE_KEYS[s].length > 1);
    const slot = slots[roll(slots.length)];
    const others = FREE_KEYS[slot].filter((k) => k !== before[slot]);
    rec[slot] = others[roll(others.length)];
  }
  return L;
}

// ---------------------------------------------------------------------------
// Person options (people.js buildPerson, SPEC2 §7.10)
// ---------------------------------------------------------------------------
// The item worn in a slot, or the trial item when it belongs to that slot.
function wornItem(L, slot, trial) {
  const t = item(trial);
  if (t && t.slot === slot) return t;
  return ITEMS[`${slot}.${L[LOOK_KEY[GROUP_OF[slot]]][slot]}`];
}

// A fresh copy of an item's options (petColor is the only nested object).
function optsOf(it) {
  const o = { ...it.opts };
  if (o.petColor) o.petColor = { ...o.petColor };
  return o;
}

const CAPTAIN_SEED = 7;

/**
 * buildPerson options for the captain wearing this look (trial: an item id worn just for the preview,
 * owned or not). Body broad = the pirate build, slim = the woman build; both in pirate clothes.
 */
export function captainOpts(look, trial = null) {
  const L = parseLook(look);
  const o = {
    kind: 'pirate',
    outfit: 'pirate',
    seed: CAPTAIN_SEED,
    earring: true,
    accent: C.gold, // the sash
    pants: C.breeches,
    tool: 'none',
  };
  for (const slot of SLOTS.captain) Object.assign(o, optsOf(wornItem(L, slot, trial)));
  return o;
}

// The two colours of a hull paint (LOOKS.hull entry) for "Match the ship's paint".
function paintColours(hullPaint) {
  const top = field(hullPaint, 'top');
  const bottom = field(hullPaint, 'bottom');
  return isHex(top) && isHex(bottom) ? { top, bottom } : { top: C.teal, bottom: C.honey };
}

/**
 * buildPerson options for one of your sailors: the crew uniform merged over the sailor's own options
 * (baseOpts, kept as they are when the uniform is the default; { kind: 'pirate', seed } when missing).
 * hullPaint is the ship's LOOKS.hull entry (for "Match the ship's paint"); trial: an item id worn
 * just for the preview.
 */
export function crewOpts(look, seed, baseOpts, hullPaint, trial = null) {
  const L = parseLook(look);
  let o = null;
  try {
    if (isRecord(baseOpts)) o = { ...baseOpts };
  } catch {
    o = null; // a hostile object: start from a plain sailor
  }
  if (!o) o = { kind: 'pirate', seed: Number.isFinite(seed) ? Math.floor(seed) : 0 };
  for (const slot of SLOTS.crew) {
    const it = wornItem(L, slot, trial);
    const add = optsOf(it);
    if (it.id === 'shirt.paint') {
      const { top, bottom } = paintColours(hullPaint);
      Object.assign(add, { shirt: top, shirt2: bottom });
    }
    Object.assign(o, add);
  }
  return o;
}

// Enemy crews by faction: a look per ship type, varied per sailor by seed.
const FACTION = {
  cutter: 'rovers', privateer: 'rovers', prahu: 'islanders', junk: 'islanders', corsair: 'corsairs',
  inferno: 'embers', manowar: 'marines', galleon: 'merchants', raider: 'raiders', phantom: 'ghosts',
};
// A well-mixed hash of (seed, salt) in [0, 1) (murmur3's finaliser), so neighbouring seeds differ.
function hash01(seed, salt) {
  let h = (Math.imul(seed | 0, 0x9e3779b1) + Math.imul(salt, 0x85ebca6b)) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const FACTION_LOOK = {
  // mixed pirates in black and red bandanas
  rovers: (pick) => ({ kind: 'pirate', hat: 'bandana', hatColor: pick([C.ink, C.scarlet]) }),
  // straw hats and kerchiefs
  islanders: (pick) => {
    const hat = pick(['straw', 'kerchief']);
    return { kind: 'pirate', hat, hatColor: hat === 'straw' ? C.straw : pick([C.scarlet, C.teal, C.orange]) };
  },
  // red bandanas, dark vests
  corsairs: () => ({ kind: 'pirate', hat: 'bandana', hatColor: C.scarlet, stripes: false, shirt: C.cream, shirt2: C.cream, vest: C.ink, accent: C.scarlet }),
  // the Molten Maw: soot-black bandanas, ember sashes
  embers: () => ({ kind: 'pirate', hat: 'bandana', hatColor: C.soot, stripes: false, shirt: C.ragsDark, shirt2: C.ragsDark, vest: null, accent: C.ember }),
  // marines: navy coats and tricorns
  marines: () => ({ kind: 'man', hat: 'tricorn', hatColor: C.hatBlack, coat: C.navy, coatTrim: C.white, stripes: false, shirt: C.white, shirt2: C.white, vest: null, pants: C.white }),
  // galleon sailors: caps, yellow or red shirts
  merchants: (pick) => {
    const shirt = pick([C.gold, C.scarlet]);
    return { kind: 'man', hat: 'cap', hatColor: pick([C.navy, C.breeches]), stripes: false, shirt, shirt2: shirt, vest: null };
  },
  // raiders: horned helmets, beards, fur-brown vests
  raiders: (pick) => ({ kind: 'pirate', hat: 'horned', hatColor: C.steel, beard: pick(['full', 'braids']), stripes: false, shirt: C.linen, shirt2: C.linen, vest: C.fur }),
  // the Phantom's crew: pale green skin (and pale hair), dark grey rags, no hats
  ghosts: () => ({ kind: 'pirate', skin: C.ghostSkin, hair: C.ghostHair, hat: 'none', stripes: false, shirt: C.rags, shirt2: C.rags, vest: null, pants: C.ragsDark, accent: C.ragsDark }),
};

/** buildPerson options for an enemy sailor of a ship type (a plain pirate for an unknown type). */
export function enemyCrewOpts(typeName, seed) {
  const s = Number.isFinite(seed) ? Math.floor(seed) : 0;
  const faction = typeof typeName === 'string' && Object.prototype.hasOwnProperty.call(FACTION, typeName) ? FACTION[typeName] : null;
  if (!faction) return { kind: 'pirate', seed: s };
  // The picks run like the digits of the seed (pick k steps every n^(k-1) seeds), each cycle turned
  // by a hashed offset: neighbouring sailors differ, every combination turns up, nothing repeats.
  let step = 1;
  let salt = 0;
  const pick = (arr) => {
    const n = arr.length;
    const turn = Math.floor(hash01(Math.floor(s / (step * n)), ++salt) * n);
    const i = (((Math.floor(s / step) + turn) % n) + n) % n;
    step *= n;
    return arr[i];
  };
  return { ...FACTION_LOOK[faction](pick), seed: s };
}
