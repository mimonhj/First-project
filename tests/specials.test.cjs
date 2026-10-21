// Unit checks for the special ammo in src/specials.js (plain Node, no browser), SPEC3 §2, §10.1, §13.1:
// - the tables exactly (SPECIAL, RECIPES, LOADS, STATUS, IMMUNE), frozen, and the WORDS3 words and templates
// - specialShot for each special (hull factor, no crit effect, no crew, the status), never changing its input
// - §2.1's worked example, exactly, through combat.js shotResult + specialShot + armourMul + the burn
// - applyStatus: once per volley (the caller's job, checked through a helper), refresh / extend / cap for each
//   status, bosses halve, the two immunities, KA-BOOM, FIRE OUT, frost on stinky, the clothes-peg window
// - stepStatus timings in simulated 1/120 s steps; statusMuls; the shared burn (mergeBurn); douse
// - loads: start (4 + Windmill), spend per side, fall back, crates; ammoReady's reasons and words
// - onSale at unlocked 3..7; buyRecipe's reasons; parsePowder with the garbage battery of upgrades.test.cjs
// - junk in (missing, NaN, wrong types, throwing getters, proxies): no throws, well-formed results out
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

// The game's modules are browser ES modules in a package without "type": "module". These import
// nothing, so they are loaded from their source as data: URLs (as in upgrades.test.cjs).
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, eps = 1e-9) => typeof a === 'number' && Math.abs(a - b) <= eps;
const tidy = (v) => Math.round(v * 1e9) / 1e9;
const show = (v) => {
  if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 60) + '…' : v);
  if (typeof v === 'symbol' || typeof v === 'function' || typeof v === 'bigint') return String(v);
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 60) + '…' : s;
  } catch {
    try {
      return Object.prototype.toString.call(v);
    } catch {
      return '[a hostile object]';
    }
  }
};
const isInt = (v) => Number.isInteger(v) && !Object.is(v, -0);
const DT = 1 / 120; // main.js MAX_STEP: the simulation's substep

(async () => {
  const S = await load('src/specials.js');
  const C = await load('src/combat.js');
  const { SHIP_TYPES } = await load('src/shipTypes.js');
  const NONE = { id: null, t: 0, max: 0, immune: 0 };
  const st = (id, t, max = t, immune = 0, pegs) => (pegs === undefined ? { id, t, max, immune } : { id, t, max, immune, pegs });
  // run a status for `secs` simulated seconds in 1/120 s steps
  const run = (s, secs) => {
    let cur = s;
    const n = Math.round(secs * 120);
    for (let i = 0; i < n; i++) cur = S.stepStatus(cur, DT).st;
    return cur;
  };

  // ------------------------------------------------------------------ the tables (§2.1, §2.2, §2.5)
  {
    const WANT = {
      SPECIAL_IDS: ['fire', 'frost', 'stink'],
      ALL_AMMO: ['round', 'chain', 'grape', 'fire', 'frost', 'stink'],
      SPECIAL: {
        fire: { name: 'Fire shot', key: '4', hull: 0.7, crew: 0, rakeCrew: 0, range: 30, reloadMul: 1.1, spreadMul: 1.0, pad: 0.4, top: 3.8, status: 'fire' },
        frost: { name: 'Frost shot', key: '5', hull: 0.6, crew: 0, rakeCrew: 0, range: 28, reloadMul: 1.1, spreadMul: 1.1, pad: 0.4, top: 3.8, status: 'frost' },
        stink: { name: 'Stink shot', key: '6', hull: 0.2, crew: 0, rakeCrew: 0, range: 22, reloadMul: 1.2, spreadMul: 1.5, pad: 0.8, top: 5.0, status: 'stink' },
      },
      RECIPES: { fire: { price: 300, sale: 4 }, frost: { price: 300, sale: 6 }, stink: { price: 500, sale: 7 } },
      LOADS: { base: 4, windmill: [0, 1, 2, 3], crate: 1, crateGold: 20, crateReach: 3 },
      STATUS: {
        fire: { dps: 3, time: 6, boss: 3 },
        frost: { speed: 0.5, turn: 0.6, time: 5, add: 2, max: 8, bossMul: 0.5 },
        stink: { time: 4, boss: 2, immune: 10, bossImmune: 20, grit: 0.75, decel: 2 },
        kaboom: { burst: 15 },
      },
      IMMUNE: { inferno: ['fire'], phantom: ['stink'] },
    };
    for (const [name, want] of Object.entries(WANT)) {
      check(same(S[name], want), `${name} is exactly the SPEC3 table${same(S[name], want) ? '' : ` -> ${JSON.stringify(S[name])}`}`);
    }
    const deepFrozen = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
    check([...Object.keys(WANT), 'WORDS3'].every((k) => deepFrozen(S[k])), 'every table (and WORDS3) is frozen all the way down, so nothing can change a rule by accident');
    const fns = [
      'isSpecial', 'onSale', 'specialShot', 'newStatus', 'applyStatus', 'stepStatus', 'statusMuls', 'douse', 'startLoads', 'spendLoad', 'crateLoad',
      'defaultPowder', 'parsePowder', 'serializePowder', 'buyRecipe', // §11.1
      'isImmune', 'mergeBurn', 'ammoReady', 'mergePowder', // additions (main's shared burn, keys 4–6 / tray reasons, the storage listener)
    ];
    const missing = fns.filter((k) => typeof S[k] !== 'function');
    check(missing.length === 0, `every §11.1 export is there, and the helpers isImmune, mergeBurn, ammoReady, mergePowder${missing.length ? ' -> missing ' + missing.join(', ') : ''}`);
    check(same(S.SPECIAL_IDS, Object.keys(S.SPECIAL)) && S.SPECIAL_IDS.every((id) => S.SPECIAL[id].status === id && Object.keys(S.STATUS).includes(id)), 'SPECIAL lists the shots in SPECIAL_IDS order; each puts its own status on (a STATUS row)');
    // The special rows read like combat.js AMMO rows, so main's fire() / hitsShip() can read either table.
    const ammoFields = Object.keys(C.AMMO.round).filter((k) => k !== 'unlock');
    const okFields = S.SPECIAL_IDS.every((id) => ammoFields.every((k) => typeof S.SPECIAL[id][k] === 'number'));
    check(okFields && same(S.ALL_AMMO, [...C.AMMO_IDS, ...S.SPECIAL_IDS]) && same(S.SPECIAL_IDS.map((id) => S.SPECIAL[id].key), ['4', '5', '6']),
      `each SPECIAL row has every AMMO field (${ammoFields.join(', ')}); ALL_AMMO = combat's AMMO_IDS + the specials; keys 4, 5, 6`);
    const trade = S.SPECIAL_IDS.every((id) => {
      const s = S.SPECIAL[id];
      return s.hull < 1 && s.range < C.AMMO.round.range && s.reloadMul > 1 && s.spreadMul >= 1 && s.crew === 0 && s.rakeCrew === 0;
    });
    check(trade, 'every special is a trade (§2.1): less hull damage, shorter range, slower reload than round shot, never wider-than-round accuracy, no crew killed');
    const total = S.SPECIAL_IDS.reduce((a, id) => a + S.RECIPES[id].price, 0);
    check(total === 1100 && same(S.SPECIAL_IDS.map((id) => S.RECIPES[id].sale), [4, 6, 7]), `the three recipes cost ${total} gold in all (§9), on sale after levels 3, 5 and 6`);
    const bosses = Object.keys(SHIP_TYPES).filter((k) => SHIP_TYPES[k].boss);
    check(same(bosses, ['inferno', 'phantom', 'inkheart']) && Object.keys(S.IMMUNE).every((k) => SHIP_TYPES[k] && SHIP_TYPES[k].boss),
      `the bosses are ${bosses.join(', ')}; the two immune types are real bosses (${Object.keys(S.IMMUNE).join(', ')})`);
    check(S.STATUS.fire.dps * S.STATUS.fire.time === 18 && C.EFFECTS.keg.dps * C.EFFECTS.keg.time === 8, 'a fire burns 3 hp/s × 6 s = 18 hp, a POWDER KEG 2 × 4 = 8 (§2.2)');
  }

  // ------------------------------------------------------------------ WORDS3 (§2.2–2.7, §6.1–6.5)
  {
    const W = S.WORDS3;
    const pops = {
      fire: 'ON FIRE!', frost: 'FROZEN!', stink: 'STINKY!', pegs: 'Clothes-pegs!', kaboom: 'KA-BOOM!', fireOut: 'FIRE OUT! SSSS!', doused: 'FIRE OUT!',
      immunePop: 'IMMUNE!', clang: 'CLANG!',
    };
    const badPops = Object.entries(pops).filter(([k, v]) => W[k] !== v);
    check(badPops.length === 0, `the pops of §2.7: ${Object.values(pops).join(' · ')}${badPops.length ? ' -> ' + badPops.map(([k]) => `${k} ${show(W[k])}`).join('; ') : ''}`);
    check(same(W.immune, { inferno: 'The Maw laughs at fire!', phantom: "Ghosts can't smell!" }) && same(Object.keys(W.immune), Object.keys(S.IMMUNE)),
      `the two immunities say why: "${W.immune.inferno}", "${W.immune.phantom}"`);
    const tipsOk = Object.entries(W.powderTip).every(([recipe, text]) => {
      const type = Object.keys(S.IMMUNE).find((k) => S.IMMUNE[k].includes(recipe));
      return type && text === `Powder tip: ${W.immune[type]}`;
    });
    check(tipsOk && same(Object.keys(W.powderTip), ['fire', 'stink']), `the rumour board's powder tips (§2.2): "${W.powderTip.fire}", "${W.powderTip.stink}"`);
    const board = { hot: 'Too hot to board! Wait for the fire to go out.', hotShip: 'Too hot to board! Freeze her first.', ropes: 'Ropes dropped!', stinkBoard: 'Stink, then board!' };
    check(Object.entries(board).every(([k, v]) => W[k] === v) && W.boardHot(4) === 'HOT! 4 s' && W.boardHot(3.2) === 'HOT! 4 s' && W.boardHot(0.01) === 'HOT! 1 s' && W.boardHot(6) === 'HOT! 6 s',
      `boarding words (§2.4, §4.2): "${W.hot}", "${W.hotShip}", "${W.ropes}", "${W.stinkBoard}", the Board cell "${W.boardHot(3.2)}" (seconds left, rounded up)`);
    const badges = { fire: 'ON FIRE', frost: 'FROZEN', stink: 'STINKY' };
    check(same(W.badge, badges) && W.boardPill === 'Hot!' && S.SPECIAL_IDS.every((id) => W[id] === `${W.badge[id]}!`),
      `the boss status badge's word (§6.3: shape + word) is its pop without the "!": ${Object.values(W.badge).join(', ')}; the touch Board pill on a burning target: "${W.boardPill}"`);
    const t = [
      [W.cell('fire', 4), 'Fire ×4'], [W.cell('stink', 0), 'Stink ×0'], [W.loaded('fire', 4), 'Fire shot loaded, 4 loads left'], [W.loaded('frost', 1), 'Frost shot loaded, 1 load left'],
      [W.buy('fire'), 'Buy Fire shot at the Salty Sparrow'], [W.locked('frost'), 'Frost shot goes on sale after Frostbite Straits'],
      [W.locked('fire'), 'Fire shot goes on sale after the Volcano'], [W.locked('stink'), 'Stink shot goes on sale after the Maelstrom'],
      [W.empty('frost'), 'No Frost shot left this level'], [W.out('fire'), 'Out of Fire shot! Round shot loaded.'], [W.crate('frost'), '+1 FROST SHOT!'],
      [W.crateGold(20), '+20 gold'], [W.count(4), '×4'], [W.count(0), '×0'],
    ];
    const badT = t.filter(([got, want]) => got !== want);
    check(badT.length === 0, `ammo words (§2.5, §6.1, §6.2, §6.3): ${t.map(([, w]) => `"${w}"`).join(', ')}${badT.length ? ' -> ' + badT.map(([g]) => show(g)).join('; ') : ''}`);
    // The Powder room rows say what each recipe does before it is bought, with the numbers of STATUS (no hidden
    // traps: the Fire row says you can't board a burning ship, as the tip and the refusal do).
    const blurbs = {
      fire: "Balls wrapped in burning pitch: she burns for 6 s. You can't board a burning ship.",
      frost: 'Icy balls that freeze her sails: she sails at half speed and turns slowly for 5 s.',
      stink: "Clay pots of rotten fish: she can't move or shoot for 4 s. Then sail round and rake her!",
    };
    const blurbNums = S.SPECIAL_IDS.every((id) => W.blurb[id].includes(`${S.STATUS[id].time} s`)) && S.STATUS.frost.speed === 0.5;
    check(same(W.blurb, blurbs) && same(Object.keys(W.blurb), S.SPECIAL_IDS) && blurbNums && W.blurb.fire.includes("can't board a burning ship"),
      `the Powder room rows (§2.5): ${S.SPECIAL_IDS.map((id) => `"${W.blurb[id]}"`).join(' ')}${same(W.blurb, blurbs) ? '' : ' -> ' + JSON.stringify(W.blurb)}`);
    const live = [
      [W.live.fire('Iron Turtle'), 'The Iron Turtle is on fire'], [W.live.frost('Shark Raider'), 'The Shark Raider is frozen'],
      [W.live.stink('Bomb Ketch'), "The Bomb Ketch stinks! She can't move"], [W.live.fire('The Molten Maw'), 'The Molten Maw is on fire'],
      [W.live.frost("Man-o'-War"), "The Man-o'-War is frozen"],
    ];
    const badL = live.filter(([got, want]) => got !== want);
    check(badL.length === 0 && ['kaboom', 'fireOut', 'pegs'].every((k) => typeof W.live[k]('Fire Ship') === 'string' && W.live[k]('Fire Ship').includes('The Fire Ship')),
      `#game-live (§2.7): ${live.slice(0, 3).map(([, w]) => `"${w}"`).join(', ')}; a type named "The …" keeps one "The"${badL.length ? ' -> ' + badL.map(([g]) => show(g)).join('; ') : ''}`);
    const tips = {
      fire: { keys: "New: Fire shot burns for 6 s! Press <kbd>4</kbd>. You can't board a burning ship.", touch: "New: Fire shot burns for 6 s! Tap Ammo. You can't board a burning ship." },
      frost: { keys: 'New: Frost shot slows ships down! Press <kbd>5</kbd>', touch: 'New: Frost shot slows ships down! Tap Ammo' },
      stink: { keys: "New: Stink shot! They can't move or shoot for 4 s. Press <kbd>6</kbd>", touch: "New: Stink shot! They can't move or shoot for 4 s. Tap Ammo" },
    };
    check(same(W.tips, tips), `the first-level-start tips (§6.5 bits 256 / 512 / 1024), keyboard and touch; the Fire tip says you can't board a burning ship on both (§2.4)${same(W.tips, tips) ? '' : ' -> ' + JSON.stringify(W.tips)}`);
    // Templates never throw, whatever they are given.
    const junk = [undefined, null, NaN, Infinity, -5, 1e300, '', 'round', '__proto__', {}, [], Symbol('x'), 10n, () => 1];
    let threw = '';
    for (const j of junk) {
      try {
        const outs = [W.boardHot(j), W.cell(j, j), W.loaded(j, j), W.buy(j), W.locked(j), W.empty(j), W.out(j), W.crate(j), W.crateGold(j), W.count(j), ...Object.values(W.live).map((f) => f(j))];
        if (!outs.every((s) => typeof s === 'string')) threw = `${show(j)}: not a string`;
      } catch (e) {
        threw = `${show(j)}: ${e.message}`;
      }
    }
    check(!threw && W.locked('round') === '' && W.cell('fire', 2.9) === 'Fire ×2' && W.live.fire(undefined) === 'The ship is on fire', `every WORDS3 template takes junk ids, counts and names without throwing${threw ? ' -> ' + threw : ''}`);
  }

  // ------------------------------------------------------------------ isSpecial, onSale (§2.1)
  {
    const sp = S.ALL_AMMO.map((id) => S.isSpecial(id));
    const junk = [undefined, null, 1, 'Fire', 'fire ', '__proto__', 'constructor', 'toString', {}, ['fire'], Symbol('fire')];
    check(same(sp, [false, false, false, true, true, true]) && junk.every((j) => S.isSpecial(j) === false), 'isSpecial: fire, frost and stink only (not round, chain, grape, "Fire", "__proto__", arrays…)');
    const table = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((u) => `${u}:${S.SPECIAL_IDS.filter((id) => S.onSale(id, u)).join('+') || '-'}`).join(' ');
    check(table === '1:- 2:- 3:- 4:fire 5:fire 6:fire+frost 7:fire+frost+stink 8:fire+frost+stink 9:fire+frost+stink',
      `onSale by unlocked (the Volcano cleared: Fire; Frostbite Straits: Frost; the Maelstrom: Stink): ${table}`);
    const odd = [[NaN, 7], ['7', 'fire'], [null, 'fire'], [Infinity, 'round'], [7, '__proto__'], [7, undefined]];
    check(odd.every(([u, id]) => S.onSale(id, u) === false) && S.onSale('stink', Infinity) === true && S.onSale('fire', 4.5) === true,
      'onSale: junk progress (NaN, "7", null) or junk ids are never on sale');
  }

  // ------------------------------------------------------------------ specialShot (§2.6)
  // Player shots on a Privateer Brig (heading 0.4, length 9.5), as in combat.test.cjs.
  const H = 0.4;
  const DEG = Math.PI / 180;
  const dirs = { beam: 90, stern: 0, bow: 180 };
  const vel = (aspect) => ({ vx: Math.sin(H + dirs[aspect] * DEG) * 30, vz: Math.cos(H + dirs[aspect] * DEG) * 30 });
  const round = (aspect, dist, extra = {}) =>
    C.shotResult({
      ammo: 'round', base: 12, dist, ...vel(aspect), target: { h: H, len: 9.5, ghost: false, boss: false }, along: 0,
      shooter: { player: true, critBase: 0.06 }, rng: () => 0.999999, ...extra,
    });
  {
    const rows = [];
    const bad = [];
    for (const id of S.SPECIAL_IDS) {
      for (const aspect of ['beam', 'stern', 'bow']) {
        for (const force of ['none', 'crit', 'keg', 'routed']) {
          const r = round(aspect, 18, { force });
          const sp = S.specialShot(r, id);
          const want = tidy(r.dmg * S.SPECIAL[id].hull);
          const ok =
            sp.dmg === want && sp.critEffect === null && sp.crewKill === 0 && sp.slow === false && sp.status === id && sp.special === id &&
            sp.crit === r.crit && sp.critMul === r.critMul && same(sp.tags, r.tags) && sp.aspect === r.aspect && sp.zone === r.zone && sp.rangeMul === r.rangeMul;
          if (!ok) bad.push(`${id} ${aspect} ${force}: ${show(sp)}`);
          if (aspect === 'beam' && (force === 'none' || force === 'crit')) rows.push(`${id}${force === 'crit' ? ' crit' : ''} ${sp.dmg}`);
        }
      }
    }
    check(bad.length === 0, `specialShot: dmg × hull (0.7 / 0.6 / 0.2), no crit effect (a crit still ×1.75 with CRIT!), no crew, no slow, her status (12 on the beam: ${rows.join(', ')})${bad.length ? ' -> ' + bad.slice(0, 3).join('; ') : ''}`);
    const crit = S.specialShot(round('stern', 8, { force: 'crit' }), 'fire');
    check(crit.crit && crit.critMul === 1.75 && crit.dmg === 36.75 && crit.critEffect === null && same(crit.tags, ['RAKE ×2', 'CRIT!', 'POINT BLANK']),
      `a crit: ×1.75 and its stickers, but no effect (Fire stern rake at 8 u: 12 × 1.25 × 2 × 1.75 × 0.7 = ${crit.dmg}, tags ${show(crit.tags)})`);
    const ghost = C.shotResult({ ammo: 'round', base: 12, dist: 18, ...vel('beam'), target: { h: H, len: 17, ghost: true, boss: true }, along: 0, shooter: { player: true }, force: 'none' });
    check(S.specialShot(ghost, 'fire').dmg === 4.2 && ghost.ghostMul === 0.5, `a special ball is round shot to the Phantom's ghost crew too (×0.5): fire ${S.specialShot(ghost, 'fire').dmg}`);
    // Never changes its input; the tags are a fresh array.
    const info = round('bow', 12, { force: 'crit' });
    const frozen = Object.freeze({ ...info, tags: Object.freeze(info.tags.slice()) });
    const text = JSON.stringify(frozen);
    let out;
    let threw = '';
    try {
      out = S.specialShot(frozen, 'frost');
    } catch (e) {
      threw = e.message;
    }
    check(!threw && JSON.stringify(frozen) === text && out !== frozen && out.tags !== frozen.tags && same(out.tags, frozen.tags), `specialShot never changes info (a frozen info works; a fresh object and tags array come back)${threw ? ' -> ' + threw : ''}`);
    const plain = S.specialShot(info, 'grape');
    check(same(plain, info) && plain !== info && plain.status === undefined, 'an id that is not special gives an unchanged copy (no status)');
  }

  // ------------------------------------------------------------------ §2.1's worked example, exactly
  // A mid-game ship: 4 guns × 12, beam-on at 20 u, no crit.
  {
    const target = { h: 0, len: 11, ghost: false, boss: false };
    const beamBall = (extra = {}) => C.shotResult({ ammo: 'round', base: 12, dist: 20, vx: 30, vz: 0, target, along: 0, shooter: { player: true, critBase: 0.06 }, force: 'none', ...extra });
    const sternBall = () => beamBall({ vx: 0, vz: 30, along: -5 });
    const broadside = (ball, id, armour) => {
      let dmg = 0;
      let status = null;
      for (let g = 0; g < 4; g++) {
        let info = ball();
        if (id) info = S.specialShot(info, id);
        dmg += info.dmg * C.armourMul(info.aspect, armour, info.crit);
        status = info.status ?? null;
      }
      return { dmg: tidy(dmg), status };
    };
    const burnHp = (id) => {
      const r = S.applyStatus(S.newStatus(), id, { typeKey: 'privateer', boss: false });
      return r.burn ? r.burn.rate * r.burn.time : 0;
    };
    const rnd = broadside(beamBall);
    const frost = broadside(beamBall, 'frost');
    const fire = broadside(beamBall, 'fire');
    const stink = broadside(beamBall, 'stink');
    const rake = broadside(sternBall);
    const fr = S.applyStatus(S.newStatus(), 'frost', {});
    const sk = S.applyStatus(S.newStatus(), 'stink', {});
    check(beamBall().rangeMul === 1 && beamBall().aspect === null && rnd.dmg === 48, `§2.1 worked example: round shot, 4 × 12 on the beam at 20 u = ${rnd.dmg}`);
    check(frost.dmg === 28.8 && frost.status === 'frost' && fr.st.t === 5 && S.statusMuls(fr.st).speed === 0.5,
      `Frost ${frost.dmg} and she crawls for ${fr.st.t} s (speed cap ×${S.statusMuls(fr.st).speed})`);
    const fireTotal = tidy(fire.dmg + burnHp('fire'));
    check(fire.dmg === 33.6 && burnHp('fire') === 18 && fireTotal === 51.6 && S.statusMuls(S.applyStatus(S.newStatus(), 'fire', {}).st).noGrapple === true,
      `Fire ${fire.dmg} now + ${burnHp('fire')} burn over 6 s = ${fireTotal}, but you can't board her while she burns`);
    check(stink.dmg === 9.6 && sk.st.t === 4 && S.statusMuls(sk.st).speed === 0 && rake.dmg === 96 && sternBall().aspect === 'stern',
      `Stink ${stink.dmg} and she sits still for ${sk.st.t} s: time to rake her stern with round shot (${rake.dmg})`);
    const iron = SHIP_TYPES.ironclad.armour;
    const ironRound = broadside(beamBall, null, iron);
    const ironFire = broadside(beamBall, 'fire', iron);
    const ironTotal = tidy(ironFire.dmg + burnHp('fire'));
    check(iron === 0.5 && ironRound.dmg === 24 && ironFire.dmg === 16.8 && ironTotal === 34.8,
      `on an Iron Turtle's beam: round ${ironRound.dmg}, fire ${ironFire.dmg} + ${burnHp('fire')} = ${ironTotal} (the burn ignores her armour)`);
    check(fire.dmg < rnd.dmg && frost.dmg < rnd.dmg && stink.dmg < rnd.dmg && fireTotal > rnd.dmg, 'every special is a trade: less hull now than round shot (fire makes it up only by burning a ship you then can\'t board)');
    // The burn really is 18 hp over 6 s: 1 hp every ⅓ s in 1/120 s steps (main's tick loop, rate from the burn).
    const b = S.applyStatus(S.newStatus(), 'fire', {}).burn;
    let ticks = Math.round(b.rate * b.time);
    let acc = 0;
    let hp = 0;
    let lastAt = 0;
    let step = 0;
    let stat = S.applyStatus(S.newStatus(), 'fire', {}).st;
    let endedAt = null;
    while (ticks > 0 && step < 2000) {
      step++;
      acc += DT;
      while (ticks > 0 && acc >= 1 / b.rate - 1e-9) {
        acc -= 1 / b.rate;
        ticks--;
        hp++;
        lastAt = step;
      }
      const r = S.stepStatus(stat, DT);
      stat = r.st;
      if (r.ended) endedAt = step;
    }
    check(hp === 18 && lastAt === 720 && endedAt === 720, `the fire burns ${hp} hp, the last at step ${lastAt} (6 s), when ON FIRE! ends (step ${endedAt})`);
  }

  // ------------------------------------------------------------------ armourMul (combat.js; §2.6, §4.2)
  // The armour number is the type's own (ironclad.armour 0.5); there is no ARMOUR table in either module.
  {
    const iron = SHIP_TYPES.ironclad.armour;
    const others = Object.keys(SHIP_TYPES).filter((k) => k !== 'ironclad' && C.armourMul(null, SHIP_TYPES[k].armour) !== 1);
    check(typeof C.armourMul === 'function' && iron === 0.5 && C.armourMul(null, iron) === 0.5 && C.armourMul('stern', iron) === 1 && C.armourMul('bow', iron) === 1 &&
      C.armourMul(null, undefined) === 1 && C.armourMul(null, iron, true) === 1 && others.length === 0 && !('ARMOUR' in C) && !('ARMOUR' in S),
    `armourMul: an Iron Turtle's beam ×0.5, a stern or bow rake ×1, a crit ×1, no armour ×1 (every other type); the number comes from the type, no ARMOUR table${others.length ? ' -> ' + others.join(', ') : ''}`);
    // A special ball on her beam is armoured like round shot; on a rake it is not (fire 12 × 0.7 per ball).
    const h = 0;
    const ball = (vx, vz) => S.specialShot(C.shotResult({ ammo: 'round', base: 12, dist: 20, vx, vz, target: { h, len: SHIP_TYPES.ironclad.len, ghost: false, boss: false }, along: 0, shooter: { player: true, critBase: 0.06 }, force: 'none' }), 'fire');
    const beam = ball(30, 0);
    const rake = ball(0, 30);
    const beamDmg = tidy(beam.dmg * C.armourMul(beam.aspect, iron, beam.crit));
    const rakeDmg = tidy(rake.dmg * C.armourMul(rake.aspect, iron, rake.crit));
    check(beamDmg === 4.2 && rake.aspect === 'stern' && rakeDmg === 16.8, `a Fire ball on her beam ${beamDmg} (CLANG!), on her stern ${rakeDmg} (RAKE ×2, full)`);
  }

  // ------------------------------------------------------------------ applyStatus: each status (§2.2)
  const ap = (s, id, opts = {}) => S.applyStatus(s, id, opts);
  {
    const want = [
      ['fire', false, st('fire', 6), { rate: 3, time: 6 }, 'ON FIRE!', 'ignite'],
      ['fire', true, st('fire', 3), { rate: 3, time: 3 }, 'ON FIRE!', 'ignite'],
      ['frost', false, st('frost', 5), null, 'FROZEN!', 'freeze'],
      ['frost', true, st('frost', 2.5), null, 'FROZEN!', 'freeze'],
      ['stink', false, st('stink', 4, 4, 0, 10), null, 'STINKY!', 'stink'],
      ['stink', true, st('stink', 2, 2, 0, 20), null, 'STINKY!', 'stink'],
    ];
    const bad = [];
    for (const [id, boss, wantSt, burn, pop, sfx] of want) {
      const r = ap(S.newStatus(), id, { typeKey: boss ? 'inkheart' : 'privateer', boss });
      if (!same(r.st, wantSt) || !same(r.events, ['applied']) || !same(r.burn, burn) || r.burst !== 0 || r.pop !== pop || r.sfx !== sfx || r.stopBurn || r.why !== null) bad.push(`${id}${boss ? ' boss' : ''}: ${show(r)}`);
    }
    check(bad.length === 0, `a fresh status: ON FIRE! 6 s (boss 3) burning 3 hp/s, FROZEN! 5 s (boss 2.5), STINKY! 4 s (boss 2) leaving 10 s of clothes-pegs (boss 20)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    check(same(S.newStatus(), NONE) && S.newStatus() !== S.newStatus(), 'newStatus: { id: null, t: 0, max: 0, immune: 0 }, a fresh object every call');
  }
  // Hit again (§2.2).
  {
    const f0 = ap(S.newStatus(), 'fire').st;
    const f4 = run(f0, 4);
    const again = ap(f4, 'fire');
    const bossAgain = ap(run(ap(S.newStatus(), 'fire', { boss: true }).st, 2), 'fire', { boss: true });
    check(near(f4.t, 2) && same(again.events, ['extended']) && same(again.st, st('fire', 6)) && same(again.burn, { rate: 3, time: 6 }) && again.pop === 'ON FIRE!' &&
      same(bossAgain.st, st('fire', 3)) && same(bossAgain.burn, { rate: 3, time: 3 }),
    `fire hit again restarts at 6 s (2 s left → ${again.st.t} s, a new burn); a boss's at 3 s`);
    const chain = [];
    let s = S.newStatus();
    for (let i = 0; i < 4; i++) {
      const r = ap(s, 'frost');
      s = r.st;
      chain.push(`${s.t}${r.events.length ? '' : ' (no change)'}`);
    }
    const capHit = ap(st('frost', 8), 'frost');
    const after1 = ap(run(st('frost', 8), 1), 'frost');
    const bossChain = [];
    let b = S.newStatus();
    for (let i = 0; i < 4; i++) {
      b = ap(b, 'frost', { boss: true }).st;
      bossChain.push(b.t);
    }
    check(chain.join(', ') === '5, 7, 8, 8 (no change)' && same(capHit.events, []) && same(capHit.st, st('frost', 8)) && capHit.pop === null &&
      same(after1.events, ['extended']) && near(after1.st.t, 8) && after1.st.max === after1.st.t && same(bossChain, [2.5, 3.5, 4, 4]),
    `frost hit again: +2 s, at most 8 s (${chain.join(', ')}; at 7 s left → 8); a boss +1 s, at most 4 s (${bossChain.join(', ')}); the ring refills (max = t)`);
    const k = ap(st('stink', 3, 4, 0, 10), 'stink');
    const kb = ap(st('stink', 1.5, 2, 0, 20), 'stink', { boss: true });
    check(same(k.events, []) && same(k.st, st('stink', 3, 4, 0, 10)) && k.pop === null && same(kb.st, st('stink', 1.5, 2, 0, 20)), 'stink hit again: no change (3 s left stays 3 s)');
  }
  // Immunities (§2.2): the only two.
  {
    const maw = ap(S.newStatus(), 'fire', { typeKey: 'inferno', boss: true });
    const mawStinky = ap(st('stink', 1, 2, 0, 20), 'fire', { typeKey: 'inferno', boss: true });
    const ghost = ap(S.newStatus(), 'stink', { typeKey: 'phantom', boss: true });
    check(same(maw.events, ['immune']) && maw.pop === 'IMMUNE!' && maw.why === 'The Maw laughs at fire!' && same(maw.st, NONE) && maw.burn === null && maw.burst === 0,
      `the Molten Maw shrugs fire off: IMMUNE! "${maw.why}" (no status, no burn)`);
    check(same(mawStinky.events, ['immune']) && same(mawStinky.st, st('stink', 1, 2, 0, 20)) && mawStinky.burst === 0, 'a stinky Maw hit by fire: still IMMUNE! (no KA-BOOM: fire never touches her)');
    check(same(ghost.events, ['immune']) && ghost.why === "Ghosts can't smell!" && same(ghost.st, NONE), `the Phantom shrugs stink off: IMMUNE! "${ghost.why}"`);
    const pairs = [];
    for (const typeKey of Object.keys(SHIP_TYPES)) {
      for (const id of S.SPECIAL_IDS) {
        const r = ap(S.newStatus(), id, { typeKey, boss: !!SHIP_TYPES[typeKey].boss });
        if (r.events.includes('immune')) pairs.push(`${typeKey}/${id}`);
        if (S.isImmune(typeKey, id) !== r.events.includes('immune')) pairs.push(`isImmune(${typeKey}, ${id}) disagrees`);
      }
    }
    check(same(pairs, ['inferno/fire', 'phantom/stink']), `over every ship type and special, the only immunities are ${pairs.join(', ')} (frost works on both bosses, fire on the Phantom, stink on the Maw)`);
    check(!S.isImmune('__proto__', 'fire') && !S.isImmune('constructor', 'stink') && !S.isImmune(undefined, 'fire') && !S.isImmune('inferno', 'frost'), 'isImmune ignores prototype keys and junk');
  }
  // The two interactions (§2.3) and the other combinations.
  {
    const boom = ap(st('stink', 3, 4, 0, 10), 'fire', { typeKey: 'bombketch' });
    check(same(boom.events, ['kaboom', 'applied']) && boom.burst === 15 && same(boom.st, st('fire', 6, 6, 10)) && same(boom.burn, { rate: 3, time: 6 }) && boom.pop === 'KA-BOOM!' && boom.sfx === 'blast',
      `fire on a stinky ship: KA-BOOM! +${boom.burst} at once, the stink ends (clothes-pegs ${boom.st.immune} s), she burns 6 s (${show(boom.events)})`);
    const boomBoss = ap(st('stink', 1, 2, 0, 20), 'fire', { typeKey: 'inkheart', boss: true });
    check(boomBoss.burst === 15 && same(boomBoss.st, st('fire', 3, 3, 20)) && same(boomBoss.burn, { rate: 3, time: 3 }), `a boss: the same +15, then 3 s of fire and 20 s of clothes-pegs`);
    const out = ap(st('fire', 4, 6), 'frost');
    check(same(out.events, ['fireOut', 'applied']) && out.stopBurn && same(out.st, st('frost', 5)) && out.burn === null && out.pop === 'FIRE OUT! SSSS!' && out.sfx === 'sizzle',
      'frost on a burning ship: FIRE OUT! SSSS! (stop her burn), then frost takes hold for 5 s');
    const kegOut = ap(S.newStatus(), 'frost', { burning: true });
    const kegFrozen = ap(st('frost', 3, 5), 'frost', { burning: true });
    check(same(kegOut.events, ['fireOut', 'applied']) && kegOut.stopBurn && same(kegFrozen.events, ['fireOut', 'extended']) && kegFrozen.stopBurn,
      'frost on a ship burning from a POWDER KEG (opts.burning): the fire goes out too');
    const frostStinky = ap(st('stink', 2, 4, 0, 10), 'frost');
    check(same(frostStinky.events, ['applied']) && same(frostStinky.st, st('frost', 5, 5, 10)) && frostStinky.pop === 'FROZEN!', 'frost on a stinky ship: FROZEN!, and the stink immunity starts (10 s)');
    const others = [
      ['fire on frozen', ap(st('frost', 3, 5), 'fire'), ['applied'], st('fire', 6), false, 'ON FIRE!'],
      ['stink on frozen', ap(st('frost', 3, 5), 'stink'), ['applied'], st('stink', 4, 4, 0, 10), false, 'STINKY!'],
      ['stink on burning', ap(st('fire', 3, 6), 'stink'), ['applied'], st('stink', 4, 4, 0, 10), true, 'STINKY!'],
      ['fire after the stink immunity started', ap(st(null, 0, 0, 7), 'fire'), ['applied'], st('fire', 6, 6, 7), false, 'ON FIRE!'],
    ];
    const bad = others.filter(([, r, ev, s, stop, pop]) => !same(r.events, ev) || !same(r.st, s) || r.stopBurn !== stop || r.pop !== pop || r.burst !== 0);
    check(bad.length === 0, `every other combination replaces the old status (${others.map((o) => o[0]).join('; ')}; a stink that replaces a fire stops her burn)${bad.length ? ' -> ' + bad.map((b) => `${b[0]}: ${show(b[1])}`).join('; ') : ''}`);
  }
  // The clothes-peg window.
  {
    const pegs = ap(st(null, 0, 0, 6), 'stink');
    check(same(pegs.events, ['pegs']) && pegs.pop === 'Clothes-pegs!' && same(pegs.st, st(null, 0, 0, 6)), 'a stink inside the clothes-peg window does nothing: Clothes-pegs!');
    // The window runs on through other statuses, then a stink takes again.
    let s = ap(S.newStatus(), 'stink').st;
    s = run(s, 4);
    const startWin = s.immune;
    s = ap(s, 'frost').st;
    const midWin = run(s, 5);
    const stillPegs = ap(run(midWin, 4.9), 'stink');
    const free = ap(run(midWin, 5), 'stink');
    check(near(startWin, 10) && near(midWin.immune, 5) && midWin.id === null && same(stillPegs.events, ['pegs']) && same(free.events, ['applied']),
      `the 10 s window starts when the stink ends and runs on while she is frozen (5 s later: ${midWin.immune.toFixed(3)} s left); a stink 9.9 s after: Clothes-pegs!, at 10 s: STINKY!`);
    // Bosses never become stink-immune for less than 20 s, however the stink ends (time, frost, KA-BOOM).
    const opts = { typeKey: 'inkheart', boss: true };
    const byTime = run(ap(S.newStatus(), 'stink', opts).st, 2).immune;
    const byFrost = ap(ap(S.newStatus(), 'stink', opts).st, 'frost', opts).st.immune;
    const byFire = ap(ap(S.newStatus(), 'stink', opts).st, 'fire', opts).st.immune;
    const plain = run(ap(S.newStatus(), 'stink').st, 4).immune;
    check(near(byTime, 20) && byFrost === 20 && byFire === 20 && near(plain, 10), `a boss's stink always leaves 20 s of clothes-pegs (time ${byTime.toFixed(3)}, frost ${byFrost}, KA-BOOM ${byFire}); anyone else's 10 s`);
    const handMade = run(st('stink', 1, 4, 0), 1); // a record from the test API without pegs: the plain window
    check(near(handMade.immune, 10) && handMade.id === null, 'a stinky record without pegs (e.g. from G.specials) leaves the plain 10 s window');
  }
  // applyStatus never changes its input; unknown ids do nothing.
  {
    const frozen = Object.freeze(st('stink', 3, 4, 0, 10));
    let threw = '';
    let r;
    try {
      r = [ap(frozen, 'fire'), ap(frozen, 'frost'), ap(frozen, 'stink'), ap(Object.freeze(st('fire', 2, 6)), 'frost')];
    } catch (e) {
      threw = e.message;
    }
    check(!threw && same(frozen, st('stink', 3, 4, 0, 10)) && r.every((x) => x.st !== frozen), `applyStatus never changes the record it is given (frozen records work; fresh ones come back)${threw ? ' -> ' + threw : ''}`);
    const unknown = ['round', 'chain', 'grape', '__proto__', undefined, 7].map((id) => ap(st('frost', 3, 5), id));
    check(unknown.every((u) => same(u.events, []) && same(u.st, st('frost', 3, 5)) && u.pop === null && u.burn === null), 'applyStatus with round, chain, grape or junk ids: nothing happens');
  }

  // ------------------------------------------------------------------ once per volley per target (§2.2), the caller's rule
  {
    // main applies info.status for the first ball of a volley that hits each target (volleyTarget(v, ship).status):
    // this helper is that rule, so the checks show why it matters.
    const volleyApply = (ships, hits, id) => {
      const seen = new Set();
      for (const [volley, ship] of hits) {
        const key = `${volley}:${ship}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ships[ship] = ap(ships[ship], id).st;
      }
      return ships;
    };
    const five = [1, 1, 1, 1, 1].map((v) => [v, 'a']);
    const once = volleyApply({ a: S.newStatus() }, five, 'frost').a;
    let naive = S.newStatus();
    for (let i = 0; i < 5; i++) naive = ap(naive, 'frost').st;
    const two = volleyApply({ a: S.newStatus(), b: S.newStatus() }, [[1, 'a'], [1, 'b'], [1, 'a'], [1, 'b'], [1, 'a']], 'frost');
    const nextVolley = volleyApply({ a: S.newStatus() }, [[1, 'a'], [1, 'a'], [2, 'a'], [2, 'a']], 'frost').a;
    check(once.t === 5 && naive.t === 8 && two.a.t === 5 && two.b.t === 5 && nextVolley.t === 7,
      `five Frost balls of one volley freeze her once (${once.t} s; applied per ball they would stack to ${naive.t} s); two targets of one volley each once; the next volley extends (${nextVolley.t} s)`);
  }

  // ------------------------------------------------------------------ stepStatus timings in simulated steps
  {
    const rows = [];
    const bad = [];
    for (const [id, boss, wantSteps, wantPegs] of [['fire', false, 720, 0], ['fire', true, 360, 0], ['frost', false, 600, 0], ['frost', true, 300, 0], ['stink', false, 480, 1200], ['stink', true, 240, 2400]]) {
      let s = ap(S.newStatus(), id, { boss }).st;
      let steps = 0;
      let ended = null;
      let endedCount = 0;
      let prevT = s.t;
      let rising = false;
      while (steps < 5000) {
        const r = S.stepStatus(s, DT);
        steps++;
        if (r.st.t > prevT + 1e-12) rising = true;
        prevT = r.st.t;
        s = r.st;
        if (r.ended) {
          ended = r.ended;
          endedCount++;
          break;
        }
      }
      // then the clothes-peg window (stink only)
      let pegSteps = 0;
      while (s.immune > 0 && pegSteps < 10000) {
        const r = S.stepStatus(s, DT);
        if (r.ended) endedCount++;
        s = r.st;
        pegSteps++;
      }
      rows.push(`${id}${boss ? ' boss' : ''} ${steps}${pegSteps ? ` + pegs ${pegSteps}` : ''}`);
      if (steps !== wantSteps || ended !== id || endedCount !== 1 || rising || pegSteps !== wantPegs || !same(s, NONE)) bad.push(`${id}${boss ? ' boss' : ''}: ${steps} steps, ended ${ended}, pegs ${pegSteps}`);
    }
    check(bad.length === 0, `stepStatus in 1/120 s steps: each ends exactly on time, once, and the clothes-pegs after a stink run their 10 s / 20 s (${rows.join(', ')})${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    const just = run(ap(S.newStatus(), 'stink').st, 4 - DT);
    check(just.id === 'stink' && near(just.t, DT) && just.immune === 0, 'one step before the end she is still stinky (no clothes-pegs yet)');
    const big = S.stepStatus(ap(S.newStatus(), 'stink').st, 5);
    const bigFire = S.stepStatus(st('fire', 2, 6, 3), 10);
    check(big.ended === 'stink' && near(big.st.immune, 9) && bigFire.ended === 'fire' && same(bigFire.st, NONE),
      `a long step: a 4 s stink stepped 5 s ends with 9 s of clothes-pegs left (${big.st.immune}); a fire stepped 10 s ends, and its 3 s window too`);
    const idle = S.stepStatus(S.newStatus(), 1);
    const junkDt = [NaN, -1, Infinity, '1', null, undefined, {}].map((d) => S.stepStatus(st('frost', 3, 5, 2), d).st);
    check(same(idle, { st: NONE, ended: null }) && junkDt.every((s) => same(s, st('frost', 3, 5, 2))), 'stepStatus: no status stays none; junk dt (NaN, negative, Infinity, strings) passes no time');
    const frostLeft = run(ap(run(ap(S.newStatus(), 'frost').st, 3), 'frost').st, 3.9);
    const frostDone = S.stepStatus(frostLeft, 0.1 + 1e-6);
    check(frostLeft.id === 'frost' && frostDone.ended === 'frost', 'frost hit again 3 s in (2 s + 2 s = 4 s left) wears off exactly 4 s later');
  }

  // ------------------------------------------------------------------ statusMuls (§2.2)
  {
    const m = (s) => S.statusMuls(s);
    const none = m(S.newStatus());
    const fire = m(st('fire', 3, 6));
    const frost = m(st('frost', 3, 5));
    const stink = m(st('stink', 3, 4, 0, 10));
    const IDENT = { speed: 1, turn: 1, noFire: false, noBoard: false, noRam: false, noMortar: false, grit: 1, noGrapple: false, noRegen: false, decel: 1 };
    check(same(none, IDENT) && same(m(st(null, 0, 0, 8)), IDENT) && same(m(st('frost', 0, 5)), IDENT), 'statusMuls: no status (or one that ran out, or the clothes-peg window) changes nothing');
    check(same(fire, { ...IDENT, noGrapple: true, noRegen: true }), "ON FIRE!: can't be grappled, no hull regen; she sails and fights as before");
    check(same(frost, { ...IDENT, speed: 0.5, turn: 0.6 }), 'FROZEN!: speed cap ×0.5, turning ×0.6');
    check(same(stink, { speed: 0, turn: 0, noFire: true, noBoard: true, noRam: true, noMortar: true, grit: 0.75, noGrapple: false, noRegen: false, decel: 2 }),
      "STINKY!: speed cap 0 (she coasts to a stop at 2× her accel), turning 0, no firing, boarding, ram or mortar, her crew's grit ×0.75");
    // The smallest active multiplier wins (main's speedMul / turnMul with SPEC2's chain, mast and rudder).
    const speed = (effects, s) => Math.min(...effects.map((e) => C.EFFECTS[e].speed), m(s).speed);
    const turn = (effects, s) => Math.min(...effects.map((e) => (e === 'chain' ? C.EFFECTS.chain.turn : C.EFFECTS[e].turn)), m(s).turn);
    check(speed(['chain'], st('frost', 3)) === 0.5 && speed(['mast'], st('frost', 3)) === 0.5 && turn(['chain'], st('frost', 3)) === 0.6 && turn(['rudder'], st('frost', 3)) === 0.25 && speed(['chain'], st('stink', 3)) === 0,
      'with chain shot (0.55 / 0.7), a mast down (0.5) or a smashed rudder (0.25) the smallest multiplier wins: frost 0.5 / 0.6, rudder 0.25, stink 0');
    check(Object.isFrozen(none) && Object.isFrozen(stink) && m(st('stink', 1)) === stink, 'statusMuls returns shared frozen answers (read-only)');
    // main reads statusMuls several times a ship every step, so it skips readStatus: it must still give the same
    // answer as the cleaned record (stepStatus(s, 0) cleans without passing time) for every odd record.
    const odd = [
      undefined, null, 7, 'fire', S.newStatus(), st('fire', 1e-12), st('fire', 2e-9), st('frost', -1), st('stink', NaN), st('stink', Infinity), st('fire', '3'),
      st('Fire', 3), st('__proto__', 3), { id: 'frost', t: 3 }, { t: 3 }, { id: 'stink', t: 3, pegs: 20 }, st('frost', 1e300), st(null, 5, 5, 3),
      new Proxy({}, { get() { throw new Error('proxy'); } }), Object.create({ id: 'fire', t: 3 }),
    ];
    const badOdd = odd.filter((s) => m(s) !== m(S.stepStatus(s, 0).st));
    check(badOdd.length === 0, `statusMuls on ${odd.length} odd records (tiny, negative, NaN, Infinity, string t; unknown ids; inherited fields; a throwing proxy) matches the cleaned record${badOdd.length ? ' -> ' + badOdd.map(show).join('; ') : ''}`);
    // Stink, then board! The stinky crew's grit ×0.75 gives the better odds the preview shows.
    const me = { crew: 12, crew0: 12, blade: 1, hpFrac: 1 };
    const privateer = { crew: 12, crew0: 12, grit: SHIP_TYPES.privateer.grit, hpFrac: 0.5 };
    const before = C.boardingOdds(me, privateer, {});
    const after = C.boardingOdds(me, { ...privateer, grit: privateer.grit * stink.grit }, {});
    check(near(after.R, before.R / 0.75) && C.previewLabel(C.resolveBoarding(me, privateer, {})) !== C.previewLabel(C.resolveBoarding(me, { ...privateer, grit: privateer.grit * stink.grit }, {})) === true,
      `stink, then board: a half-sunk privateer's odds go from R ${before.R.toFixed(3)} (${C.previewLabel(C.resolveBoarding(me, privateer, {}))}) to R ${after.R.toFixed(3)} (${C.previewLabel(C.resolveBoarding(me, { ...privateer, grit: privateer.grit * stink.grit }, {}))})`);
  }

  // ------------------------------------------------------------------ the shared burn (mergeBurn, §2.2)
  {
    const fire = { rate: S.STATUS.fire.dps, time: S.STATUS.fire.time };
    const keg = { rate: C.EFFECTS.keg.dps, time: C.EFFECTS.keg.time };
    const cases = [
      ['fire on a ship not burning', S.mergeBurn(null, fire), { rate: 3, hp: 18, time: 6, took: true }],
      ['a keg on a fresh fire (18 left)', S.mergeBurn({ rate: 3, hp: 18 }, keg), { rate: 3, hp: 18, time: 6, took: false }],
      ['a keg on a fire with 6 left', S.mergeBurn({ rate: 3, hp: 6 }, keg), { rate: 2, hp: 8, time: 4, took: true }],
      ['a keg on a fire with 9 left', S.mergeBurn({ rate: 3, hp: 9 }, keg), { rate: 3, hp: 9, time: 3, took: false }],
      ['fire on a keg (8 left)', S.mergeBurn({ rate: 2, hp: 8 }, fire), { rate: 3, hp: 18, time: 6, took: true }],
      ['a tie (8 vs 8): the new one', S.mergeBurn({ rate: 3, hp: 8 }, keg), { rate: 2, hp: 8, time: 4, took: true }],
      ['fire on a fire with 2 left (restart)', S.mergeBurn({ rate: 3, hp: 2 }, fire), { rate: 3, hp: 18, time: 6, took: true }],
      ['a boss: fire 3 s', S.mergeBurn({ rate: 0, hp: 0 }, { rate: 3, time: 3 }), { rate: 3, hp: 9, time: 3, took: true }],
      ['a boss keg (2 s) on a boss fire with 9', S.mergeBurn({ rate: 3, hp: 9 }, { rate: 2, time: 2 }), { rate: 3, hp: 9, time: 3, took: false }],
    ];
    const bad = cases.filter(([, got, want]) => !same(got, want));
    check(bad.length === 0, `one burn per ship: the one with more hp left to burn wins (${cases.map(([n, g]) => `${n}: ${g.hp} hp at ${g.rate}/s`).join('; ')})${bad.length ? ' -> ' + bad.map(([n, g]) => `${n}: ${show(g)}`).join('; ') : ''}`);
    const junk = [undefined, null, NaN, -3, 'x', {}, Symbol('x'), { rate: NaN, hp: -5, time: Infinity }, { rate: 1e300, time: 1e300, hp: 1e300 }];
    let bad2 = '';
    for (const a of junk) {
      for (const b of junk) {
        try {
          const r = S.mergeBurn(a, b);
          if (![r.rate, r.hp, r.time].every((v) => Number.isFinite(v) && v >= 0) || !isInt(r.hp) || typeof r.took !== 'boolean') bad2 = `${show(a)} + ${show(b)}: ${show(r)}`;
        } catch (e) {
          bad2 = `${show(a)} + ${show(b)}: threw ${e.message}`;
        }
      }
    }
    check(!bad2, `mergeBurn takes junk: finite, whole-hp results, never a throw${bad2 ? ' -> ' + bad2 : ''}`);
  }

  // ------------------------------------------------------------------ douse (§2.3: water puts fire out)
  {
    const burning = S.douse(st('fire', 4, 6, 3));
    const frozen = S.douse(st('frost', 4, 5));
    const stinky = S.douse(st('stink', 2, 4, 0, 10));
    const keg = S.douse(S.newStatus(), { burning: true });
    const none = S.douse(S.newStatus());
    const frozenFrame = Object.freeze(st('fire', 1, 6));
    S.douse(frozenFrame);
    check(burning.doused && same(burning.st, st(null, 0, 0, 3)) && !frozen.doused && same(frozen.st, st('frost', 4, 5)) && !stinky.doused && same(stinky.st, st('stink', 2, 4, 0, 10)) &&
      keg.doused && same(keg.st, NONE) && !none.doused && same(frozenFrame, st('fire', 1, 6)),
    'douse: a burning ship\'s fire goes out (FIRE OUT!, her clothes-pegs kept); frost and stink stay; a POWDER KEG burn (opts.burning) is doused too; nothing else; its input is never changed');
  }

  // ------------------------------------------------------------------ loads (§2.5)
  const ALL = { v: 1, own: { fire: 1, frost: 1, stink: 1 } };
  {
    const none = S.startLoads(S.defaultPowder(), 3);
    const tiers = [0, 1, 2, 3].map((t) => S.startLoads(ALL, t));
    const sums = tiers.map((l) => l.fire + l.frost + l.stink);
    check(same(none, { fire: 0, frost: 0, stink: 0 }) && same(tiers.map((l) => l.fire), [4, 5, 6, 7]) && tiers.every((l) => l.fire === l.frost && l.frost === l.stink) && same(sums, [12, 15, 18, 21]),
      `startLoads: 4 (+1 / +2 / +3 with the Powder Windmill) of each recipe owned, none of the others; all three: ${sums.join(' / ')} broadsides a level`);
    const crates = sums.map((s) => s + 2 * S.LOADS.crate);
    check(crates[0] === 14 && crates[3] === 23, `with a Voyage III level's 2 crates: ${crates[0]}–${crates[3]} (§2.5)`);
    // The Windmill's +1 / +2 / +3 is written twice (LOADS.windmill here, the plot's perk in island.js, §8.1):
    // they must agree, so main can pass either the Windmill's tier or its perk. island.js is another Stage 1
    // agent's file, so it is read the way main will read it: perks() of an island with the Windmill at tiers 0..3
    // (once perks() reads the tiers), else the PLOTS row's perk table (tiers 1..3, or 0..3). Skipped with neither.
    let mill = null;
    let via = '';
    let I = null;
    try {
      I = await load('src/island.js');
    } catch {
      I = null;
    }
    try {
      if (I && typeof I.perks === 'function' && typeof I.defaultIsland === 'function') {
        const byTier = [0, 1, 2, 3].map((t) => {
          const s = I.defaultIsland();
          s.t.windmill = t;
          return I.perks(s).extraLoads;
        });
        if (byTier.every((v) => typeof v === 'number') && byTier.some((v) => v > 0)) {
          mill = byTier;
          via = 'perks()';
        }
      }
    } catch {
      mill = null;
    }
    try {
      const row = !mill && I && Array.isArray(I.PLOTS) ? I.PLOTS.find((p) => p && p.id === 'windmill') : null;
      const e = row && row.perk && Array.isArray(row.perk.extraLoads) ? row.perk.extraLoads : null;
      if (e && (e.length === 3 || e.length === 4)) {
        mill = e.length === 3 ? [0, ...e] : e.slice();
        via = 'PLOTS';
      }
    } catch {
      mill = mill || null;
    }
    if (mill) check(same(mill, S.LOADS.windmill), `the Powder Windmill's perk in island.js (${via}: tiers 0–3 give +${mill.join(' / +')}) matches LOADS.windmill (${S.LOADS.windmill.join(', ')})`);
    else console.log("SKIP  island.js has no Windmill perk to compare with LOADS.windmill");
    const some = S.startLoads('{"v":1,"own":{"fire":0,"frost":1,"stink":0}}', 1);
    const odd = [[-1, 4], [9, 7], [1.7, 5], [NaN, 4], ['2', 4], [null, 4], [Infinity, 4]].filter(([t, want]) => S.startLoads(ALL, t).fire !== want);
    check(same(some, { fire: 0, frost: 5, stink: 0 }) && odd.length === 0, `startLoads reads the stored text too; a Windmill tier out of range is clamped, junk counts as 0${odd.length ? ' -> ' + odd.map(([t]) => show(t)).join(', ') : ''}`);

    // Spend per side; fall back to round shot when empty.
    let loads = S.startLoads(ALL, 0);
    const spent = [];
    for (let i = 0; i < 5; i++) {
      const r = S.spendLoad(loads, 'fire');
      spent.push(r.ok ? 1 : 0);
      loads = r.loads;
    }
    check(same(spent, [1, 1, 1, 1, 0]) && loads.fire === 0 && loads.frost === 4, 'spendLoad: one load a broadside of one side; the fifth Fire broadside finds none (ok false: that side fires round shot), the other specials untouched');
    // Space with one load left: one side fires the special, the other round shot (WORDS3.out).
    let l1 = { fire: 0, frost: 1, stink: 0 };
    const sides = [];
    for (const side of ['port', 'starboard']) {
      const r = S.spendLoad(l1, 'frost');
      sides.push(r.ok ? `${side} frost` : `${side} round ("${S.WORDS3.out('frost')}")`);
      l1 = r.loads;
    }
    check(sides[0] === 'port frost' && sides[1].startsWith('starboard round') && l1.frost === 0, `Space with one Frost load left: ${sides.join(', ')}`);
    const frozenLoads = Object.freeze({ fire: 2, frost: 0, stink: 1 });
    const r = S.spendLoad(frozenLoads, 'fire');
    check(r.ok && r.loads.fire === 1 && frozenLoads.fire === 2 && r.loads !== frozenLoads && ['round', 'chain', 'grape', 'x'].every((id) => S.spendLoad(frozenLoads, id).ok === false),
      'spendLoad never changes its input; round, chain, grape and junk spend nothing (ok false)');

    // Crates: +1 of the owned special with the fewest loads; 20 gold with none owned.
    const c1 = S.crateLoad({ fire: 2, frost: 1, stink: 3 }, ALL);
    const c2 = S.crateLoad({ fire: 2, frost: 2, stink: 2 }, ALL);
    const c3 = S.crateLoad({ fire: 0, frost: 3, stink: 0 }, { own: { fire: 0, frost: 1, stink: 0 } });
    const c4 = S.crateLoad({ fire: 5, frost: 0, stink: 1 }, { own: { fire: 1, frost: 0, stink: 1 } });
    const c5 = S.crateLoad({ fire: 0, frost: 0, stink: 0 }, S.defaultPowder());
    check(c1.id === 'frost' && same(c1.loads, { fire: 2, frost: 2, stink: 3 }) && c1.gold === 0 && S.WORDS3.crate(c1.id) === '+1 FROST SHOT!' &&
      c2.id === 'fire' && c3.id === 'frost' && c3.loads.frost === 4 && c4.id === 'stink' && c4.loads.stink === 2 &&
      c5.id === null && c5.gold === 20 && same(c5.loads, { fire: 0, frost: 0, stink: 0 }),
    'crateLoad: +1 load of the owned special with the fewest ("+1 FROST SHOT!"; a tie: Fire first; recipes not owned are skipped); none owned: +20 gold');

    // ammoReady: keys 4–6, R and the tray say why not.
    const R = (id, powder, loads, unlocked) => S.ammoReady(id, { powder, loads, unlocked });
    const cases = [
      [R('fire', S.defaultPowder(), {}, 3), false, 'locked', 'Fire shot goes on sale after the Volcano'],
      [R('frost', S.defaultPowder(), {}, 5), false, 'locked', 'Frost shot goes on sale after Frostbite Straits'],
      [R('fire', S.defaultPowder(), {}, 4), false, 'notOwned', 'Buy Fire shot at the Salty Sparrow'],
      [R('frost', ALL, { frost: 0 }, 9), false, 'empty', 'No Frost shot left this level'],
      [R('stink', ALL, { stink: 3 }, 9), true, null, 'Stink shot loaded, 3 loads left'],
      [R('round', ALL, { fire: 3 }, 9), false, 'unknown', ''],
    ];
    const badR = cases.filter(([res, ok, reason, word]) => res.ok !== ok || res.reason !== reason || res.word !== word);
    check(badR.length === 0, `ammoReady: ${cases.map(([r]) => r.reason || 'ok').join(', ')} with the hint for each (${cases.slice(0, 4).map(([r]) => `"${r.word}"`).join(', ')})${badR.length ? ' -> ' + badR.map(([r]) => show(r)).join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ recipes (§2.5): buyRecipe
  {
    const none = S.defaultPowder();
    const cases = [
      ['round', S.buyRecipe(none, 9999, 'round', 9), 'unknown'],
      ['__proto__', S.buyRecipe(none, 9999, '__proto__', 9), 'unknown'],
      ['fire at unlocked 3', S.buyRecipe(none, 9999, 'fire', 3), 'locked'],
      ['frost at 5', S.buyRecipe(none, 9999, 'frost', 5), 'locked'],
      ['stink at 6', S.buyRecipe(none, 9999, 'stink', 6), 'locked'],
      ['fire with 299 gold', S.buyRecipe(none, 299, 'fire', 4), 'poor'],
      ['stink with 499', S.buyRecipe(none, 499, 'stink', 7), 'poor'],
      ['fire with "1000" (a string)', S.buyRecipe(none, '1000', 'fire', 4), 'poor'],
      ['fire with NaN gold', S.buyRecipe(none, NaN, 'fire', 4), 'poor'],
      ['fire owned', S.buyRecipe({ own: { fire: 1 } }, 9999, 'fire', 9), 'owned', { own: { fire: 1 } }],
      // owned wins over locked: a record (another tab, an older save) can own a recipe before its sale level
      ['stink owned at unlocked 3', S.buyRecipe({ own: { stink: 1 } }, 9999, 'stink', 3), 'owned', { own: { stink: 1 } }],
    ];
    const bad = cases.filter(([, r, reason, rec]) => r.ok !== false || r.reason !== reason || r.cost !== 0 || !same(r.powder, S.parsePowder(rec || none)));
    check(bad.length === 0, `buyRecipe refuses with a reason and costs nothing: ${cases.map(([n, r]) => `${n} → ${r.reason}`).join('; ')}${bad.length ? ' -> ' + bad.map(([n, r]) => `${n}: ${show(r)}`).join('; ') : ''}`);
    const input = Object.freeze({ v: 1, own: Object.freeze({ fire: 0, frost: 0, stink: 0 }) });
    const fire = S.buyRecipe(input, 300, 'fire', 4);
    check(fire.ok && fire.cost === 300 && fire.reason === null && same(fire.powder, { v: 1, own: { fire: 1, frost: 0, stink: 0 } }) && same(input.own, { fire: 0, frost: 0, stink: 0 }) && fire.powder !== input,
      'buying Fire shot with exactly 300 gold: ok, cost 300, a fresh record that owns it (the one given is never changed)');
    let p = S.defaultPowder();
    let gold = 1100;
    for (const id of S.SPECIAL_IDS) {
      const r = S.buyRecipe(p, gold, id, 7);
      if (r.ok) {
        p = r.powder;
        gold -= r.cost;
      }
    }
    check(gold === 0 && same(p.own, { fire: 1, frost: 1, stink: 1 }) && S.buyRecipe(p, 1e6, 'stink', 9).reason === 'owned', 'all three recipes cost 1,100 gold exactly; then each is owned (bought once)');
  }

  // ------------------------------------------------------------------ the powder record (§10.1): parsePowder
  {
    const DEFAULT = { v: 1, own: { fire: 0, frost: 0, stink: 0 } };
    const TEXT0 = '{"v":1,"own":{"fire":0,"frost":0,"stink":0}}';
    const parse = (raw) => {
      try {
        const p = S.parsePowder(raw);
        const okShape = p && Object.keys(p).join() === 'v,own' && p.v === 1 && Object.keys(p.own).join() === 'fire,frost,stink' && Object.values(p.own).every((v) => v === 0 || v === 1);
        return okShape ? { p } : { error: `invalid result ${show(p)}` };
      } catch (e) {
        return { error: `threw ${e && e.message}` };
      }
    };
    const d1 = S.defaultPowder();
    d1.own.fire = 1;
    check(same(S.defaultPowder(), DEFAULT) && S.serializePowder(S.defaultPowder()) === TEXT0, `defaultPowder: ${TEXT0}, a fresh object every call`);

    const hostile = {};
    Object.defineProperty(hostile, 'own', { enumerable: true, get() { throw new Error('getter'); } });
    const hostileOwn = { own: {} };
    Object.defineProperty(hostileOwn.own, 'fire', { enumerable: true, get() { throw new Error('getter'); } });
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();
    const junk = [
      null, undefined, '', ' ', 'garbage', 'garbage{', '{', '}', '{}', '[]', '[1,2,3]', 'null', 'true', 'false', '42', '"str"',
      'NaN', 'Infinity', '-Infinity', '1e400', '{"own":null}', '{"own":[]}', '{"own":[1,1,1]}', '{"own":"fire"}', '[{"own":{"fire":1}}]',
      '{"OWN":{"fire":1}}', '{"v":1,"own":{"Fire":1,"FROST":1}}', 42, -1, NaN, Infinity, true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n,
      new Date(0), /x/, new Map([['own', { fire: 1 }]]), hostile, proxy, revoked,
      '\u0000', '\ud800', '{"own":{"fire":1}', '{"v":1,"own":{"fire":1,"frost":1,"stink":1}', // a broken surrogate, JSON cut short
    ];
    const bad = [];
    for (const raw of junk) {
      const r = parse(raw);
      if (r.error) bad.push(`${show(raw)}: ${r.error}`);
      else if (!same(r.p, DEFAULT)) bad.push(`${show(raw)}: ${show(r.p)}`);
    }
    check(bad.length === 0, `parsePowder: ${junk.length} kinds of junk (cut JSON, arrays, wrong types, throwing getters, proxies, a revoked proxy, a Map…) all give the default${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    check(same(parse(hostileOwn).p, DEFAULT), 'a throwing getter on a flag counts as 0');

    // Each flag: a plain integer 0 or 1 (number or digit string); anything else is 0.
    let sourceText = false;
    JSON.parse('1', (k, v, ctx) => {
      sourceText = !!(ctx && typeof ctx.source === 'string');
      return v;
    });
    const flagOf = (lit, id = 'frost') => {
      const r = parse(`{"v":1,"own":{"fire":1,"${id}":${lit}}}`);
      return r.error ? r.error : r.p.own.fire !== 1 ? 'lost the fire flag' : r.p.own[id];
    };
    const cases = [
      ['1', 1], ['0', 0], ['-0', 0], ['2', 0], ['-1', 0], ['99999', 0], ['"1"', 1], ['" 1 "', 1], ['"0"', 0], ['"01"', 1], ['"2"', 0],
      ['"1e0"', 0], ['"1.0"', 0], ['"0x1"', 0], ['"Infinity"', 0], ['"NaN"', 0], ['""', 0], ['" "', 0], ['"1 1"', 0], ['"+1"', 0], ['"true"', 0],
      ['1.5', 0], ['0.5', 0], ['2.5', 0], ['-0.5', 0], ['1e400', 0], ['-1e400', 0], ['123456789012345678901', 0], ['"123456789012345678901"', 0],
      ['null', 0], ['true', 0], ['false', 0], ['[1]', 0], ['{"v":1}', 0], ['{"__proto__":1}', 0],
      ...(sourceText ? [['1e0', 0], ['1.0', 0], ['1E0', 0], ['10e-1', 0], ['2.0', 0]] : []),
    ];
    const badF = cases.filter(([lit, want]) => flagOf(lit) !== want).map(([lit, want]) => `${lit} -> ${flagOf(lit)} (want ${want})`);
    check(badF.length === 0, `parsePowder: each flag is a plain integer 0 or 1, else 0 (${cases.length} cases${sourceText ? ', incl. number literals like 1e0 and 1.0' : ''})${badF.length ? ' -> ' + badF.join('; ') : ''}`);
    if (!sourceText) console.log('SKIP  this Node cannot see JSON number literals (1e0, 1.0), only their values; those cases were not run');
    const objectCases = [
      [1, 1], [0, 0], [-0, 0], [2, 0], [-1, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [1.5, 0], [1 + Number.EPSILON, 0], [Number.MAX_SAFE_INTEGER + 2, 0],
      ['1', 1], [' 1 ', 1], ['1e0', 0], [null, 0], [true, 0], [[1], 0], [{ valueOf: () => 1 }, 0], [new Number(1), 0], [1n, 0], [Symbol('1'), 0],
    ];
    const badO = [];
    for (const [v, want] of objectCases) {
      const r = parse({ own: { fire: v, stink: 1 } });
      const got = r.error || r.p.own.fire;
      if (got !== want || (!r.error && r.p.own.stink !== 1)) badO.push(`${show(v)} -> ${got}`);
    }
    check(badO.length === 0, `parsePowder on a record object: the same flag rules (NaN, ±Infinity, 1.5, 2, true, boxed numbers, bigints…)${badO.length ? ' -> ' + badO.join('; ') : ''}`);
    const fbf = parse('{"v":1,"own":{"fire":"1","frost":2.5,"stink":1}}');
    check(!fbf.error && same(fbf.p.own, { fire: 1, frost: 0, stink: 1 }), `parsePowder falls back flag by flag (${show(fbf.p || fbf.error)})`);

    // Unknown fields, prototype tricks, inherited fields, other versions.
    const extra = parse('{"v":1,"own":{"fire":1,"cannons":1,"toString":1},"gold":999999,"loads":{"fire":99}}');
    check(!extra.error && same(extra.p, { v: 1, own: { fire: 1, frost: 0, stink: 0 } }), `unknown fields are dropped (${show(extra.p || extra.error)})`);
    const proto = parse('{"__proto__":{"own":{"fire":1}},"own":{"__proto__":{"frost":1},"constructor":{"prototype":{"polluted":1}}}}');
    const polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined || ({}).frost !== undefined;
    check(!proto.error && same(proto.p, DEFAULT) && !polluted, `__proto__ / constructor tricks give the default and pollute nothing (${show(proto.p || proto.error)})`);
    const inherited = parse(Object.create({ own: { fire: 1 } }));
    const inheritedFlag = parse({ own: Object.create({ fire: 1 }) });
    check(!inherited.error && same(inherited.p, DEFAULT) && same(inheritedFlag.p, DEFAULT), 'inherited (non-own) fields and flags are ignored');
    const v2 = parse('{"v":2,"own":{"stink":1}}');
    const noV = parse('{"own":{"frost":1}}');
    check(same(v2.p.own, { fire: 0, frost: 0, stink: 1 }) && same(noV.p.own, { fire: 0, frost: 1, stink: 0 }) && S.serializePowder(noV.p) === '{"v":1,"own":{"fire":0,"frost":1,"stink":0}}',
      'the flags are read whatever "v" says (or without it), and written back as v 1');

    // Size: ≤ 4 KB; megabytes and deep nesting are refused quickly.
    const valid = '{"v":1,"own":{"fire":1,"frost":0,"stink":1}}';
    const at4k = valid.slice(0, -1) + ' '.repeat(4096 - valid.length) + '}';
    const over = valid.slice(0, -1) + ' '.repeat(4097 - valid.length) + '}';
    check(at4k.length === 4096 && same(parse(at4k).p.own, { fire: 1, frost: 0, stink: 1 }) && over.length === 4097 && same(parse(over).p, DEFAULT),
      'a record of exactly 4 KB (4096 characters) is read; 4097 characters are refused (the default)');
    const times = [];
    const timed = (raw) => {
      const t0 = process.hrtime.bigint();
      const res = parse(raw);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return res;
    };
    const huge = [
      ['2 MB of garbage', 'x'.repeat(2e6)],
      ['a 1 MB record', JSON.stringify({ v: 1, own: { fire: 1 }, pad: 'a'.repeat(1e6) })],
      ['a 1 MB flag', `{"own":{"fire":"${'1'.repeat(1e6)}"}}`],
      ['100k nested arrays', '['.repeat(1e5) + ']'.repeat(1e5)],
      ['2000 nested arrays (inside 4 KB)', '['.repeat(2000) + ']'.repeat(2000)],
      ['a deep object in a flag', `{"own":{"fire":${'{"a":'.repeat(500)}1${'}'.repeat(500)}}}`],
      ['a deep object around the record', '{"own":'.repeat(500) + '1' + '}'.repeat(500)],
    ];
    const badH = [];
    for (const [name, raw] of huge) {
      const res = timed(raw);
      if (res.error) badH.push(`${name}: ${res.error}`);
      else if (!same(res.p, DEFAULT)) badH.push(`${name}: ${show(res.p)}`);
    }
    check(badH.length === 0 && Math.max(...times) < 1000, `megabytes and deep nesting give the default quickly (slowest ${Math.max(...times).toFixed(1)} ms)${badH.length ? ' -> ' + badH.join('; ') : ''}`);

    // Round trips; serialize validates; a record that needed fixing is rewritten (main's loadRecord).
    const badRT = [];
    for (let k = 0; k < 8; k++) {
      const p = { v: 1, own: { fire: k & 1, frost: (k >> 1) & 1, stink: (k >> 2) & 1 } };
      const text = S.serializePowder(p);
      const back = parse(text);
      if (back.error || !same(back.p, p) || S.serializePowder(back.p) !== text || text !== JSON.stringify(p)) badRT.push(text);
    }
    check(badRT.length === 0, `serialize → parse round trips all 8 records, in the §10.1 text (e.g. ${S.serializePowder({ own: { fire: 1, frost: 0, stink: 1 } })})${badRT.length ? ' -> ' + badRT.join('; ') : ''}`);
    const rewrite = ['{"own":{"fire":1}}', '{"v":1,"own":{"fire":1,"frost":0,"stink":0},"x":1}', '{"v":1,"own":{"fire":"1","frost":0,"stink":0}}', ' ' + TEXT0];
    check(rewrite.every((raw) => S.serializePowder(S.parsePowder(raw)) !== raw) && S.serializePowder(S.parsePowder(TEXT0)) === TEXT0,
      'a stored record that needed fixing serializes differently (so loadRecord rewrites it); the canonical text is left alone');
    let text;
    let threw = '';
    try {
      text = [S.serializePowder({ own: { fire: 7, frost: 1, stink: 'x' }, extra: true }), ...[null, undefined, 'garbage', 42, Symbol('x'), proxy].map((v) => S.serializePowder(v))];
    } catch (e) {
      threw = e.message;
    }
    check(!threw && text[0] === '{"v":1,"own":{"fire":0,"frost":1,"stink":0}}' && text.slice(1).every((t) => t === TEXT0), `serializePowder validates before writing; junk writes the default${threw ? ' -> ' + threw : ''}`);

    // Two tabs: owned only goes up.
    const m = S.mergePowder('{"v":1,"own":{"fire":1,"frost":0,"stink":0}}', { own: { frost: 1 } });
    check(same(m, { v: 1, own: { fire: 1, frost: 1, stink: 0 } }) && same(S.mergePowder(ALL, S.defaultPowder()), ALL) && same(S.mergePowder('junk', proxy), DEFAULT), 'mergePowder (the storage listener): a recipe owned in either tab is owned');
  }

  // ------------------------------------------------------------------ junk in, well-formed results out
  {
    const hostile = {};
    for (const k of ['id', 't', 'max', 'immune', 'pegs', 'dmg', 'tags', 'typeKey', 'boss', 'burning', 'fire', 'frost', 'stink', 'own', 'v', 'rate', 'hp', 'time', 'powder', 'loads', 'unlocked']) {
      Object.defineProperty(hostile, k, { enumerable: true, get() { throw new Error('getter'); } });
    }
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const junk = [undefined, null, NaN, Infinity, -Infinity, -1, 0, -0, 0.5, 1e308, -1e308, '12', '', 'fire', 'stink', true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n, new Date(0), hostile, proxy,
      { id: 'fire', t: NaN, max: -5, immune: Infinity }, { id: 'stink', t: 1e300, pegs: -1 }, { id: '__proto__', t: 3 }];
    const problems = [];
    const tryIt = (name, fn, ok) => {
      try {
        const r = fn();
        const why = ok(r);
        if (why !== true) problems.push(`${name}: ${why === false ? show(r) : why}`);
      } catch (e) {
        problems.push(`${name}: threw ${e && e.message}`);
      }
    };
    const fin = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    const okSt = (s) => s && (s.id === null || S.isSpecial(s.id)) && fin(s.t) && fin(s.max) && fin(s.immune) && s.t <= s.max + 1e-9 && (s.id !== null || (s.t === 0 && s.max === 0)) &&
      (s.id === 'stink' ? fin(s.pegs) && Object.keys(s).join() === 'id,t,max,immune,pegs' : Object.keys(s).join() === 'id,t,max,immune');
    const okApply = (r) => r && okSt(r.st) && Array.isArray(r.events) && r.events.every((e) => ['applied', 'extended', 'kaboom', 'fireOut', 'immune', 'pegs'].includes(e)) && fin(r.burst) &&
      (r.burn === null || (fin(r.burn.rate) && fin(r.burn.time))) && typeof r.stopBurn === 'boolean' && (r.pop === null || typeof r.pop === 'string') && (r.sfx === null || typeof r.sfx === 'string');
    const okMuls = (m) => m && fin(m.speed) && m.speed <= 1 && fin(m.turn) && m.turn <= 1 && fin(m.grit) && fin(m.decel) && ['noFire', 'noBoard', 'noRam', 'noMortar', 'noGrapple', 'noRegen'].every((k) => typeof m[k] === 'boolean');
    const okLoads = (l) => l && Object.keys(l).join() === 'fire,frost,stink' && Object.values(l).every((v) => isInt(v) && v >= 0);
    const okPowder = (p) => p && p.v === 1 && Object.keys(p.own).join() === 'fire,frost,stink' && Object.values(p.own).every((v) => v === 0 || v === 1);
    for (const j of junk) {
      const J = show(j);
      tryIt(`isSpecial(${J})`, () => [S.isSpecial(j), S.onSale(j, j), S.onSale('fire', j), S.onSale(j, 9), S.isImmune(j, j), S.isImmune('inferno', j)], (rs) => rs.every((r) => typeof r === 'boolean'));
      tryIt(`specialShot(${J})`, () => [S.specialShot(j, 'fire'), S.specialShot(j, j), S.specialShot({ dmg: j, tags: j }, 'stink')], (rs) => rs.every((r) => r && typeof r === 'object') && fin(rs[0].dmg) && fin(rs[2].dmg) && Array.isArray(rs[2].tags));
      for (const id of [...S.SPECIAL_IDS, j]) {
        tryIt(`applyStatus(${J}, ${show(id)})`, () => [S.applyStatus(j, id, j), S.applyStatus(j, id, { typeKey: j, boss: j, burning: j }), S.applyStatus(st('stink', 2, 4, 0, 10), id, j)], (rs) => rs.every(okApply));
      }
      tryIt(`stepStatus(${J})`, () => [S.stepStatus(j, j), S.stepStatus(j, DT), S.stepStatus(st('fire', 2, 6), j)], (rs) => rs.every((r) => okSt(r.st) && (r.ended === null || S.isSpecial(r.ended))));
      tryIt(`statusMuls(${J})`, () => S.statusMuls(j), okMuls);
      tryIt(`douse(${J})`, () => [S.douse(j, j), S.douse(st('fire', 1, 6), j)], (rs) => rs.every((r) => okSt(r.st) && typeof r.doused === 'boolean'));
      tryIt(`mergeBurn(${J})`, () => [S.mergeBurn(j, j), S.mergeBurn(j, { rate: 3, time: 6 }), S.mergeBurn({ rate: 2, hp: 8 }, j)], (rs) => rs.every((r) => fin(r.rate) && isInt(r.hp) && fin(r.time) && typeof r.took === 'boolean'));
      tryIt(`startLoads(${J})`, () => [S.startLoads(j, j), S.startLoads(ALL, j), S.startLoads(j, 2)], (rs) => rs.every(okLoads));
      tryIt(`spendLoad(${J})`, () => [S.spendLoad(j, j), S.spendLoad(j, 'fire'), S.spendLoad({ fire: 2 }, j)], (rs) => rs.every((r) => okLoads(r.loads) && typeof r.ok === 'boolean'));
      tryIt(`crateLoad(${J})`, () => [S.crateLoad(j, j), S.crateLoad(j, ALL), S.crateLoad({ fire: 1 }, j)], (rs) => rs.every((r) => okLoads(r.loads) && (r.id === null || S.isSpecial(r.id)) && isInt(r.gold)));
      tryIt(`ammoReady(${J})`, () => [S.ammoReady(j, j), S.ammoReady('fire', j), S.ammoReady('frost', { powder: j, loads: j, unlocked: j })], (rs) => rs.every((r) => typeof r.ok === 'boolean' && typeof r.word === 'string'));
      tryIt(`parsePowder(${J})`, () => [S.parsePowder(j), S.mergePowder(j, j)], (rs) => rs.every(okPowder));
      tryIt(`serializePowder(${J})`, () => S.serializePowder(j), (t) => typeof t === 'string' && okPowder(JSON.parse(t)));
      tryIt(`buyRecipe(${J})`, () => [S.buyRecipe(j, j, j, j), S.buyRecipe(j, 1e6, 'fire', 9), S.buyRecipe(ALL, j, 'fire', j)], (rs) => rs.every((r) => typeof r.ok === 'boolean' && okPowder(r.powder) && fin(r.cost)));
    }
    const more = problems.length > 6 ? ` (+${problems.length - 6} more)` : '';
    check(problems.length === 0, `${junk.length} kinds of junk (missing, NaN, ±Infinity, huge, strings, arrays, functions, symbols, bigints, throwing getters, proxies, broken statuses) ` +
      `in every argument of every function: no throws, well-formed results${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') + more : ''}`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll specials checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
