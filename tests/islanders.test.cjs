// Unit checks for the Sunset Isles' islanders, the construction scene's timeline and the Sea Guide (plain Node, no
// browser), SPEC4 §5.2, §7, §8.7, §13.1:
// - src/islanders.js: ISLANDERS (≤ 40, unique ids and names, §7.1's buildings and tiers), every look only options
//   people.js accepts (read from its source: its option names and lists), every kid / old look names `girl`, merfolk
//   only idle, sit, wave and cheer; every building's islanders exist only from their tier (roster), a home's no more
//   than its villagers; the animals (§7.1's table: species, how many, who brings them, their sounds); the lines
//   (≤ 70 characters, every line that names a key with a touch variant, every Voyage IV kind's counter somewhere,
//   and whoever names a new foe teaches its counter), linesFor by progress and device; routinePose pure, on its loop,
//   continuous, every station visited, the day fitting its loop; the walking-bug station rules (no station on a link,
//   within 2 u of a link's mouth, in a doorway, inside a place circle or at the gangplank; the dance spots too; ≤ 1
//   islander loop over each of the five long scenery bridges, ≤ 2 over a short rope bridge, none over today's four):
//   on the v4 layout once islandPlan's ISLANDER_PATHS have their points and tests/fixtures/sparrow-walk-v4.json
//   exists (Stage 1b), until then on a mock of the same shapes (islandPlan's decks and links laid out from §6.2's
//   table on today's fixture), with a broken copy showing every rule bites; plan(): never more than PEOPLE_DRAWN,
//   the priority order with a crowd over the cap, everyone within 6 u under it, the hysteresis, ≤ 1 swap a step
// - src/buildScene.js: lengths 9.4 / 7.0 / 5.0 (5.0 = 4 × still + 3 × fade, derived), the stages in order and
//   contiguous, the captions, the reduced stills, cueAt firing each cue exactly once however the frames fall
// - src/guide.js: a card for every enemy ship type, the Kraken and every Voyage IV kind, the names of shipTypes.js
//   and foes4.js, where each is first met, lines ≤ 90 characters, guideFor's seen and beaten
// - junk in every argument of every function: no throws, well-formed results
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
async function tryLoad(rel) {
  try {
    return await load(rel);
  } catch {
    return null;
  }
}
const read = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => {
  if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 60) + '…' : v);
  if (typeof v === 'symbol' || typeof v === 'function' || typeof v === 'bigint') return String(v);
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 70 ? s.slice(0, 70) + '…' : s;
  } catch {
    return '[a hostile object]';
  }
};
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
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
// distance from (x, z) to a polyline of [x, y, z] points
function segDist(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, , az] = pts[i];
    const [bx, , bz] = pts[i + 1];
    const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-12;
    const u = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
    best = Math.min(best, Math.hypot(x - ax - (bx - ax) * u, z - az - (bz - az) * u));
  }
  return best;
}
const P3 = (q) => (Array.isArray(q) ? (q.length >= 3 ? q : [q[0], 1.3, q[1]]) : [q.x, q.y ?? 1.3, q.z]);

// people.js's option names and lists, read from its source (it imports three.js, so it is not loaded)
function peopleOptions() {
  const src = read('src/people.js');
  const arr = (name) => {
    const m = src.match(new RegExp(`(?:export )?const ${name} = (?:Object\\.freeze\\()?\\[([\\s\\S]*?)\\]`));
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  };
  return {
    keys: new Set([...src.matchAll(/\bopts\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1])),
    kinds: arr('KINDS'),
    hats: arr('HATS'),
    tools: arr('TOOLS'),
    beards: arr('BEARDS'),
    hairStyles: arr('HAIR_STYLES'),
    actions: arr('ACTIONS'),
    mer: arr('MER_ACTIONS'),
    pets: [...src.matchAll(/opts\.pet === '(\w+)'/g)].map((m) => m[1]),
  };
}

(async () => {
  const I = await load('src/islanders.js');
  const B = await load('src/buildScene.js');
  const G = await load('src/guide.js');
  const ISL = await load('src/island.js');
  const PLAN = await tryLoad('src/islandPlan.js');
  const POOLS = await tryLoad('src/pools.js');
  const SHIPS = await tryLoad('src/shipTypes.js');
  const FOES = await tryLoad('src/foes4.js');
  const PO = peopleOptions();
  const V4_KINDS = POOLS && Array.isArray(POOLS.V4_KINDS) ? POOLS.V4_KINDS : ['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'fort', 'shellback'];
  // §11.1's SFX list (audio.js's names, once 1J has added them) and the names audio.js has today
  const SFX4 = 'coconut netWhirl puff conch song hiss clack tidebell snip boulder crabCharge yawn newFoe whistle thud tok saw pop brush chime door tada purr woof meh squawk hoot giggle click splash fwap foghorn'.split(' ');
  const audioSrc = read('src/audio.js');
  const sfxM = audioSrc.match(/export const SFX_NAMES = \[([\s\S]*?)\];/);
  const SFX = new Set([...SFX4, ...(sfxM ? [...sfxM[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [])]);

  // ================================================================== the exports (§11.1)
  {
    const fns = ['roster', 'routinePose', 'linesFor', 'plan', 'movesIn', 'danceAt', 'routineFit'];
    const tables = ['ISLANDERS', 'ROUTINES', 'ANIMALS', 'LINES', 'PEOPLE_DRAWN', 'TALK', 'CULL4', 'DAY', 'CROWD', 'PACE', 'DANCE', 'PLOT_IDS'];
    const miss = [...fns.filter((k) => typeof I[k] !== 'function'), ...tables.filter((k) => !(k in I))];
    const missB = [...['sceneLength', 'stageAt', 'cueAt', 'cameraAt', 'builtLine'].filter((k) => typeof B[k] !== 'function'), ...['STAGES', 'SCENE', 'STILLS', 'PIPS'].filter((k) => !(k in B))];
    const missG = [...['guideFor'].filter((k) => typeof G[k] !== 'function'), ...['GUIDE', 'NOT_MET'].filter((k) => !(k in G))];
    check(miss.length + missB.length + missG.length === 0, `§11.1's exports: islanders.js (ISLANDERS, ROUTINES, ANIMALS, LINES, PEOPLE_DRAWN, TALK, CULL4; roster, routinePose, linesFor, plan), buildScene.js (STAGES, SCENE; sceneLength, stageAt, cueAt), guide.js (GUIDE, guideFor), and their helpers${miss.length + missB.length + missG.length ? ' -> missing ' + [...miss, ...missB, ...missG].join(', ') : ''}`);
    check(I.PEOPLE_DRAWN === 41 && same(I.TALK, { reach: 1.6, face: 60, lines: 3, end: 3 }) && I.CULL4 === 34 && I.DAY === 120 && same(I.CROWD, { near: 2, close: 6, hysteresis: 1.5, swaps: 1, every: 0.25 }),
      'PEOPLE_DRAWN 41 (P₀ 39 + 2, §19 S0-D1), TALK { reach 1.6, face 60, lines 3, end 3 }, CULL4 34, an ashore day of 120 s, the crowd rings 2 / 6 u, 1.5 u of hysteresis, 1 swap a step every 0.25 s');
    const frozen = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(frozen));
    check([I.ISLANDERS, I.ROUTINES, I.ANIMALS, I.LINES, I.TALK, I.CROWD, I.PACE, I.DANCE, I.PLOT_IDS, B.STAGES, B.SCENE, B.STILLS, G.GUIDE].every(frozen), 'every table is frozen all the way down');
  }

  // ================================================================== who lives here (§7.1)
  const PEOPLE = I.ISLANDERS.filter((p) => p.role !== 'builder');
  const BUILDERS = I.ISLANDERS.filter((p) => p.role === 'builder');
  {
    // [id, name, building, tier] in §7.1's order
    const TABLE = [
      ['finn', 'Finn', 'fishing', 1], ['marina', 'Marina', 'fishing', 2], ['jib', 'Bosun Jib', 'homeF', 1], ['nell', 'Nell', 'homeF', 1], ['barnaby', 'Grandpa Barnaby', 'homeF', 2],
      ['wren', 'Granny Wren', 'homeE', 1], ['kip', 'Kip', 'homeE', 1], ['moss', 'Moss', 'homeE', 2], ['pearl', 'Granny Pearl', 'homeG', 1], ['jack', 'Grandpa Jack', 'homeG', 1],
      ['lily', 'Lily', 'homeG', 2], ['tom', 'Tom', 'homeG', 2], ['ada', 'Ada', 'forge', 1], ['ida', 'Ida', 'forge', 2], ['bo', 'Farmer Bo', 'farm', 1], ['hettie', 'Hettie', 'farm', 2],
      ['paz', 'Piper Paz', 'music', 1], ['dot', 'Drummer Dot', 'music', 2], ['sid', 'Squeezebox Sid', 'music', 3], ['quill', 'Curator Quill', 'museum', 1], ['fern', 'Fern', 'museum', 3],
      ['ollie', 'Ollie', 'museum', 3], ['stella', 'Stella', 'observatory', 1], ['coral', 'Coral', 'aquarium', 1], ['pip', 'Pip', 'aquarium', 3], ['nerissa', 'Nerissa', 'grotto', 1],
      ['kai', 'Kai', 'grotto', 1], ['bun', 'Bun', 'bakery', 1], ['mo', 'Mo', 'windmill', 1], ['lars', 'Lars', 'lighthouse', 1], ['tam', 'Tam', 'market', 1], ['page', 'Miss Page', 'school', 1],
      ['rosa', 'Rosa', 'park', 1],
    ];
    const got = PEOPLE.map((p) => [p.id, p.name, p.plot, p.tier]);
    check(same(got, TABLE) && same(BUILDERS.map((p) => p.id), ['chip', 'mortar', 'dab']) && I.ISLANDERS.length <= 40,
      `§7.1's 33 islanders with their buildings and tiers, in its order, and Bess's crew Chip, Mortar and Dab: ${I.ISLANDERS.length} rows (≤ 40)${same(got, TABLE) ? '' : ' -> ' + show(got.filter((r, i) => !same(r, TABLE[i])))}`);
    check(new Set(I.ISLANDERS.map((p) => p.id)).size === I.ISLANDERS.length && new Set(I.ISLANDERS.map((p) => p.name)).size === I.ISLANDERS.length && I.ISLANDERS.every((p) => /^[a-z]+$/.test(p.id) && typeof p.name === 'string' && p.name.trim() === p.name && p.name.length > 0 && p.name.length <= 20),
      'every islander has its own id and its own name (the prompt\'s "Talk to Ada (E)")');
    const ids3 = [...ISL.PLOTS.map((p) => p.id)];
    const ids4 = [...ISL.PLOTS4.map((p) => p.id)];
    check(same(I.PLOT_IDS.island, ids3) && same(I.PLOT_IDS.island4, ids4) && PEOPLE.every((p) => [...ids3, ...ids4].includes(p.plot) && Number.isInteger(p.tier) && p.tier >= 1 && p.tier <= 3) && BUILDERS.every((p) => p.plot === null && p.path === null),
      "PLOT_IDS are island.js's PLOTS and PLOTS4 ids; every islander comes with a real building at tier 1..3; the builders belong to none and have no loop");
    const ISP = PLAN && Array.isArray(PLAN.ISLANDER_PATHS) ? PLAN.ISLANDER_PATHS.filter((p) => p.kind !== 'dance') : null;
    if (ISP) check(same(ISP.map((p) => p.id), PEOPLE.map((p) => `isl:${p.id}`)) && PEOPLE.every((p) => p.path === `isl:${p.id}`) && ISP.every((p) => p.islander === p.id.slice(4) && p.kind === 'islander'),
      "every islander's loop is islandPlan's ISLANDER_PATHS entry `isl:<id>` (33, in §7.1's order)");
    else console.log('SKIP  islandPlan.js has no ISLANDER_PATHS to compare with');
    // a home's named islanders are its villagers out and about: never more than the home's villagers at that tier
    const over = [];
    for (const plot of [...ISL.PLOTS, ...ISL.PLOTS4].filter((p) => p.kind === 'home')) for (let t = 1; t <= 3; t++) {
      const n = PEOPLE.filter((p) => p.plot === plot.id && p.tier <= t).length;
      if (n > plot.perk.villagers[t - 1]) over.push(`${plot.id} ${t}: ${n}`);
    }
    check(over.length === 0 && PEOPLE.filter((p) => p.role === 'home').every((p) => ['homeE', 'homeF', 'homeG'].includes(p.plot)) && PEOPLE.filter((p) => p.role === 'work').every((p) => !['homeE', 'homeF', 'homeG'].includes(p.plot)),
      `a home's islanders live there (no more than its 2 / 4 / 6 villagers at each tier; the rest are "at home"), an amenity's work there${over.length ? ' -> ' + over.join('; ') : ''}`);
  }

  // ---------------------------------------------------------------- the looks: people.js options only
  {
    const isHex = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
    const bool = (v) => v === true || v === false;
    const CHECK = {
      seed: Number.isSafeInteger, kind: (v) => PO.kinds.includes(v), hat: (v) => PO.hats.includes(v), tool: (v) => PO.tools.includes(v),
      beard: (v) => PO.beards.includes(v) || bool(v), hairStyle: (v) => PO.hairStyles.includes(v), pet: (v) => PO.pets.includes(v),
      girl: bool, glasses: bool, stripes: bool, eyepatch: bool, earring: bool, pegLeg: bool,
      hatColor: isHex, coat: isHex, coatTrim: isHex, hair: isHex, skin: isHex, accent: isHex, shirt: isHex, shirt2: isHex, pants: isHex, vest: (v) => v === null || v === false || isHex(v),
      apron: (v) => v === true || v === false || isHex(v), tail: (v) => v === true || isHex(v), share: (v) => v === true, detail: (v) => v === 'low', scale: (v) => Number.isFinite(v) && v > 0, outfit: (v) => v === 'pirate',
    };
    const bad = [];
    for (const p of I.ISLANDERS) {
      for (const [k, v] of Object.entries(p.look)) {
        if (!PO.keys.has(k)) bad.push(`${p.id}: people.js has no option ${k}`);
        else if (!CHECK[k]) bad.push(`${p.id}: no check for ${k}`);
        else if (!CHECK[k](v)) bad.push(`${p.id}: ${k} = ${show(v)}`);
      }
      if (p.look.share !== true || p.look.detail !== 'low' || !Number.isSafeInteger(p.look.seed)) bad.push(`${p.id}: not share / low / seeded`);
    }
    const newOpts = ['toque', 'souwester', 'startop'].every((h) => PO.hats.includes(h)) && ['drum', 'spyglass', 'book', 'basket', 'squeezebox'].every((t) => PO.tools.includes(t)) && ['apron', 'tail', 'girl'].every((k) => PO.keys.has(k));
    check(bad.length === 0 && PO.keys.size > 20 && PO.kinds.length === 5, `every look (${I.ISLANDERS.length}) uses only options people.js reads (${PO.keys.size} option names from its source), with values from its lists (kinds, ${PO.hats.length} hats, ${PO.tools.length} tools, beards, hair styles, pets) or hex colours; share: true, detail: 'low', a fixed seed${bad.length ? ' -> ' + bad.slice(0, 6).join('; ') : ''}`);
    check(newOpts, "people.js already has §11.1's new options the islanders wear (the hats toque, souwester, startop; the tools drum, spyglass, book, basket, squeezebox; apron, tail, girl)");
    check(new Set(I.ISLANDERS.map((p) => p.look.seed)).size === I.ISLANDERS.length, 'every islander has a seed of its own (the same look every visit, nobody a twin)');
    const noGirl = I.ISLANDERS.filter((p) => (p.look.kind === 'kid' || p.look.kind === 'old') && typeof p.look.girl !== 'boolean').map((p) => p.id);
    const girls = I.ISLANDERS.filter((p) => p.look.girl === true).map((p) => p.id);
    check(noGirl.length === 0 && ['wren', 'pearl', 'stella', 'lily', 'moss', 'ida', 'pip', 'dab'].every((id) => girls.includes(id)) && ['finn', 'barnaby', 'jack', 'kip', 'tom', 'sid', 'quill', 'lars', 'ollie', 'mortar'].every((id) => I.ISLANDERS.find((p) => p.id === id).look.girl === false),
      `every 'kid' and 'old' look names girl: true | false (people.js would roll it from the seed), so the grannies, Stella and the girls are always girls and the bearded grandpas never grandmas${noGirl.length ? ' -> ' + noGirl.join(', ') : ''}`);
    const spec = { finn: { hat: 'souwester', tool: 'rod' }, marina: { tool: 'basket', stripes: true }, ada: { apron: true, tool: 'hammer', hat: 'bandana' }, ida: { apron: true, tool: 'bucket' }, bo: { hat: 'straw', tool: 'bucket' }, hettie: { tool: 'basket' }, paz: { tool: 'fiddle' }, dot: { tool: 'drum' }, sid: { tool: 'squeezebox' }, quill: { hat: 'bicorne', tool: 'tape', glasses: true }, stella: { hat: 'startop', tool: 'spyglass' }, nerissa: { tail: true }, kai: { tail: true }, bun: { hat: 'toque', apron: true }, lars: { tool: 'lantern' }, tam: { tool: 'crate' }, page: { tool: 'book', glasses: true }, chip: { tool: 'hammer' }, mortar: { tool: 'crate' }, dab: { apron: true, tool: 'bucket' } };
    const badSpec = Object.entries(spec).filter(([id, want]) => Object.entries(want).some(([k, v]) => I.ISLANDERS.find((p) => p.id === id).look[k] !== v)).map(([id]) => id);
    check(badSpec.length === 0, `the looks §7.1 names: Finn's sou'wester and rod, Ada's apron and hammer, the band's fiddle, drum and squeezebox, Stella's star hat and spyglass, the merfolk's tails, Bun's toque…${badSpec.length ? ' -> ' + badSpec.join(', ') : ''}`);
    const mers = I.ISLANDERS.filter((p) => p.look.tail === true);
    check(same(mers.map((p) => p.id), ['nerissa', 'kai']) && mers.every((p) => p.mer === true && ['woman', 'man'].includes(p.look.kind)) && I.ISLANDERS.filter((p) => p.mer).length === 2, 'the merfolk are Nerissa and Kai (a woman and a man with tails), flagged mer');
  }

  // ---------------------------------------------------------------- routines' actions (§7.1, §7.3)
  {
    const bad = [];
    for (const p of PEOPLE) {
      const r = I.ROUTINES[p.id];
      if (!r) {
        bad.push(`${p.id}: no routine`);
        continue;
      }
      const allowed = p.mer ? PO.mer : PO.actions;
      const walks = p.mer ? ['idle'] : ['walk', 'carry', 'run'];
      if (!(r.pace > 0 && r.pace <= 1)) bad.push(`${p.id}: pace ${r.pace}`);
      if (!r.steps.length || !r.steps[0].station) bad.push(`${p.id}: must start at a station`);
      r.steps.forEach((s, i) => {
        if (s.station) {
          if (i > 0 && !r.steps[i - 1].walk) bad.push(`${p.id}: two stations in a row`);
          if (!s.acts.length) bad.push(`${p.id}: ${s.station} does nothing`);
          for (const [a, d] of s.acts) if (!allowed.includes(a) || !(d > 0 && d <= 60)) bad.push(`${p.id}: ${s.station} ${a} ${d}`);
        } else if (!walks.includes(s.walk) || (i > 0 && !r.steps[i - 1].station)) bad.push(`${p.id}: walk ${s.walk}`);
      });
      const st = r.steps.filter((s) => s.station).map((s) => s.station);
      if (new Set(st).size !== st.length) bad.push(`${p.id}: a station twice`);
      const total = r.steps.filter((s) => s.station).reduce((n, s) => n + s.acts.reduce((m, a) => m + a[1], 0), 0);
      if (total >= I.DAY * 0.8) bad.push(`${p.id}: stations alone take ${total} s`);
      if (!PO.actions.includes(p.react.action) || (p.mer && !PO.mer.includes(p.react.action))) bad.push(`${p.id}: react ${p.react.action}`);
    }
    check(bad.length === 0 && Object.keys(I.ROUTINES).length === PEOPLE.length && BUILDERS.every((p) => !I.ROUTINES[p.id]),
      `every islander's routine: stations and walks in turn, round the loop, each station's acts people.js actions (${PO.actions.length}; merfolk only ${PO.mer.join(', ')}), walks walk / carry / run (merfolk glide), the stations leaving room for the walks in the 120 s day; every greeting a people.js action; the builders have none (they only build)${bad.length ? ' -> ' + bad.slice(0, 6).join('; ') : ''}`);
    const spec = { finn: [['pierEnd', 'fish', 30], ['bench', 'sit', 15]], barnaby: [['bench', 'sit', 40]], wren: [['porch', 'sit', 50]], ada: [['anvil', 'hammer', 20]], marina: [['stall', 'idle', 20]], jib: [['mooring', 'haul', 15], ['tavernRail', 'lean', 20]], pearl: [['bench', 'sit', 40]], paz: [['stage', 'fiddle', 30]], dot: [['stage', 'hammer', 30]], sid: [['stage', 'fiddle', 30]], quill: [['cases', 'measure', 20]], stella: [['scope', 'point', 20]] };
    const badS = Object.entries(spec).filter(([id, rows]) => rows.some(([st, a, d]) => !I.ROUTINES[id].steps.some((s) => s.station === st && s.acts.some((x) => x[0] === a && x[1] === d)))).map(([id]) => id);
    check(badS.length === 0 && I.ROUTINES.barnaby.pace === 0.6 && I.ROUTINES.pearl.pace === 0.6 && I.ROUTINES.nerissa.steps[0].acts.some((a) => a[0] === 'idle' && a[1] === 3 && a[2] && a[2].dive),
      `§7.1's stations: Finn fishes 30 s and sits 15 s, Barnaby sits 40 s and walks at ×0.6, Granny Wren knits 50 s, Ada hammers 20 s, the band plays 30 s, the merfolk dive for 3 s…${badS.length ? ' -> ' + badS.join(', ') : ''}`);
  }

  // ---------------------------------------------------------------- roster: the buildings decide who is out (§7.1)
  {
    const isl = (t = {}) => ({ v: 1, t: { ...Object.fromEntries(ISL.PLOTS.map((p) => [p.id, 0])), ...t } });
    const isl4 = (t = {}) => ({ v: 1, t: { ...Object.fromEntries(ISL.PLOTS4.map((p) => [p.id, 0])), ...t } });
    const r0 = I.roster(isl(), isl4(), { unlocked: 1 }, null);
    check(r0.people.length === 0 && same(r0.builders.map((b) => b.id), ['chip', 'mortar', 'dab']) && r0.animals.every((a) => ['mittens', 'biscuit', 'ruby', 'sky', 'mango', 'banana', 'crab1', 'crab2', 'crab3', 'crab4', 'crab5', 'crab6'].includes(a.id)) && r0.animals.length === 12,
      `nothing built: nobody lives in the new buildings (before a building stands nobody lives in it), the builders stand by, and only the Sunset Isles' own animals are out (the tavern's cat and parrots, the harbour dog, a palm monkey, six crabs): ${r0.animals.length}`);
    const bad = [];
    const all = [...ISL.PLOTS, ...ISL.PLOTS4];
    for (const plot of all) for (let t = 0; t <= 3; t++) {
      const rec = ISL.PLOTS.some((p) => p.id === plot.id) ? [isl({ [plot.id]: t }), isl4()] : [isl(), isl4({ [plot.id]: t })];
      const r = I.roster(rec[0], rec[1], { unlocked: 12, captures: 5 }, null);
      const want = PEOPLE.filter((p) => p.plot === plot.id && p.tier <= t).map((p) => p.id);
      const gotP = r.people.map((p) => p.id);
      if (!same(gotP, want)) bad.push(`${plot.id} ${t}: ${gotP.join(',')}`);
      for (const sp of Object.values(I.ANIMALS)) for (const a of sp.list.filter((x) => x.plot === plot.id)) if (r.animals.some((x) => x.id === a.id) !== a.tier <= t) bad.push(`${plot.id} ${t}: ${a.id}`);
      // from text records too
      const rt = I.roster(JSON.stringify(rec[0]), JSON.stringify(rec[1]), { unlocked: 12 }, null);
      if (!same(rt.people.map((p) => p.id), want)) bad.push(`${plot.id} ${t} (text)`);
    }
    const everything = I.roster(isl(Object.fromEntries(ISL.PLOTS.map((p) => [p.id, 3]))), isl4(Object.fromEntries(ISL.PLOTS4.map((p) => [p.id, 3]))), { unlocked: 12, shell: 1 }, null);
    check(bad.length === 0 && everything.people.length === 33 && same(everything.people.map((p) => p.id), PEOPLE.map((p) => p.id)),
      `roster at every tier of all 21 plots (records or their text): each building's islanders and animals come only from their tier on; everything built: all 33 islanders, in §7.1's order${bad.length ? ' -> ' + bad.slice(0, 5).join('; ') : ''}`);
    const r1 = I.roster(isl(), isl4({ homeE: 3 }), null, null);
    r1.people[0].look.hat = 'crown';
    r1.people[0].react.action = 'fall';
    check(I.ISLANDERS.find((p) => p.id === 'wren').look.hat === undefined && I.ISLANDERS.find((p) => p.id === 'wren').react.action === 'wave' && I.roster(isl(), isl4({ homeE: 3 }), null, null).people[0].look !== I.roster(isl(), isl4({ homeE: 3 }), null, null).people[0].look,
      'roster hands out fresh copies (a caller changing a look changes nothing here)');
    // the animals of §7.1's table
    const SPEC = { cat: [4, 'purr'], dog: [3, 'woof'], goat: [6, 'meh'], bird: [5, 'squawk'], monkey: [3, 'giggle'], crab: [7, 'click'], turtle: [4, null] };
    const badA = Object.entries(SPEC).filter(([sp, [max, sound]]) => !I.ANIMALS[sp] || I.ANIMALS[sp].max !== max || I.ANIMALS[sp].list.length !== max || I.ANIMALS[sp].sound !== sound).map(([sp]) => sp);
    const counts = Object.fromEntries(Object.keys(SPEC).map((sp) => [sp, everything.animals.filter((a) => a.species === sp).length]));
    const goats = [0, 1, 2, 3].map((t) => I.roster(isl(), isl4({ farm: t }), null, null).animals.filter((a) => a.species === 'goat').length);
    const sounds = everything.animals.map((a) => a.sound).filter((s) => s !== null);
    check(badA.length === 0 && same(Object.keys(I.ANIMALS), Object.keys(SPEC)) && same(counts, { cat: 4, dog: 3, goat: 6, bird: 5, monkey: 3, crab: 7, turtle: 4 }) && same(goats, [0, 2, 4, 6]) && sounds.every((s) => SFX.has(s)) && everything.animals.filter((a) => a.species === 'turtle').every((a) => a.sound === null) && everything.animals.find((a) => a.id === 'hoot').sound === 'hoot',
      `the animals: cats 4, dogs 3, goats 6 (2 / 4 / 6 by the Goat Farm's tier), birds 5 (Hoot hoots), monkeys 3, crabs 7, turtles 4 (silent); every sound an audio.js name (§11.1)${badA.length ? ' -> ' + badA.join(', ') : ''}`);
    const hermit = [0, 1].map((shell) => I.roster(isl(), isl4(), { shell }, null).animals.some((a) => a.id === 'hermit'));
    const ids = Object.values(I.ANIMALS).flatMap((sp) => sp.list.map((a) => a.id));
    check(same(hermit, [false, true]) && new Set(ids).size === ids.length && Object.values(I.ANIMALS).every((sp) => typeof sp.word === 'string' && sp.word.length <= 20 && sp.list.every((a) => typeof a.at === 'string' && (a.v4 === true || a.shell === true || (all.some((p) => p.id === a.plot) && a.tier >= 1 && a.tier <= 3)))),
      'the baby hermit crab comes after the Shellback (feats.shell); every animal has its own id, a word, a home, and comes with a building, with the Sunset Isles or after the Shellback');
    const followers = Object.values(I.ANIMALS).flatMap((sp) => sp.list.filter((a) => a.follow));
    check(followers.every((a) => PEOPLE.some((p) => p.id === a.follow && (p.plot === a.plot || a.v4))) && followers.length >= 2, `followers trot after their own islander (${followers.map((a) => `${a.name} → ${a.follow}`).join(', ')})`);
    // animals placed from the layout when it names their spots
    const lay = { ANIMAL_SPOTS: { tavernRoof: { x: 1, y: 5, z: 2 } }, PLOT_PLACES: [{ id: 'plot:homeE', x: -37, z: -28, r: 1 }] };
    const rr = I.roster(isl(), isl4({ homeE: 1 }), null, lay);
    const coco = rr.animals.find((a) => a.id === 'coco');
    const mit = rr.animals.find((a) => a.id === 'mittens');
    const bis = rr.animals.find((a) => a.id === 'biscuit');
    check(coco.x === -37 && coco.z === -28 && mit.x === 1 && mit.y === 5 && mit.z === 2 && bis.x === null && bis.z === null, "an animal's place comes from the layout (ANIMAL_SPOTS, or its building's plot place), else null for critters.js to choose");
    // movesIn and the built line (§5.2's example, word for word)
    const m = I.movesIn('homeE', 1);
    check(same(m, { people: ['Granny Wren', 'Kip'], animals: ['Coco'] }) && B.builtLine('Treehouse', [...m.people, ...m.animals]) === 'Treehouse built! Granny Wren, Kip and Coco moved in.' && same(I.movesIn('homeE', 3), { people: [], animals: ['Nutmeg'] }) && same(I.movesIn('nope', 1), { people: [], animals: [] }),
      `movesIn: who moves in at each tier; the scene's last line "${B.builtLine('Treehouse', [...m.people, ...m.animals])}"`);
  }

  // ================================================================== lines (§7.1, §7.4)
  {
    const KEY = /\b(?:[Pp]ress|[Hh]old|[Tt]ap|[Hh]it|[Pp]ush|[Uu]se)\s+(?:the\s+)?(?:[A-Z]|Enter|Space|Esc|Escape|Shift|Tab)(?![A-Za-z])|<kbd>/;
    const NAMES = { jolly: /monkey|coconut|jollyboat/i, stinger: /sting sloop/i, netsloop: /\bnet(?:s|ted)?\b|net sloop/i, puffer: /puffer/i, witch: /witch/i, coilback: /coilback|sea serpent/i, fort: /\bfort\b/i, shellback: /shellback/i };
    const norm = (l) => (typeof l === 'string' ? { text: l } : l);
    const bad = [];
    const keyLines = [];
    const taught = new Set();
    for (const p of I.ISLANDERS) {
      const L = (I.LINES[p.id] || []).map(norm);
      if (L.length < 2 || typeof I.LINES[p.id][0] !== 'string') bad.push(`${p.id}: needs a hello and a second line`);
      for (const l of L) {
        for (const t of [l.text, l.touch].filter((x) => x !== undefined)) if (typeof t !== 'string' || !t.trim() || t.length > 70 || /\n/.test(t)) bad.push(`${p.id}: ${show(t)} (${t && t.length})`);
        if (KEY.test(l.text)) {
          keyLines.push(l);
          if (!l.touch || KEY.test(l.touch)) bad.push(`${p.id}: "${l.text}" names a key without a touch wording`);
        }
        if (l.teaches !== undefined) {
          if (!V4_KINDS.includes(l.teaches)) bad.push(`${p.id}: teaches ${l.teaches}`);
          taught.add(l.teaches);
        }
        for (const k of Object.keys(l)) if (!['text', 'touch', 'teaches', 'from', 'kraken', 'shell', 'captures'].includes(k)) bad.push(`${p.id}: ${k}`);
      }
      // whoever names a new foe (in a line that isn't itself a counter) teaches its counter
      for (const l of L.filter((x) => x.teaches === undefined)) for (const [kind, re] of Object.entries(NAMES)) if (re.test(l.text) && !L.some((x) => x.teaches === kind)) bad.push(`${p.id} names the ${kind} without its counter`);
    }
    check(bad.length === 0 && Object.keys(I.LINES).length === I.ISLANDERS.length, `every islander has a hello and more; every line (and touch wording) ≤ 70 characters on one line (it fits a 320 px bubble); whoever names a Voyage IV foe teaches its counter${bad.length ? ' -> ' + bad.slice(0, 6).join('; ') : ''}`);
    check(keyLines.length >= 1 && keyLines.every((l) => l.touch && !KEY.test(l.touch)) && keyLines.some((l) => l.text === 'Netted? Hold G and cut it! My knives cut faster.' && l.touch === 'Netted? Hold CUT! My knives cut faster.'),
      `every line that names a key has a touch wording that names none (${keyLines.map((l) => `"${l.text}" / "${l.touch}"`).join('; ')})`);
    check(V4_KINDS.every((k) => taught.has(k)), `every Voyage IV kind's counter is taught by someone: ${V4_KINDS.map((k) => `${k} (${I.ISLANDERS.filter((p) => (I.LINES[p.id] || []).some((l) => l.teaches === k)).map((p) => p.id).join(', ')})`).join(', ')}`);
    const SPEC_LINES = ["Biting today, Cap'n!", 'Puffers ate my bait! Pop them from far away.', 'Two fish for a doubloon!', 'Coral currents give you free speed.', 'Fair winds, Captain!', 'A Sting Sloop hides behind you. Turn!',
      'In my day the Kraken was THIS big!', 'Mind the coconuts, dearie! Grape tips those monkeys over.', 'Are you a REAL captain?', 'We saw a sea serpent! It gets dizzy!', 'What a view from up here!',
      'Race you to the top!', 'Netted? Hold G and cut it! My knives cut faster.', "I'm making horseshoes for seahorses!", 'Meet Nibbles. She eats EVERYTHING.', "Goat's cheese, Captain?",
      "♪ Heave ho, the Kraken's gone! ♪", "Capture a ship and I'll make a model of it!", 'Look, a real captain!', "Fog can't hide from my spyglass!", "Hit old Coilback's head while it's dizzy!",
      'The puffers here are friendly!', 'Mind old Coilback in the Spires! Hit its dizzy head!', 'The sea is singing today!', 'Fresh biscuits today!', 'Puffs of powder, Captain!', 'My light is on for you.', "Let's build!"];
    const allText = Object.values(I.LINES).flat().map(norm).map((l) => l.text);
    const missingL = SPEC_LINES.filter((t) => !allText.includes(t));
    check(missingL.length === 0, `§7.1's lines are there word for word (${SPEC_LINES.length})${missingL.length ? ' -> missing ' + missingL.join(' | ') : ''}`);

    // linesFor: the hello first, then the newest news, by progress and device
    const ada10 = I.linesFor('ada', { unlocked: 10 }, false);
    const ada10t = I.linesFor('ada', { unlocked: 10 }, true);
    const ada1 = I.linesFor('ada', { unlocked: 1 }, true);
    const jack = [I.linesFor('jack', { unlocked: 1 }), I.linesFor('jack', { unlocked: 12 }), I.linesFor('jack', { unlocked: 12, shell: 1 })];
    const quill = [I.linesFor('quill', { captures: 0 }), I.linesFor('quill', { captures: 1 })];
    const barn = [I.linesFor('barnaby', { kraken: 0 }), I.linesFor('barnaby', { kraken: 1 })];
    check(same(ada10, ['Mind the sparks, Captain!', 'Netted? Hold G and cut it! My knives cut faster.', 'I can mend anything made of iron.']) && same(ada10t, ['Mind the sparks, Captain!', 'Netted? Hold CUT! My knives cut faster.', 'I can mend anything made of iron.']) &&
      same(ada1, ['Mind the sparks, Captain!', 'I can mend anything made of iron.']) && same(jack[0], ['Lovely day for a sail, Captain!', 'I built this bench myself. It only wobbles a bit.']) &&
      jack[1][1] === "Knock down the Shellback's towers first!" && jack[2][1] === 'You sent the Shellback to bed! Bravo!' && jack[2].length === 3 && quill[0].length === 2 && quill[1][1] === 'Your captured ships look grand in their bottles!' && barn[1][1] === 'You drove off the Kraken? Well, I never!',
      `linesFor: the hello, then the newest news first (a counter once its voyage is open, the Shellback's and the Kraken's news once driven off, the Museum's once you capture), at most ${I.TALK.lines}; on a touch screen Ada says "${ada10t[1]}"`);
    const badF = [];
    const r = rng(9);
    for (let k = 0; k < 400; k++) {
      const p = I.ISLANDERS[Math.floor(r() * I.ISLANDERS.length)];
      const g = { unlocked: 1 + Math.floor(r() * 12), captures: Math.floor(r() * 3), kraken: Math.floor(r() * 2), shell: Math.floor(r() * 2) };
      const touch = r() < 0.5;
      const ls = I.linesFor(p.id, g, touch);
      if (ls.length < 2 || ls.length > I.TALK.lines || ls[0] !== I.LINES[p.id][0] || new Set(ls).size !== ls.length || ls.some((t) => typeof t !== 'string' || t.length > 70 || (touch && KEY.test(t)))) badF.push(`${p.id} ${show(g)} ${touch}: ${show(ls)}`);
    }
    check(badF.length === 0 && same(I.linesFor('nobody', {}, false), []) && same(I.linesFor('__proto__', {}, false), []) && same(I.linesFor('constructor', {}, false), []),
      `linesFor on 400 random islanders, progresses and devices: 2..3 different lines, the hello first, none naming a key on a touch screen; an unknown islander says nothing${badF.length ? ' -> ' + badF.slice(0, 3).join('; ') : ''}`);
  }

  // ================================================================== the layout: the v4 fixture (Stage 1b) or a mock
  const FIX4 = path.join(ROOT, 'tests/fixtures/sparrow-walk-v4.json');
  const realPaths = PLAN && Array.isArray(PLAN.ISLANDER_PATHS) && PLAN.ISLANDER_PATHS.filter((p) => p.kind !== 'dance').length === 33 && PLAN.ISLANDER_PATHS.every((p) => Array.isArray(p.pts) && p.pts.length >= 2);
  const real = realPaths && fs.existsSync(FIX4);
  let layout;
  let walk;
  if (real) {
    layout = PLAN;
    walk = JSON.parse(fs.readFileSync(FIX4, 'utf8'));
    console.log('INFO  the station checks run on the v4 layout: islandPlan ISLANDER_PATHS and tests/fixtures/sparrow-walk-v4.json');
  } else {
    console.log(`SKIP  (Stage 1b) the station checks on the v4 fixture: ${realPaths ? 'tests/fixtures/sparrow-walk-v4.json is not there yet' : "islandPlan's ISLANDER_PATHS have no points yet"}; they run on a mock of the same shapes`);
    ({ layout, walk } = mockLayout(PLAN, PEOPLE, I.ROUTINES));
  }
  const LINKS = (PLAN && Array.isArray(PLAN.LINKS) ? PLAN.LINKS : []).map((l) => ({ ...l }));
  const linkInfo = Object.fromEntries(LINKS.map((l) => [l.id, l]));

  // ---------------------------------------------------------------- routinePose (§7.3)
  {
    const frozen = deepFreeze(JSON.parse(JSON.stringify({ ISLANDER_PATHS: layout.ISLANDER_PATHS, PLOT_PLACES: layout.PLOT_PLACES || [], DECKS: layout.DECKS || [] })));
    const before = JSON.stringify(frozen);
    const bad = [];
    const visited = {};
    let maxJump = 0;
    const fits = [];
    for (const p of PEOPLE) {
      const pathP = frozen.ISLANDER_PATHS.find((q) => q.id === `isl:${p.id}`);
      const loop = pathP.pts.map(P3);
      if (loop.length > 1 && Math.hypot(loop[0][0] - loop[loop.length - 1][0], loop[0][2] - loop[loop.length - 1][2]) > 1e-6) loop.push(loop[0]);
      visited[p.id] = new Set();
      let prev = null;
      for (let t = 0; t <= I.DAY + 0.05; t += 0.1) {
        const q = I.routinePose(p.id, t, frozen);
        if (!q || !['x', 'y', 'z', 'h', 'speed', 'k', 'dive'].every((k) => Number.isFinite(q[k])) || typeof q.action !== 'string' || typeof q.moving !== 'boolean') {
          bad.push(`${p.id} at ${f2(t)}: ${show(q)}`);
          break;
        }
        if (segDist(q.x, q.z, loop) > 1e-6) bad.push(`${p.id} at ${f2(t)} off its loop by ${f2(segDist(q.x, q.z, loop))}`);
        if (!(p.mer ? I.ROUTINES[p.id].steps.some((s) => s.walk === q.action) || q.action === 'idle' || ['sit', 'wave', 'cheer'].includes(q.action) : true)) bad.push(`${p.id}: ${q.action}`);
        if (q.station) visited[p.id].add(q.station);
        if (q.moving !== (q.station === null)) bad.push(`${p.id} at ${f2(t)}: moving ${q.moving} at ${q.station}`);
        if (prev) {
          const jump = Math.hypot(q.x - prev.x, q.z - prev.z);
          maxJump = Math.max(maxJump, jump / Math.max(1e-6, Math.max(q.speed, prev.speed, 1e-6) * 0.1));
          if (jump > Math.max(q.speed, prev.speed) * 0.1 + 1e-6) bad.push(`${p.id} jumps ${f2(jump)} u at ${f2(t)}`);
        }
        prev = q;
      }
      const again = I.routinePose(p.id, 37.25, frozen);
      if (!same(again, I.routinePose(p.id, 37.25, frozen)) || !same(I.routinePose(p.id, 37.25, frozen), I.routinePose(p.id, 37.25 + I.DAY * 3, frozen))) bad.push(`${p.id}: not a pure function of the day`);
      const want = I.ROUTINES[p.id].steps.filter((s) => s.station).map((s) => s.station);
      if (!want.every((s) => visited[p.id].has(s))) bad.push(`${p.id} never reaches ${want.filter((s) => !visited[p.id].has(s)).join(', ')}`);
      fits.push([p.id, I.routineFit(p.id, frozen)]);
    }
    check(bad.length === 0 && JSON.stringify(frozen) === before, `routinePose for all 33 over a whole day (every 0.1 s, on a frozen layout it never changes): always on the islander's own loop, finite, never jumping (each 0.1 s step ≤ its speed × 0.1), moving exactly when not at a station, every station of the routine reached, the same pose for the same moment of every day${bad.length ? ' -> ' + bad.slice(0, 6).join('; ') : ''}`);
    const slow = fits.filter(([, f]) => !f || f.tempo > 1.3 + 1e-9 || f.sigma < 1 - 1e-9);
    check(slow.length === 0, `every routine's day fits its loop: its stations last at least as written and its walks are at most a brisk walk (×1.3 its pace) in the 120 s day (the longest loop ${f2(Math.max(...fits.map(([, f]) => (f ? f.length : 0))))} u, the briskest ×${f2(Math.max(...fits.map(([, f]) => (f ? f.tempo : 0))))})${slow.length ? ' -> ' + slow.map(([id, f]) => `${id} ×${f2(f && f.tempo)} stations ×${f2(f && f.sigma)} (${f2(f && f.length)} u)`).join(', ') : ''}`);
    const stillOnes = PEOPLE.filter((p) => I.ROUTINES[p.id].steps.some((s) => s.walk));
    const phases = new Set(PEOPLE.map((p) => (I.routinePose(p.id, 0, frozen) || {}).station || 'walking'));
    check(stillOnes.length === PEOPLE.length && phases.size > 3, `nobody stands still all day (everyone has a walk), and the islanders start the day at different points of their routines (${phases.size} different things at t = 0)`);
    const mer = I.routinePose('nerissa', 0, frozen);
    let dove = 0;
    for (let t = 0; t < I.DAY; t += 0.05) dove = Math.max(dove, I.routinePose('nerissa', t, frozen).dive);
    check(mer && dove > 0.99 && PEOPLE.filter((p) => !p.mer).every((p) => { for (let t = 0; t < I.DAY; t += 1) if (I.routinePose(p.id, t, frozen).dive !== 0) return false; return true; }), 'the merfolk dive below the water once a day (dive rises to 1 and back); nobody else ever does');
    const junk = [null, undefined, {}, [], 'x', 42, { ISLANDER_PATHS: null }, { ISLANDER_PATHS: [{ id: 'isl:finn', pts: 'x' }] }, { ISLANDER_PATHS: [{ id: 'isl:finn', pts: [[NaN, 0, 1]] }] }, new Proxy({}, { get() { throw new Error('proxy'); } })];
    let threw = '';
    let nulls = true;
    try {
      for (const j of junk) for (const id of ['finn', 'chip', 'nobody', '__proto__', 42, null]) if (I.routinePose(id, 1, j) !== null) nulls = false;
      for (const t of [NaN, Infinity, -Infinity, -5, '3', null, 1e12]) if (!I.routinePose('finn', t, frozen) || !Number.isFinite(I.routinePose('finn', t, frozen).x)) nulls = false;
    } catch (e) {
      threw = e.message;
    }
    check(!threw && nulls, `routinePose: null for an unknown islander, a builder or a layout without the loop; any time (NaN, ±Infinity, negative, huge) gives a pose; junk never throws${threw ? ' -> ' + threw : ''}`);
  }

  // ---------------------------------------------------------------- the walking bug: where routines pause (§6.5, §7.3)
  function stationProblems(lay, W) {
    const out = [];
    const links = (W.links || []).filter((l) => Array.isArray(l.pts) && l.pts.length >= 2);
    const mouths = [];
    for (const l of links) {
      const n = l.pts.length;
      mouths.push([l.id, l.pts[n >= 3 ? 1 : 0]], [l.id, l.pts[n >= 3 ? n - 2 : n - 1]]);
    }
    const spots = [];
    for (const pth of lay.ISLANDER_PATHS || []) {
      const pts = (pth.pts || []).map(P3);
      for (const st of pth.stations || []) {
        const q = Number.isInteger(st.i) && pts[st.i] ? pts[st.i] : st.at ? P3(st.at) : null;
        if (q) spots.push([`${pth.id}:${st.id}`, q[0], q[2]]);
        else out.push(`${pth.id}:${st.id} has no place`);
      }
    }
    for (const [name, x, z] of spots) {
      for (const l of links) if (segDist(x, z, l.pts) < (l.hw ?? 0.25) + 0.35) out.push(`${name} on the link ${l.id}`);
      for (const [id, m] of mouths) if (Math.hypot(x - m[0], z - m[2]) < 2) out.push(`${name} ${f2(Math.hypot(x - m[0], z - m[2]))} u from ${id}'s mouth`);
      for (const d of W.doors || []) if (Math.hypot(x - d.x, z - d.z) < 1.5) out.push(`${name} in the doorway ${d.id}`);
      for (const p of W.places || []) if (Math.hypot(x - p.x, z - p.z) < p.r + 0.35) out.push(`${name} inside the place ${p.id}`);
      if (W.spawn && Math.hypot(x - W.spawn.x, z - W.spawn.z) < 1.9) out.push(`${name} at the gangplank`);
    }
    // loops over bridges: ≤ 1 over a long scenery bridge, ≤ 2 over another rope bridge, none over today's four
    for (const l of links) {
      const info = linkInfo[l.id] || {};
      const kind = info.kind || (l.hw > 0.3 ? 'board' : 'rope');
      if (kind !== 'rope') continue;
      const mid = l.pts[Math.floor(l.pts.length / 2)];
      const over = (lay.ISLANDER_PATHS || []).filter((pth) => pth.kind !== 'dance' && (pth.pts || []).length >= 2 && segDist(mid[0], mid[2], (pth.pts || []).map(P3)) < (l.hw ?? 0.25) + 0.3).map((p) => p.id);
      const cap = info.today ? 0 : info.long ? 1 : 2;
      if (over.length > cap) out.push(`${over.length} islander loops over ${info.today ? "today's " : info.long ? 'the long ' : ''}rope bridge ${l.id} (${over.join(', ')})`);
    }
    return { out, spots: spots.length };
  }
  {
    const { out, spots } = stationProblems(layout, walk);
    const dance = (layout.ISLANDER_PATHS || []).filter((p) => p.kind === 'dance').reduce((n, p) => n + (p.stations || []).length, 0);
    check(out.length === 0 && spots > 33 && (real ? true : dance >= 4), `${real ? 'the v4 layout' : 'the mock layout'}: none of the ${spots} stations (the Music Hall's ${dance} dance spots included) is on a link, within 2 u of a link's mouth, in a doorway, inside a place circle (plot boards included) or at the gangplank; ≤ 1 islander loop over each of the five long scenery bridges, ≤ 2 over another rope bridge, none over today's four${out.length ? ' -> ' + out.slice(0, 8).join('; ') : ''}`);
    if (real) {
      const ids = layout.ISLANDER_PATHS.filter((p) => p.kind !== 'dance');
      const badIds = ids.filter((p) => !same((p.stations || []).map((s) => s.id), I.ROUTINES[p.islander].steps.filter((s) => s.station).map((s) => s.station))).map((p) => p.id);
      check(badIds.length === 0, `every loop's stations are its routine's, in its order${badIds.length ? ' -> ' + badIds.join(', ') : ''}`);
    }
    // the rules bite: a broken copy of the layout is caught on every rule
    const broken = JSON.parse(JSON.stringify(layout));
    const W2 = JSON.parse(JSON.stringify(walk));
    const finn = broken.ISLANDER_PATHS.find((p) => p.id === 'isl:finn');
    const L0 = W2.links.find((l) => l.id === 'plazaGarden') || W2.links[0];
    const LL = W2.links.filter((l) => (linkInfo[l.id] || {}).long);
    const door = (W2.doors || [])[0];
    const place = (W2.places || []).find((p) => p.id === 'builder') || W2.places[0];
    finn.pts = [L0.pts[1], L0.pts[Math.floor(L0.pts.length / 2)], [door.x, 1.3, door.z], [place.x, 1.3, place.z], [W2.spawn.x, 1.3, W2.spawn.z]];
    finn.stations = [{ id: 'pierEnd', i: 1 }, { id: 'market', i: 2 }, { id: 'bench', i: 3 }, { id: 'x', i: 4 }, { id: 'y', i: 0 }];
    if (LL.length) for (const id of ['isl:marina', 'isl:jib']) broken.ISLANDER_PATHS.find((p) => p.id === id).pts.push(...LL[0].pts);
    const caught = stationProblems(broken, W2).out.join(' | ');
    const rules = ['on the link', "mouth", 'in the doorway', 'inside the place', 'at the gangplank', ...(LL.length ? ['the long rope bridge'] : []), "today's rope bridge"];
    check(rules.every((r) => caught.includes(r)), `the station rules bite: a broken copy (a loop over today's bridge pausing on it, at its mouth, in a doorway, in a place circle and at the gangplank; two loops over a long bridge) is caught on every rule (${rules.filter((r) => caught.includes(r)).length} of ${rules.length})`);
  }

  // ================================================================== plan(): the crowd director (§7.2)
  {
    const CAP = I.PEOPLE_DRAWN;
    const r = rng(12);
    let worst = 0;
    let badJ = '';
    for (let k = 0; k < 1500; k++) {
      const n = Math.floor(r() * 140);
      const people = [];
      for (let i = 0; i < n; i++) people.push({ id: `p${i}`, x: (r() - 0.5) * 90, z: (r() - 0.5) * 90, pin: r() < 0.03 });
      const viewer = { x: (r() - 0.5) * 20, z: (r() - 0.5) * 20, cx: (r() - 0.5) * 20, cz: (r() - 0.5) * 20, chat: r() < 0.5 ? `p${Math.floor(r() * n)}` : null };
      const prev = new Set(people.filter(() => r() < 0.4).map((p) => p.id));
      const s = I.plan(viewer, people, prev, k * 0.25);
      worst = Math.max(worst, s.size);
      if (!(s instanceof Set) || [...s].some((id) => !people.some((p) => p.id === id))) badJ = `scene ${k}`;
    }
    check(worst <= CAP && worst === CAP && !badJ, `plan() never draws more than PEOPLE_DRAWN (${CAP}) in 1,500 random scenes of up to 140 people (the most it drew: ${worst}), and only people it was given${badJ ? ' -> ' + badJ : ''}`);

    // a plaza of 60 within 6 u (over the cap): the chat partner, then within 2 u, then within 6 u by distance
    const cap0 = { x: 0, z: 12, cx: 0, cz: 0 };
    const plaza = [];
    for (let i = 0; i < 60; i++) {
      const a = i * 2.39996;
      const d = 0.5 + (i / 60) * 5.4;
      plaza.push({ id: `q${i}`, x: Math.cos(a) * d, z: Math.sin(a) * d });
    }
    plaza.push({ id: 'far', x: 0, z: -20 }, { id: 'chatty', x: 0, z: -9 }, { id: 'behind', x: 0, z: 30 });
    const s1 = I.plan({ ...cap0, chat: 'chatty' }, plaza, null, 0);
    const byD = plaza.filter((p) => p.id.startsWith('q')).map((p) => [p.id, Math.hypot(p.x, p.z)]).sort((a, b) => a[1] - b[1]);
    const want = new Set(['chatty', ...byD.slice(0, CAP - 1).map((x) => x[0])]);
    check(s1.size === CAP && s1.has('chatty') && same([...s1].sort(), [...want].sort()) && !s1.has('far') && byD.filter((x) => x[1] <= 2).every((x) => s1.has(x[0])),
      `a plaza of 60 within 6 u (over the cap of ${CAP}): the chat partner (9 u away) first, then everyone within 2 u, then the nearest within 6 u; nobody farther`);
    const s1b = I.plan({ ...cap0, chat: 'chatty' }, plaza, s1, 0.25);
    check(same([...s1b].sort(), [...s1].sort()), 'the same crowd a step later: the same people (a full plaza is stable)');
    // under the cap: everyone within 6 u and the chat partner, even behind the camera
    const small = plaza.filter((p) => ['q0', 'q5', 'q20', 'q40', 'q59', 'behind', 'far'].includes(p.id)).concat([{ id: 'back6', x: 0, z: 5.5 }, { id: 'ahead', x: 2, z: -20 }]);
    const s2 = I.plan({ x: 0, z: 12, cx: 0, cz: 0, chat: 'behind' }, small, [], 0); // the lens at z 12 looks towards -z
    check(['q0', 'q5', 'q20', 'q40', 'q59', 'back6', 'behind', 'far', 'ahead'].every((id) => s2.has(id)) && s2.size === 9 && !I.plan({ x: 0, z: -12, cx: 0, cz: 0 }, small, [], 0).has('ahead'),
      `under the cap: everyone within 6 u of the captain (behind the lens too), the chat partner wherever he stands (18 u behind the lens), and the rest in front of the camera within 34 u; turned round, the one far ahead is behind it and not drawn`);
    // the far ring: in front only, within 34 u of the lens, with 1.5 u of hysteresis for whoever was drawn
    const lens = { x: 0, z: -10, cx: 0, cz: 0 }; // looking towards +z
    const far = [{ id: 'a', x: 0, z: 23.7 }, { id: 'b', x: 0, z: 24.4 }, { id: 'c', x: 0, z: 25.2 }, { id: 'd', x: 0, z: 25.8 }, { id: 'back', x: 0, z: -12 }];
    const h1 = I.plan(lens, far, [], 0); // a 33.7, b 34.4, c 35.2, d 35.8 u from the lens
    const h2 = I.plan(lens, far, ['a', 'b', 'c', 'd', 'back'], 0.25);
    check(same([...h1], ['a']) && same([...h2].sort(), ['a', 'b', 'c']),
      `the far ring: in front of the camera within 34 u of the lens (33.7 u drawn, 34.4 u not, nobody behind: ${[...h1].join(', ')}); whoever was drawn stays until 35.5 u (1.5 u of hysteresis: ${[...h2].sort().join(', ')} kept, 35.8 u and the one behind dropped)`);
    // a full far ring: a newcomer must be 1.5 u nearer than the worst drawn to swap in, one swap a step
    const ring = [];
    for (let i = 0; i < 60; i++) ring.push({ id: `r${i}`, x: (i % 10) - 4.5, z: 10 + Math.floor(i / 10) * 3 });
    const base = I.plan(lens, ring, [], 0);
    const worstIn = [...base].map((id) => ring.find((p) => p.id === id)).reduce((w, p) => (Math.hypot(p.x - lens.x, p.z - lens.z) > Math.hypot(w.x - lens.x, w.z - lens.z) ? p : w));
    const dW = Math.hypot(worstIn.x - lens.x, worstIn.z - lens.z);
    const near1 = I.plan(lens, [...ring, { id: 'new1', x: worstIn.x, z: worstIn.z - 1.0 }], base, 0.25);
    const near2 = I.plan(lens, [...ring, { id: 'new2', x: worstIn.x, z: worstIn.z - 2.0 }], base, 0.25);
    const two = I.plan(lens, [...ring, { id: 'n1', x: 0, z: 0.5 + 9 }, { id: 'n2', x: 0.5, z: 9 }], base, 0.25);
    check(base.size === CAP && !near1.has('new1') && same([...near1].sort(), [...base].sort()) && near2.has('new2') && !near2.has(worstIn.id) && near2.size === CAP && [...two].filter((id) => !base.has(id)).length === 1 && two.size === CAP,
      `a full far ring (60 people, the worst drawn at ${f2(dW)} u): a newcomer 1.0 u nearer stays out, one 2.0 u nearer swaps in for the worst, and two newcomers at once swap one a step`);
    // a drifting crowd: never more than one forced swap a step
    const rr = rng(4);
    const crowd = ring.map((p) => ({ ...p }));
    let prevSet = I.plan(lens, crowd, [], 0);
    let maxSwaps = 0;
    for (let step = 1; step < 400; step++) {
      for (const p of crowd) {
        p.x += (rr() - 0.5) * 0.6;
        p.z += (rr() - 0.5) * 0.6;
      }
      const s = I.plan(lens, crowd, prevSet, step * 0.25);
      const eligible = (id) => {
        const p = crowd.find((q) => q.id === id);
        const d = Math.hypot(p.x - lens.x, p.z - lens.z);
        return (p.z - lens.z) >= 0 && d <= 34 + 1.5;
      };
      const forcedOut = [...prevSet].filter((id) => !s.has(id) && eligible(id)).length;
      maxSwaps = Math.max(maxSwaps, forcedOut);
      if (s.size > CAP) maxSwaps = 99;
      prevSet = s;
    }
    check(maxSwaps <= 1, `a crowd of 60 drifting for 400 steps: at most ${maxSwaps} swap a step (nobody still in range is dropped for a newcomer more than once a step)`);
    // the cap may be lowered (the drop order's step 2), never raised; a lower cull radius; junk
    const low = I.plan({ ...cap0, cap: 39 }, plaza, null, 0);
    const high = I.plan({ ...cap0, cap: 500 }, plaza, null, 0);
    const shortR = I.plan({ ...lens, radius: 20 }, far, [], 0);
    const dup = I.plan(cap0, [{ id: 'x', x: 0, z: 1 }, { id: 'x', x: 50, z: 50 }, { id: 'y', x: NaN, z: 0 }, { x: 1, z: 1 }, null, 'junk'], null, 0);
    check(low.size === 39 && high.size === CAP && shortR.size === 0 && same([...dup], ['x']), 'viewer.cap lowers the cap (39: P₀, the drop order) but never raises it; viewer.radius shortens the cull; duplicate ids, bad positions and junk entries are skipped');
    let threw = '';
    let okJ = true;
    try {
      const prox = new Proxy({}, { get() { throw new Error('proxy'); } });
      for (const v of [null, undefined, 1, 'x', {}, { x: NaN }, prox]) for (const pp of [null, 'x', [null], prox, plaza]) for (const pr of [null, 'x', 5, prox, new Set(['q1'])]) {
        const s = I.plan(v, pp, pr, NaN);
        if (!(s instanceof Set) || s.size > CAP) okJ = false;
      }
      const ppl = deepFreeze(plaza.map((p) => ({ ...p })));
      const pv = deepFreeze({ ...cap0 });
      const pr = new Set(['q1']);
      I.plan(pv, ppl, pr, 0);
      if (!same([...pr], ['q1'])) okJ = false;
    } catch (e) {
      threw = e.message;
    }
    check(!threw && okJ, `plan(): junk viewers, crowds and prev sets never throw (an empty Set when there is no viewer); it changes none of its arguments${threw ? ' -> ' + threw : ''}`);
  }

  // ================================================================== buildScene: the construction scene's timeline (§5.2)
  {
    const L = (k, rd) => B.sceneLength(k, rd);
    const src = read('src/buildScene.js');
    check(L('new', false) === 9.4 && L('upgrade', false) === 7.0 && L('new', true) === 5.0 && L('upgrade', true) === 5.0 && L('junk', false) === 9.4 && L(undefined, undefined) === 9.4,
      `sceneLength: a new building ${L('new', false)} s, an upgrade ${L('upgrade', false)} s, reduced motion ${L('new', true)} s (either kind); junk is a new building`);
    check(Math.abs(B.SCENE.reduced - (4 * B.SCENE.still + 3 * B.SCENE.fade)) < 1e-9 && B.SCENE.still === 1.1 && B.SCENE.fade === 0.2 && /reduced:\s*tidy\(\s*4 \* still \+ 3 \* fade\s*\)/.test(src) && !/reduced:\s*5/.test(src),
      `SCENE.reduced is derived from still and fade in buildScene.js (4 × ${B.SCENE.still} + 3 × ${B.SCENE.fade} = ${B.SCENE.reduced}), never a number of its own`);
    check(B.SCENE.new === 9.4 && B.SCENE.upgrade === 7.0 && B.SCENE.skip === 0.3 && B.SCENE.orbit === 10 && B.SCENE.glide === 0.9 && B.SCENE.confetti <= 40 && B.PIPS === 6, 'SCENE: new 9.4, upgrade 7.0, skip 0.3 s, orbit ±10°, glide 0.9 s, ≤ 40 confetti bits; six pips');
    const TABLE = [
      ['builders', 'builders', 'Builders, ho!', 'Builders on the way!', 'Builders on the way!', [0, 1.0], [0, 0.8]],
      ['foundation', 'scaffold', 'Foundation', 'Laying the foundation!', 'Up goes the scaffold!', [1.0, 2.2], [0.8, 1.2]],
      ['frame', 'frame', 'Frame', 'Putting up the frame!', 'Putting up the frame!', [2.2, 3.8], [1.2, 2.2]],
      ['walls', 'walls', 'Walls', 'Raising the walls!', 'Raising the walls!', [3.8, 5.4], [2.2, 3.6]],
      ['roof', 'roof', 'Roof', 'Putting on the roof!', 'Putting on the roof!', [5.4, 6.6], [3.6, 4.6]],
      ['finish', 'finish', 'Finishing touches', 'Finishing touches!', 'Finishing touches!', [6.6, 7.8], [4.6, 5.6]],
      ['movingIn', 'movingIn', 'Moving in', 'Moving in!', 'Moving in!', [7.8, 9.4], [5.6, 7.0]],
    ];
    const got = B.STAGES.map((s) => [s.id, s.upId, s.name, s.caption, s.upCaption, s.new, s.upgrade]);
    const contiguous = ['new', 'upgrade'].every((k) => B.STAGES.every((s, i) => s.index === i && s[k][1] > s[k][0] && (i === 0 ? s[k][0] === 0 : s[k][0] === B.STAGES[i - 1][k][1])) && B.STAGES[6][k][1] === B.sceneLength(k, false));
    check(same(got, TABLE) && contiguous, `STAGES: §5.2's seven stages in order (builders, foundation / scaffold, frame, walls, roof, finish, movingIn), contiguous from 0 to 9.4 s and 7.0 s, with the table's captions`);
    const bad = [];
    for (const kind of ['new', 'upgrade']) {
      let last = -1;
      const len = B.sceneLength(kind, false);
      for (let t = -0.5; t <= len + 0.5; t += 0.01) {
        const s = B.stageAt(t, kind, false);
        const row = TABLE[s.index];
        const span = kind === 'new' ? row[5] : row[6];
        const tt = Math.min(len, Math.max(0, t));
        if (s.index < last || s.stage !== (kind === 'new' ? row[0] : row[1]) || s.caption !== (kind === 'new' ? row[3] : row[4]) || s.pips !== s.index || s.done !== (t >= len) || !(s.k >= 0 && s.k <= 1) || (tt < span[0] - 1e-9 || (tt > span[1] + 1e-9))) bad.push(`${kind} ${f2(t)}: ${show(s)}`);
        last = s.index;
      }
    }
    const walls = B.stageAt(4.6, 'new', false);
    check(bad.length === 0 && walls.stage === 'walls' && walls.name === 'Walls' && walls.pips === 3 && Math.abs(walls.k - 0.5) < 1e-9 && B.stageAt(0.9, 'upgrade', false).stage === 'scaffold' && B.stageAt(9.4, 'new', false).done && !B.stageAt(9.39, 'new', false).done,
      `stageAt every 0.01 s of both scenes (and before and after): the stages in order, each inside its span, its caption, pips = the stages done ("Walls ●●●○○○" at 4.6 s, halfway), done at the end${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    // reduced motion: four stills of 1.1 s with three 0.2 s crossfades, no fade-in before the first
    const badR = [];
    const seenStills = [];
    for (let t = 0; t <= 5.0; t += 0.005) {
      const s = B.stageAt(t, 'new', true);
      const i = s.still;
      if (!seenStills.includes(i)) seenStills.push(i);
      const start = i * 1.3;
      const inFade = i > 0 && t < start - 1e-9;
      if (i === 0 && s.fade !== 1) badR.push(`fade-in at ${f2(t)}`);
      if (inFade && !(s.fade >= 0 && s.fade < 1 + 1e-9 && t >= start - 0.2 - 1e-9)) badR.push(`${f2(t)}: ${show(s)}`);
      if (!inFade && s.fade !== 1 && Math.abs(s.fade - 1) > 1e-9) badR.push(`${f2(t)} fade ${s.fade}`);
    }
    const shows = [0, 1, 2, 3].map((i) => B.stageAt(i * 1.3 + 0.5, 'new', true).stage);
    const showsU = [0, 1, 2, 3].map((i) => B.stageAt(i * 1.3 + 0.5, 'upgrade', true).stage);
    check(badR.length === 0 && same(seenStills, [0, 1, 2, 3]) && same(shows, ['foundation', 'frame', 'roof', 'movingIn']) && same(showsU, ['scaffold', 'frame', 'roof', 'movingIn']) && B.stageAt(5.0, 'new', true).done && !B.stageAt(4.99, 'new', true).done && B.stageAt(1.2, 'new', true).still === 1 && Math.abs(B.stageAt(1.2, 'new', true).fade - 0.5) < 1e-6,
      `reduced motion: four stills (foundation or scaffold, the frame, the walls and roof, done), each 1.1 s, three 0.2 s crossfades between them (none before the first, which starts on a cut), 5.0 s in all${badR.length ? ' -> ' + badR.slice(0, 4).join('; ') : ''}`);
    // cueAt: every cue exactly once however the frames fall
    const badC = [];
    const r = rng(31);
    for (const kind of ['new', 'upgrade']) for (const reduced of [false, true]) {
      const len = B.sceneLength(kind, reduced);
      const all = B.cueAt(-1, len + 1, kind, reduced);
      const key = (c) => JSON.stringify(c);
      if (!all.length || all.some((c) => !(c.at > 0 && c.at <= len)) || all.some((c, i) => i > 0 && c.at < all[i - 1].at)) badC.push(`${kind} ${reduced}: cues outside (0, ${len}] or out of order`);
      if (!same(B.cueAt(0, len, kind, reduced), all)) badC.push(`${kind} ${reduced}: cueAt(0, end) misses one`);
      for (let k = 0; k < 300; k++) {
        const fired = [];
        let t = 0;
        while (t < len) {
          const dt = r() < 0.1 ? r() * 2 : r() < 0.2 ? 1e-4 : r() * 0.05; // big hitches, tiny steps and ordinary frames
          const t1 = Math.min(len, t + dt);
          fired.push(...B.cueAt(t, t1, kind, reduced));
          t = t1;
        }
        fired.push(...B.cueAt(len, len + 5, kind, reduced));
        if (!same(fired.map(key), all.map(key))) {
          badC.push(`${kind} ${reduced} run ${k}: ${fired.length} of ${all.length}`);
          break;
        }
      }
    }
    check(badC.length === 0, `cueAt: over 300 random frame sequences of each scene (big hitches, tiny steps), every cue fires exactly once, in order${badC.length ? ' -> ' + badC.slice(0, 3).join('; ') : ''}`);
    const sfx = (kind, rd, stage) => B.cueAt(-1, 99, kind, rd).filter((c) => c.sfx && (!stage || c.stage === stage)).map((c) => c.sfx);
    const count = (arr, n) => arr.filter((x) => x === n).length;
    const nw = (st) => sfx('new', false, st);
    const up = (st) => sfx('upgrade', false, st);
    check(count(nw('builders'), 'whistle') === 1 && count(nw('foundation'), 'thud') === 6 && count(up('scaffold'), 'tok') === 2 && count(nw('frame'), 'tok') === 8 && count(nw('walls'), 'saw') === 1 && count(nw('roof'), 'clack') === 4 && count(nw('roof'), 'pop') === 1 && count(nw('finish'), 'chime') === 3 && count(nw('finish'), 'brush') === 1 && ['door', 'cheer', 'tada'].every((n) => count(nw('movingIn'), n) === 1),
      "§5.2's sounds: Bess's whistle, six thuds for the foundation (two toks for a scaffold), eight toks for the frame, the saw, four clacks and a pop for the roof, the brush and three chimes, the door, the cheer and the tada");
    const allS = ['new', 'upgrade'].flatMap((k) => [false, true].flatMap((rd) => sfx(k, rd)));
    check(allS.every((n) => SFX.has(n)) && same(sfx('new', true).slice().sort(), sfx('new', false).slice().sort()) && same(sfx('upgrade', true).slice().sort(), sfx('upgrade', false).slice().sort()),
      `every cue's sound is an audio.js name (§11.1); reduced motion plays the same sounds (${sfx('new', true).length} for a new building)`);
    const evR = B.cueAt(-1, 99, 'new', true).map((c) => c.event).filter(Boolean);
    const ev = B.cueAt(-1, 99, 'new', false).map((c) => c.event).filter(Boolean);
    const caps = (k, rd) => B.cueAt(-1, 99, k, rd).filter((c) => c.caption).map((c) => c.caption);
    check(!evR.some((e) => ['glide', 'cart', 'confetti'].includes(e)) && ['glide', 'cart', 'confetti', 'blueprint', 'cut', 'door'].every((e) => ev.includes(e)) && count(ev, 'block') === 6 && count(ev, 'post') === 4 && count(ev, 'tiles') === 4 && same(caps('new', false), TABLE.map((t) => t[3])) && same(caps('upgrade', false), TABLE.map((t) => t[4])) && same(caps('new', true), ['Laying the foundation!', 'Putting up the frame!', 'Putting on the roof!', 'Moving in!']),
      'the events: the glide, the cart, the blueprint, six blocks, four posts, the cut, four tile bands, the door and the confetti; each stage starts with its caption (one a still under reduced motion), and reduced motion has no glide, cart ride or confetti');
    const cams = [0, 0.45, 0.9, 3, 9.4].map((t) => B.cameraAt(t, 'new', false));
    let maxO = 0;
    for (let t = 0; t <= 9.4; t += 0.01) maxO = Math.max(maxO, Math.abs(B.cameraAt(t, 'new', false).orbit));
    check(cams[0].glide === 0 && Math.abs(cams[1].glide - 0.5) < 1e-9 && cams[2].glide === 1 && cams[2].orbit === 0 && maxO <= (10 * Math.PI) / 180 + 1e-9 && maxO > (9 * Math.PI) / 180 && same(B.cameraAt(2, 'new', true), { glide: 1, orbit: 0 }),
      'cameraAt: the glide over 0.9 s, then the slow orbit within ±10°; reduced motion: a cut, no orbit');
    check(B.builtLine('Fishing Hut', ['Finn']) === 'Fishing Hut built! Finn moved in.' && B.builtLine('Goat Pen', []) === 'Goat Pen built!' && B.builtLine(null, ['  ', 7, 'Bo', 'Nibbles']) === 'Your building built! Bo and Nibbles moved in.', 'builtLine: one name, none, junk names skipped');
    let threw = '';
    let okJ = true;
    try {
      for (const t of [NaN, Infinity, -Infinity, null, 'x', {}, 1e9]) for (const k of ['new', 'upgrade', null, 5, {}]) for (const rd of [true, false, 'yes', null]) {
        const s = B.stageAt(t, k, rd);
        if (!s || typeof s.stage !== 'string' || !(s.k >= 0 && s.k <= 1) || typeof s.done !== 'boolean') okJ = false;
        if (!Array.isArray(B.cueAt(t, t, k, rd)) || !Array.isArray(B.cueAt(t, 3, k, rd)) || !Number.isFinite(B.cameraAt(t, k, rd).orbit)) okJ = false;
      }
      const c = B.cueAt(0, 99, 'new', false);
      c[0].sfx = 'boom';
      if (B.cueAt(0, 99, 'new', false)[0].sfx === 'boom') okJ = false;
    } catch (e) {
      threw = e.message;
    }
    check(!threw && okJ, `junk times, kinds and reduced flags never throw (NaN counts as the start); cueAt hands out fresh copies${threw ? ' -> ' + threw : ''}`);
  }

  // ================================================================== the Sea Guide (§8.7)
  {
    const enemy = SHIPS ? Object.keys(SHIPS.SHIP_TYPES).filter((k) => k !== 'player') : [];
    const ids = G.GUIDE.map((c) => c.id);
    check(enemy.length >= 19 && enemy.every((k) => ids.includes(k)) && ids.includes('kraken') && V4_KINDS.every((k) => ids.includes(k)) && new Set(ids).size === ids.length && ids.length === new Set([...enemy, 'kraken', ...V4_KINDS]).size,
      `GUIDE: a card for every enemy ship type (${enemy.length}), the Kraken and every Voyage IV kind (${V4_KINDS.length}): ${ids.length} cards, one each`);
    const FOE_NAMES = FOES && FOES.FOE_NAMES ? FOES.FOE_NAMES : {};
    const badN = G.GUIDE.filter((c) => (SHIPS && SHIPS.SHIP_TYPES[c.id] ? SHIPS.SHIP_TYPES[c.id].name !== c.name : FOE_NAMES[c.id] ? FOE_NAMES[c.id] !== c.name : c.id === 'kraken' ? c.name !== 'The Kraken' : false)).map((c) => `${c.id}: ${c.name}`);
    check(badN.length === 0 && Object.keys(FOE_NAMES).length >= 5, `each card's name is the game's own (shipTypes.js's names, foes4.js's FOE_NAMES, "The Kraken")${badN.length ? ' -> ' + badN.join(', ') : ''}`);
    const KEY = /\b(?:[Pp]ress|[Hh]old|[Tt]ap)\s+(?:the\s+)?(?:[A-Z]|Enter|Space|Esc)(?![A-Za-z])/;
    const badL = G.GUIDE.filter((c) => [c.does, c.beat].some((t) => typeof t !== 'string' || !t.trim() || t.length > 90 || /\n/.test(t) || !/[.!?]$/.test(t) || KEY.test(t)) || typeof c.icon !== 'string' || !/^#[0-9a-f]{6}$/.test(c.colour)).map((c) => c.id);
    check(badL.length === 0, `"What it does" and "How to beat it" are one line each, ≤ 90 characters, a sentence, naming no key (the guide is read on phones too); every card has an icon and a colour${badL.length ? ' -> ' + badL.join(', ') : ''}`);
    // where each is first met: the levels' waves (levels.js, act2.js, act3.js) and pools.js's INTRO
    const first = {};
    for (const f of ['src/levels.js', 'src/act2.js', 'src/act3.js']) {
      const s = read(f);
      for (const m of s.matchAll(/stars:\s*(\d+),[\s\S]*?waves:\s*(\[\[[^\n]*\]\])/g)) for (const k of m[2].match(/'(\w+)'/g) || []) {
        const id = k.slice(1, -1);
        first[id] = Math.min(first[id] ?? 99, Number(m[1]));
      }
    }
    first.kraken = 9;
    if (POOLS && POOLS.INTRO) for (const [k, [lv]] of Object.entries(POOLS.INTRO)) first[k] = lv;
    first.shellback = 12;
    const badF = G.GUIDE.filter((c) => first[c.id] !== c.from || c.v4 !== V4_KINDS.includes(c.id) || c.voyage !== (c.from >= 10 ? 4 : c.from >= 7 ? 3 : c.from >= 4 ? 2 : 1)).map((c) => `${c.id}: ${c.from} (want ${first[c.id]})`);
    check(badF.length === 0 && Object.keys(first).length >= 25 && G.GUIDE.every((c, i) => i === 0 || c.from >= G.GUIDE[i - 1].from), `each card's level is where it is first met (the levels' waves, pools.js's INTRO, the Kraken 9, the Shellback 12), in the order you meet them${badF.length ? ' -> ' + badF.join('; ') : ''}`);
    // guideFor: seen and beaten
    const g0 = G.guideFor(0, 1);
    const g9 = G.guideFor(0, 9);
    const met = (1 << V4_KINDS.indexOf('jolly')) | (1 << V4_KINDS.indexOf('fort'));
    const gm = G.guideFor(met, 12, { cutter: 3, kraken: 1, stinger: 2, junk: 0, puffer: 'x' });
    const seen = (list) => list.filter((c) => c.seen).map((c) => c.id);
    check(same(seen(g0), ['cutter', 'privateer']) && same(seen(g9), G.GUIDE.filter((c) => !c.v4).map((c) => c.id)) && same(seen(gm), [...G.GUIDE.filter((c) => !c.v4).map((c) => c.id), 'jolly', 'fort']) &&
      gm.find((c) => c.id === 'cutter').beaten === 3 && gm.find((c) => c.id === 'kraken').beaten === 1 && gm.find((c) => c.id === 'stinger').beaten === 2 && gm.find((c) => c.id === 'junk').beaten === null && gm.find((c) => c.id === 'puffer').beaten === null && g0.every((c) => c.beaten === null) &&
      same(gm.map((c) => c.id), ids) && G.NOT_MET === 'Not met yet',
      'guideFor: Voyages I–III\'s kinds (and the Kraken) count as met once their level is open, Voyage IV\'s by their met bits only (unlocked 12 alone meets none of them); "Beaten ×N" where counted; GUIDE\'s order');
    let threw = '';
    let okJ = true;
    try {
      const prox = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
      for (const m of [null, undefined, -1, NaN, 1e12, 2.5, '255', {}, prox]) for (const u of [null, -3, NaN, 'x', 1e9, prox]) for (const c of [null, 'x', prox, { cutter: -1 }]) {
        const g = G.guideFor(m, u, c);
        if (!Array.isArray(g) || g.length !== ids.length || g.some((x) => typeof x.seen !== 'boolean' || (x.beaten !== null && !Number.isInteger(x.beaten)))) okJ = false;
      }
      const a = G.guideFor(255, 12);
      a[0].name = 'x';
      if (G.guideFor(255, 12)[0].name === 'x' || G.GUIDE[0].name === 'x') okJ = false;
      if (!G.guideFor(255, 12).every((c) => c.seen)) okJ = false;
    } catch (e) {
      threw = e.message;
    }
    check(!threw && okJ, `guideFor: junk met bits, levels and counts never throw; a fresh array of fresh cards every call; everything met and open shows every card${threw ? ' -> ' + threw : ''}`);
  }

  // ================================================================== junk in, well-formed results out (islanders.js)
  {
    const prox = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();
    const hostile = {};
    for (const k of ['t', 'unlocked', 'shell', 'ISLANDER_PATHS', 'PLOT_PLACES', 'ANIMAL_SPOTS']) Object.defineProperty(hostile, k, { enumerable: true, get() { throw new Error('getter'); } });
    const junk = [undefined, null, NaN, -1, 0, 1e308, '', 'x', '{"t":{"homeE":3}}', true, [], {}, () => 1, Symbol('x'), 10n, hostile, prox, revoked, { t: { homeE: 'x', grotto: -2 } }, { t: hostile }];
    const problems = [];
    for (const j of junk) {
      try {
        const r = I.roster(j, j, j, j);
        if (!r || !Array.isArray(r.people) || !Array.isArray(r.animals) || r.builders.length !== 3) problems.push(`roster(${show(j)})`);
        if (!Array.isArray(I.linesFor(j, j, j))) problems.push(`linesFor(${show(j)})`);
        if (I.linesFor('ada', j, j).length < 2) problems.push(`linesFor(ada, ${show(j)})`);
        const m = I.movesIn(j, j);
        if (!Array.isArray(m.people) || !Array.isArray(m.animals)) problems.push(`movesIn(${show(j)})`);
        const d = I.danceAt(j, j);
        if (!(d >= 0 && d <= 1)) problems.push(`danceAt(${show(j)})`);
        if (I.routineFit('finn', j) !== null && typeof I.routineFit('finn', j) !== 'object') problems.push('routineFit');
      } catch (e) {
        problems.push(`${show(j)}: threw ${e.message}`);
      }
    }
    check(problems.length === 0, `${junk.length} kinds of junk (strings, symbols, bigints, throwing getters, proxies, a revoked proxy, broken records) in every argument of roster, linesFor, movesIn, danceAt, routineFit: no throws, well-formed results${problems.length ? ' -> ' + problems.slice(0, 5).join('; ') : ''}`);
    const isl4 = (t) => ({ v: 1, t: { music: t } });
    let on = 0;
    for (let t = 0; t < 600; t += 0.05) if (I.danceAt(t, isl4(3)) > 0) on += 0.05;
    check([0, 1, 2].every((t) => I.danceAt(4, isl4(t)) === 0) && I.danceAt(4, isl4(3)) > 0.99 && I.danceAt(30, isl4(3)) === 0 && Math.abs(on - 80) < 0.2, `the plaza dance: only with the Music Hall at tier 3, 8 s every 60 s (${f2(on)} s of 600)`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll islander checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// ---------------------------------------------------------------------------------------- the mock layout
// Until 1N's islandPlan has its paths and the v4 fixture exists (Stage 1b), the station checks run on a mock of the
// same shapes: today's fixture (its four links, places, doors and spawn), the decks of §6.2's table, a straight link
// between the decks of every islandPlan LINKS entry (its mouths 3.4 u out from each deck's centre, 0.9 u run-ins), a
// plot place on each plot's porch, and each islander's loop: a small square on its building's deck, its stations at the
// corners; the Music Hall's dance spots on the plaza.
function mockLayout(PLAN, PEOPLE, ROUTINES) {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/sparrow-walk.json'), 'utf8'));
  const C = {
    plaza: [0, -10.25], tavern: [-6.85, -19.6], tower: [-18.2, -25.4], yard: [16.2, -11.5], s1: [5.2, -21.1], garden: [-14.4, -7.6],
    s2: [13.4, -23.2], s3: [-0.5, -29.5], s4: [-7.6, -33.6], s5: [9.2, -31.5], s6: [-26, -26], s7: [21.5, -22.5], s8: [-24, -9], s9: [25, -6], s10: [-17.5, -38], s11: [18, -36], s12: [2, -40],
    s13: [-21.5, 2], s14: [-29, -4.5], s15: [-31, -16], s16: [-17.6, -17.4], s17: [29.5, -25], s18: [35, -12.5], beach: [-37, -31], hill: [2, -54], pier: [41, -13.5],
  };
  const PLAT = { homeA: 's16', homeB: 's3', homeC: 's2', homeD: 's7', bakery: 's8', windmill: 's6', lighthouse: 's18', market: 's15', school: 's13', park: 's14', homeE: 'beach', homeF: 's17', homeG: 'hill', forge: 's4', fishing: 's9', farm: 's10', music: 's5', museum: 's11', observatory: 'hill', aquarium: 's12', grotto: 'beach' };
  const links = base.links.map((l) => ({ ...l }));
  for (const L of (PLAN && PLAN.LINKS) || []) {
    if (L.today || !C[L.from] || !C[L.to]) continue;
    const [ax, az] = C[L.from];
    const [bx, bz] = C[L.to];
    const d = Math.hypot(bx - ax, bz - az) || 1;
    const ux = (bx - ax) / d;
    const uz = (bz - az) / d;
    const at = (s) => [+(ax + ux * s).toFixed(3), 1.3, +(az + uz * s).toFixed(3)];
    links.push({ id: L.id, hw: L.kind === 'rope' ? 0.25 : 0.6, pts: [at(2.5), at(3.4), at(d - 3.4), at(d - 2.5)] });
  }
  const places = [...base.places];
  for (const [id, plat] of Object.entries(PLAT)) {
    const [x, z] = C[plat];
    const off = plat === 'beach' || plat === 'hill' ? (id === 'grotto' || id === 'observatory' ? -2.6 : 2.6) : 2.6;
    places.push({ id: `plot:${id}`, x, z: z + off, r: 1.0 });
  }
  // each islander's square loop on its building's deck (islanders who share a deck get their own corner of it)
  const share = {};
  const ISLANDER_PATHS = [];
  for (const p of PEOPLE) {
    const plat = PLAT[p.plot];
    const [cx, cz] = C[plat];
    const k = (share[plat] = (share[plat] || 0) + 1) - 1;
    const ox = ((k % 3) - 1) * 0.5;
    const oz = -0.4 + Math.floor(k / 3) * 0.3;
    const h = 0.35;
    const corners = [[cx + ox - h, cz + oz - h], [cx + ox + h, cz + oz - h], [cx + ox + h, cz + oz + h], [cx + ox - h, cz + oz + h]];
    const pts = [...corners, corners[0]].map(([x, z]) => [+x.toFixed(3), 1.3, +z.toFixed(3)]);
    const st = ROUTINES[p.id].steps.filter((x) => x.station).map((x) => x.station);
    ISLANDER_PATHS.push({ id: `isl:${p.id}`, islander: p.id, kind: 'islander', loop: true, pts, stations: st.map((sid, i) => ({ id: sid, i })) });
  }
  // the Music Hall's dance spots on the plaza
  const spots = [[-3, -11], [-1.5, -12.2], [0, -11], [1.5, -12.2], [3, -11], [0, -12.9]].map(([x, z]) => [x, 1.3, z]);
  ISLANDER_PATHS.push({ id: 'dance', kind: 'dance', pts: spots, stations: spots.map((_, i) => ({ id: `spot${i}`, i })) });
  return {
    layout: { ISLANDER_PATHS, PLOT_PLACES: places.filter((q) => q.id.startsWith('plot:')), DECKS: Object.entries(C).map(([id, [x, z]]) => ({ id, x, z, w: 6, d: 6, y: 1.3 })) },
    walk: { ...base, links, places },
  };
}
