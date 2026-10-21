// Unit checks for the combat rules in src/combat.js (plain Node, no browser), SPEC2 §2, §3, §11.1:
// - the §3.8 tables, exactly, and frozen
// - the shot pipeline: rangeMul, aspectOf, hitZone, critChance, ammoUnlocked, effectFor and shotResult
//   for every ammo, enemy shots (never crit, scaled by the level's enemyRake), the Phantom's ghost crew,
//   forced crits, the seeded RNG; every worked example of §2.1
// - crew: crewNow (never below 0, never resurrected, hull alone takes at most half), strikeAt
// - boarding: every worked example of §3.3 (P, M, D, R to 3 decimals, losses, captured / overrun /
//   attackerStrikes), monotonicity, caps, R = ∞, previewLabel
// - captureGold for every ship type (§3.7), plunderGold
// - junk in (missing, NaN, wrong types, throwing getters, proxies): finite results out, never a throw
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
const f3 = (v) => (typeof v === 'number' ? v.toFixed(3) : String(v));
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
const DEG = Math.PI / 180;
const isInt = (v) => Number.isInteger(v) && !Object.is(v, -0);

(async () => {
  const C = await load('src/combat.js');
  const { SHIP_TYPES } = await load('src/shipTypes.js');

  // ------------------------------------------------------------------ the tables (§3.8)
  {
    const WANT = {
      RANGE: { pointBlank: 10, pointBlankMul: 1.25, fadeEnd: 14, falloffStart: 24, falloffEnd: 34, falloffMin: 0.75 },
      RAKE: { cos: 0.8, stern: 2.0, bow: 1.5 },
      CRIT: {
        base: [0.06, 0.09, 0.12, 0.15], stern: 0.12, bow: 0.06, pointBlank: 0.05, cap: 0.35, mul: 1.75,
        effectGap: 3, bossDuration: 0.5, hitStop: { scale: 0.1, time: 0.07, gap: 0.5 },
      },
      EFFECTS: {
        rudder: { turn: 0.25, time: 6 }, mast: { speed: 0.5, time: 8 }, keg: { burst: 12, dps: 2, time: 4 },
        routed: { crew: 2 }, chain: { speed: 0.55, turn: 0.7, time: 6, max: 10 },
      },
      STATES: { battered: 0.6, wrecked: 0.3 },
      AMMO: {
        round: { hull: 1, crew: 0, rakeCrew: 0, range: 34, reloadMul: 1, spreadMul: 1, pad: 0.3, top: 3.8, unlock: 1 },
        chain: { hull: 0.4, crew: 0, rakeCrew: 0, range: 26, reloadMul: 1.15, spreadMul: 1.2, pad: 0.8, top: 9, unlock: 2 },
        grape: { hull: 0.3, crew: 1, rakeCrew: 1, range: 20, reloadMul: 0.85, spreadMul: 2.5, pad: 0.6, top: 3.8, unlock: 3 },
      },
      AMMO_IDS: ['round', 'chain', 'grape'],
      AMMO_SWAP: 0.5,
      GHOST: { hullMul: 0.5 },
      CREW: { hullShare: 0.5, strike: 0.2, minToBoard: 3, waveRefill: 3, captureRefill: 2 },
      BOARD: {
        cooldown: 6, range: [14, 17, 20], lenFactor: 0.25, reel: [1.2, 1.0, 0.8], heaveStep: 0.04, heaveMax: 0.2,
        slope: 0.45, minFrac: 0.15, lossK: 0.3, minR: 0.5, hullPerKill: 2, homeDefence: 1.5, enemyMorale: 0.5,
        fightAt: 1.2, slotGap: 0.7, glueSpeed: 2, pushApart: { speed: 4, time: 1 }, breakFree: 3,
        phases: { hook: 0.45, swing: 0.7, brawl: 2.0, result: 0.65 }, partyShown: 4, defendersShown: 4,
        homeLossCap: 0.6, // §3.3's "ceil(0.6 × def.crew)" cap for a player defending its own deck
      },
      RAIDERS: {
        reach: 10, threat: 1.5, reel: 1.0, cutTaps: 3, cutHold: 0.8, cooldownCut: 10, cooldownFight: 12, minCrew: 4,
        plunder: 0.25, counterWindow: 3, beside: 6,
        gap: 3, sheer: 4, // main.js's RAID_GAP / RAID_SHEER, moved into the table in Stage 3 (raider balance in one place)
      },
      CAPTURE: { goldMul: 20, flat: 25, hull: 15, crew: 2, prizeBonus: 50, sailAway: 5, sailSpeed: 7 },
    };
    for (const [name, want] of Object.entries(WANT)) {
      check(same(C[name], want), `${name} is exactly the §3.8 table${same(C[name], want) ? '' : ` -> ${JSON.stringify(C[name])}`}`);
    }
    const deepFrozen = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
    const tables = Object.keys(WANT).filter((k) => typeof C[k] === 'object');
    check(tables.every((k) => deepFrozen(C[k])) && deepFrozen(C.WORDS), `every table is frozen all the way down (${tables.join(', ')}, WORDS), so nothing can change a rule by accident`);
    check(same(Object.keys(C.AMMO), C.AMMO_IDS), 'AMMO lists the ammo in AMMO_IDS order');
    const exportsWanted = [
      ...Object.keys(WANT), 'mulberry32', 'rangeMul', 'aspectOf', 'hitZone', 'critChance', 'ammoUnlocked', 'shotResult', 'effectFor',
      'crewNow', 'strikeAt', 'boardingOdds', 'resolveBoarding', 'previewLabel', 'captureGold', 'plunderGold',
    ];
    const missing = exportsWanted.filter((k) => !(k in C));
    const fns = exportsWanted.filter((k) => !(k in WANT));
    check(missing.length === 0 && fns.every((k) => typeof C[k] === 'function'), `every §9.1 export is there${missing.length ? ' -> missing ' + missing.join(', ') : ''}`);
    const words = {
      stern: 'STERN RAKE ×2!', bow: 'BOW RAKE ×1.5!', pointBlank: 'POINT BLANK!', crit: 'CRIT!', chain: 'SAILS SHREDDED!',
      rudder: 'RUDDER SMASHED!', mast: 'MAST DOWN!', keg: 'POWDER KEG!', routed: 'CREW ROUTED!',
      capture: 'CAPTURE!', fight: 'FIGHT!', risky: 'RISKY!', take: 'TAKE HER!',
    };
    check(same(C.WORDS, words), `WORDS: the pop words of §2.3 / §2.5 and the preview labels of §3.3 (${Object.values(C.WORDS || {}).join(' · ')})`);
  }

  // ------------------------------------------------------------------ rangeMul (§2.1)
  {
    const table = [[0, 1.25], [10, 1.25], [12, 1.125], [14, 1], [24, 1], [26, 0.95], [29, 0.875], [30, 0.85], [32, 0.8], [34, 0.75], [40, 0.75]];
    const bad = table.filter(([d, want]) => C.rangeMul(d) !== want).map(([d, want]) => `${d}: ${C.rangeMul(d)} (want ${want})`);
    check(bad.length === 0, `rangeMul: ${table.map(([d, w]) => `${d} u ×${w}`).join(', ')} (exact)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    // Continuous and never rising with distance.
    let prev = Infinity;
    let jumps = 0;
    let rises = 0;
    for (let d = 0; d <= 60; d += 0.01) {
      const m = C.rangeMul(d);
      if (m > prev + 1e-12) rises++;
      if (prev !== Infinity && Math.abs(m - prev) > 0.25 * 0.01 / 4 + 1e-9) jumps++;
      prev = m;
    }
    check(rises === 0 && jumps === 0, `rangeMul is continuous and never rises with distance (0..60 u in 0.01 u steps${rises || jumps ? `: ${rises} rises, ${jumps} jumps` : ''})`);
    check(C.rangeMul(10.0001) < 1.25 && C.rangeMul(34.0001) === 0.75 && C.rangeMul(Infinity) === 0.75 && C.rangeMul(-5) === 1.25, 'rangeMul edges: just past point blank drops below ×1.25; ×0.75 from 34 u on; negative counts as point blank');
  }

  // ------------------------------------------------------------------ aspectOf (§2.1)
  {
    // A ball flying `deg` degrees off her heading (0° = the way she faces, so it enters at her stern).
    const ball = (deg, h, speed = 30) => [Math.sin(h + deg * DEG) * speed, Math.cos(h + deg * DEG) * speed];
    const cases = [[0, 'stern'], [36, 'stern'], [37.5, null], [90, null], [143, null], [180, 'bow'], [-36, 'stern'], [144, 'bow'], [-144, 'bow'], [270, null]];
    const headings = [0, 1.3, -2.2, Math.PI, 5.9, -7.5];
    const bad = [];
    for (const h of headings) {
      for (const [deg, want] of cases) {
        const [vx, vz] = ball(deg, h);
        const r = C.aspectOf(vx, vz, h);
        if (r.aspect !== want || !near(r.cos, Math.cos(deg * DEG), 1e-12)) bad.push(`h ${h} ${deg}°: ${show(r)}`);
      }
    }
    check(bad.length === 0, `aspectOf at 0°, ±36° (stern rake), 37.5°, 90°, 143°, 270° (beam), ±144°, 180° (bow rake), for 6 headings${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    const edge = Math.acos(0.8) / DEG; // 36.87°
    const e = [
      [edge - 0.01, 'stern'], [edge + 0.01, null], [180 - edge - 0.01, null], [180 - edge + 0.01, 'bow'],
    ].filter(([deg, want]) => C.aspectOf(...ball(deg, 0.7), 0.7).aspect !== want);
    check(e.length === 0 && C.aspectOf(0.6, 0.8, 0).aspect === 'stern' && C.aspectOf(-0.6, -0.8, 0).aspect === 'bow', `the rake boundary is |cos| ≥ 0.8 (${edge.toFixed(2)}° and ${(180 - edge).toFixed(2)}°), inclusive`);
    const scale = [0.01, 1, 1000].every((s) => C.aspectOf(...ball(20, 1, s), 1).aspect === 'stern' && C.aspectOf(...ball(160, 1, s), 1).aspect === 'bow');
    check(scale && same(C.aspectOf(0, 0, 1), { aspect: null, cos: 0 }), 'aspectOf ignores the ball\'s speed; a ball with no speed is no rake');
  }

  // ------------------------------------------------------------------ hitZone (§2.1)
  {
    const bad = [];
    for (const key of ['cutter', 'privateer', 'manowar', 'inferno', 'phantom', 'player']) {
      const len = SHIP_TYPES[key].len;
      const e = len / 6;
      const cases = [[0, 'mid'], [e, 'mid'], [e + 1e-6, 'bow'], [-e, 'mid'], [-e - 1e-6, 'stern'], [len / 2, 'bow'], [-len / 2, 'stern']];
      for (const [along, want] of cases) if (C.hitZone(along, len) !== want) bad.push(`${key} along ${along}: ${C.hitZone(along, len)}`);
    }
    check(bad.length === 0, `hitZone: past +len/6 bow, past −len/6 stern, ±len/6 itself is mid (6 hull lengths)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ critChance (§2.1)
  {
    const cases = [
      [{ critBase: 0.06, aspect: null, dist: 18 }, 0.06],
      [{ critBase: 0.06, aspect: 'stern', dist: 18 }, 0.18],
      [{ critBase: 0.06, aspect: 'bow', dist: 18 }, 0.12],
      [{ critBase: 0.06, aspect: null, dist: 10 }, 0.11],
      [{ critBase: 0.06, aspect: null, dist: 10.01 }, 0.06],
      [{ critBase: 0.06, aspect: 'stern', dist: 8 }, 0.23], // §2.1 worked example
      [{ critBase: 0.15, aspect: 'stern', dist: 8 }, 0.32], // Master gunner tier 3
      [{ critBase: 0.09, aspect: 'bow', dist: 5 }, 0.2],
      [{ critBase: 0.12, aspect: 'bow', dist: 30 }, 0.18],
      [{ critBase: 0.3, aspect: 'stern', dist: 8 }, 0.35], // capped
      [{ critBase: 0.35, aspect: 'stern', dist: 8 }, 0.35],
      [{ aspect: 'stern', dist: 8 }, 0.23], // no critBase: Master gunner tier 0
    ];
    const bad = cases.filter(([o, want]) => C.critChance(o) !== want).map(([o, want]) => `${show(o)}: ${C.critChance(o)} (want ${want})`);
    check(bad.length === 0, `critChance: base + 0.12 stern / 0.06 bow + 0.05 point blank, capped at 0.35 (${cases.length} sums, exact)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    const tiers = C.CRIT.base.map((b) => C.critChance({ critBase: b, aspect: 'stern', dist: 8 }));
    check(same(tiers, [0.23, 0.26, 0.29, 0.32]), `stern rake at point blank by Master gunner tier: ${tiers.join(' / ')}`);
  }

  // ------------------------------------------------------------------ ammoUnlocked, effectFor
  {
    const cases = [
      ['round', 1, true], ['round', 0, true], ['round', undefined, true], ['chain', 1, false], ['chain', 2, true], ['chain', 6, true],
      ['grape', 2, false], ['grape', 3, true], ['grape', 6, true], ['fire', 6, false], ['__proto__', 6, false], ['toString', 6, false],
      [undefined, 6, false], ['chain', '2', false], ['grape', NaN, false],
    ];
    const bad = cases.filter(([id, lvl, want]) => C.ammoUnlocked(id, lvl) !== want).map(([id, lvl]) => `${show(id)} at ${show(lvl)}`);
    check(bad.length === 0, `ammoUnlocked: round always, chain from state.unlocked 2, grape from 3, unknown ids never${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    const eff = [
      ['round', 'stern', 'rudder'], ['round', 'mid', 'mast'], ['round', 'bow', 'keg'],
      ['chain', 'stern', 'mast'], ['chain', 'mid', 'mast'], ['chain', 'bow', 'mast'],
      ['grape', 'stern', 'routed'], ['grape', 'mid', 'routed'], ['grape', 'bow', 'routed'],
    ];
    const badE = eff.filter(([ammo, zone, want]) => C.effectFor({ ammo, zone }) !== want);
    check(badE.length === 0, `effectFor (§2.3): round stern → rudder, mid → mast, bow → keg; chain → mast; grape → routed${badE.length ? ' -> ' + badE.map((e) => e.join(' ')).join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ shotResult
  // Shots at a target heading h = 0.4, length 9.5 (a Privateer Brig). Ball directions relative to her.
  const H = 0.4;
  const LEN = 9.5;
  const dir = { beam: 90, stern: 0, bow: 180 };
  const vel = (aspect) => ({ vx: Math.sin(H + dir[aspect] * DEG) * 30, vz: Math.cos(H + dir[aspect] * DEG) * 30 });
  const alongFor = { beam: 0, stern: -LEN / 2 + 0.5, bow: LEN / 2 - 0.5 };
  const never = () => 0.999999; // a roll that never crits
  const player = (critBase = 0.06) => ({ player: true, critBase });
  const enemy = (enemyRake) => ({ player: false, enemyRake });
  const shot = (aspect, dist, extra = {}) =>
    C.shotResult({
      ammo: 'round', base: 10, dist, ...vel(aspect), target: { h: H, len: LEN, ghost: false, boss: false }, along: alongFor[aspect],
      shooter: player(), rng: never, ...extra,
    });

  // §2.1 worked example (player, stock: dmg 10, 3 guns, round shot, no Master gunner).
  {
    const beam18 = shot('beam', 18);
    const beam30 = shot('beam', 30);
    check(beam18.dmg === 10 && beam18.aspect === null && beam18.aspectMul === 1 && beam18.rangeMul === 1 && !beam18.crit && beam30.dmg === 8.5 && beam30.rangeMul === 0.85,
      `§2.1: on her beam at 18 u 10 × 1 × 1.0 × 1.0 = ${beam18.dmg}; at 30 u 10 × 0.85 = ${beam30.dmg}`);
    const stern18 = shot('stern', 18);
    const bow12 = shot('bow', 12);
    check(stern18.dmg === 20 && stern18.aspect === 'stern' && stern18.aspectMul === 2 && bow12.dmg === 16.875 && bow12.aspect === 'bow' && bow12.aspectMul === 1.5 && bow12.rangeMul === 1.125 && Math.round(bow12.dmg) === 17,
      `§2.1: stern rake at 18 u = ${stern18.dmg}; bow rake at 12 u 10 × 1.125 × 1.5 = ${bow12.dmg} (pop "${Math.round(bow12.dmg)}")`);
    const stern8 = shot('stern', 8);
    const p = C.critChance({ critBase: 0.06, aspect: 'stern', dist: 8 });
    const crit8 = shot('stern', 8, { rng: () => 0.2299 });
    const miss8 = shot('stern', 8, { rng: () => 0.23 });
    check(stern8.dmg === 25 && stern8.pointBlank && p === 0.23 && crit8.crit && crit8.dmg === 43.75 && Math.round(crit8.dmg) === 44 && !miss8.crit && miss8.dmg === 25,
      `§2.1: stern rake at 8 u 10 × 1.25 × 2 = ${stern8.dmg}; crit chance ${p} (a roll of 0.2299 crits, 0.23 does not); with the crit ${crit8.dmg} (pop "${Math.round(crit8.dmg)}")`);
    const longBeam = 3 * beam30.dmg;
    const best = stern8.dmg + stern8.dmg + crit8.dmg;
    check(longBeam === 25.5 && best === 93.75 && (best / longBeam).toFixed(1) === '3.7', `§2.1: a 3-gun broadside: long range on the beam ${longBeam}; point-blank stern rake with one crit ${best}, ${(best / longBeam).toFixed(1)}× apart`);
    const tier3 = C.critChance({ critBase: C.CRIT.base[3], aspect: 'stern', dist: 8 });
    const t3hit = shot('stern', 8, { shooter: player(C.CRIT.base[3]), rng: () => 0.3199 });
    const t3miss = shot('stern', 8, { shooter: player(C.CRIT.base[3]), rng: () => 0.32 });
    check(tier3 === 0.32 && t3hit.crit && !t3miss.crit, `§2.1: with Master gunner tier 3 the same shot crits at ${tier3}`);
    // Enemy privateer (dmg 5) raking your stern at 20 u, by level (enemyRake 0.4, 0.6, 0.8, 1, 1, 1).
    const RAKES = [0.4, 0.6, 0.8, 1, 1, 1];
    const sternBy = RAKES.map((r) => shot('stern', 20, { base: 5, shooter: enemy(r) }).dmg);
    const bowBy = RAKES.map((r) => shot('bow', 20, { base: 5, shooter: enemy(r) }).dmg);
    const beamBy = RAKES.map((r) => shot('beam', 20, { base: 5, shooter: enemy(r) }).dmg);
    check(sternBy[0] === 7 && sternBy[4] === 10 && bowBy[0] === 6 && same(sternBy, [7, 8, 9, 10, 10, 10]) && same(bowBy, [6, 6.5, 7, 7.5, 7.5, 7.5]) && beamBy.every((d) => d === 5),
      `§2.1: an enemy privateer (dmg 5) raking your stern at 20 u: L1 ${sternBy[0]}, L5 ${sternBy[4]}; bow rake on L1 ${bowBy[0]} (stern by level ${sternBy.join('/')}, bow ${bowBy.join('/')}, beam always 5)`);
    const l1 = shot('stern', 20, { base: 5, shooter: enemy(0.4) });
    check(l1.aspectMul === 1.4 && same(l1.tags, ['RAKE ×1.4']), `an enemy rake reports its real multiplier (L1 stern: ×${l1.aspectMul}, tags ${show(l1.tags)})`);
  }

  // Each ammo: hull factor, crew killed, slow.
  {
    const rows = [];
    const bad = [];
    for (const ammo of C.AMMO_IDS) {
      const a = C.AMMO[ammo];
      for (const aspect of ['beam', 'stern', 'bow']) {
        const r = shot(aspect, 18, { ammo });
        const raw = aspect === 'stern' ? 2 : aspect === 'bow' ? 1.5 : 1;
        const wantCrew = ammo === 'grape' ? (aspect === 'beam' ? 1 : 2) : 0;
        if (!near(r.dmg, 10 * a.hull * raw) || r.crewKill !== wantCrew || r.slow !== (ammo === 'chain') || r.crit) bad.push(`${ammo} ${aspect}: ${show(r)}`);
        rows.push(`${ammo} ${aspect} ${r.dmg}/${r.crewKill}${r.slow ? '/slow' : ''}`);
      }
    }
    check(bad.length === 0, `shotResult per ammo at 18 u (dmg/crew): ${rows.join(', ')}${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    const grapeBeam = shot('beam', 18, { ammo: 'grape' });
    const grapeRake = shot('stern', 18, { ammo: 'grape' });
    const chain = shot('beam', 18, { ammo: 'chain' });
    check(grapeBeam.crewKill === 1 && grapeRake.crewKill === 2 && chain.slow === true && chain.crewKill === 0 && shot('beam', 18).slow === false,
      'grape kills 1 sailor per hit and 2 on a rake; chain slows and kills nobody; round does neither');
    const pb10 = shot('beam', 10);
    const pb1001 = shot('beam', 10.01);
    check(pb10.pointBlank && same(pb10.tags, ['POINT BLANK']) && pb10.dmg === 12.5 && !pb1001.pointBlank && same(pb1001.tags, []) && pb1001.dmg < 12.5,
      `point blank is up to and including 10 u (10 u: ${pb10.dmg}, POINT BLANK; 10.01 u: ${pb1001.dmg}, no sticker)`);
    const zones = ['beam', 'stern', 'bow'].map((a) => shot(a, 18).zone);
    check(same(zones, ['mid', 'stern', 'bow']), `shotResult reports the hit zone from along (${zones.join(', ')})`);
    const unknown = shot('beam', 18, { ammo: 'fire' });
    check(unknown.dmg === 10 && unknown.crewKill === 0 && !unknown.slow, 'an unknown ammo id counts as round shot');
  }

  // Enemy shots never crit (whatever the roll or force) and draw no random numbers.
  {
    let draws = 0;
    const rng = () => {
      draws++;
      return 0;
    };
    const forced = [null, 'crit', 'rudder', 'mast', 'keg', 'routed'].map((force) => shot('stern', 5, { base: 5, shooter: enemy(1), rng, force }));
    check(forced.every((r) => !r.crit && r.critEffect === null && r.critMul === 1 && r.dmg === 12.5) && draws === 0,
      `enemy shots never crit, even with a roll of 0 or a forced crit (dmg ${forced[0].dmg} at point blank, ${draws} numbers drawn)`);
  }

  // Forced crits (tests) and the effect each one carries.
  {
    let draws = 0;
    const rng = () => {
      draws++;
      return 0;
    };
    const none = shot('stern', 8, { force: 'none', rng });
    const nat = { stern: shot('stern', 18, { force: 'crit', rng }), beam: shot('beam', 18, { force: 'crit', rng }), bow: shot('bow', 18, { force: 'crit', rng }) };
    const chainCrit = shot('bow', 18, { ammo: 'chain', force: 'crit', rng });
    const grapeCrit = shot('stern', 18, { ammo: 'grape', force: 'crit', rng });
    const named = ['rudder', 'mast', 'keg', 'routed'].map((force) => shot('beam', 18, { ammo: 'grape', force, rng }));
    check(!none.crit && none.dmg === 25, `force 'none' never crits, even with a roll of 0 (${none.dmg})`);
    check(nat.stern.critEffect === 'rudder' && nat.beam.critEffect === 'mast' && nat.bow.critEffect === 'keg' && chainCrit.critEffect === 'mast' && grapeCrit.critEffect === 'routed' &&
      nat.stern.dmg === 35 && nat.beam.dmg === 17.5 && nat.bow.dmg === 26.25 && near(chainCrit.dmg, 10 * 0.4 * 1.5 * 1.75) && near(grapeCrit.dmg, 10 * 0.3 * 2 * 1.75) && grapeCrit.crewKill === 2,
    `force 'crit' crits with the natural effect: round stern ${nat.stern.critEffect} (${nat.stern.dmg}), mid ${nat.beam.critEffect} (${nat.beam.dmg}), bow ${nat.bow.critEffect} (${nat.bow.dmg}); chain ${chainCrit.critEffect}; grape ${grapeCrit.critEffect}`);
    check(named.every((r, i) => r.crit && r.critEffect === ['rudder', 'mast', 'keg', 'routed'][i] && r.critMul === 1.75 && near(r.dmg, 3 * 1.75)) && draws === 0,
      `force 'rudder' / 'mast' / 'keg' / 'routed' crit with that effect (×1.75) whatever the ammo; forced shots draw no numbers (${draws})`);
    check(same(nat.stern.tags, ['RAKE ×2', 'CRIT!']) && same(shot('stern', 8, { force: 'crit' }).tags, ['RAKE ×2', 'CRIT!', 'POINT BLANK']) && same(shot('bow', 18).tags, ['RAKE ×1.5']) && same(shot('beam', 18).tags, []),
      'tags carry the hitmark stickers: "RAKE ×2" / "RAKE ×1.5", "CRIT!", "POINT BLANK"');
    const boss = shot('stern', 18, { target: { h: H, len: LEN, ghost: false, boss: true } });
    check(boss.dmg === 20, 'a boss takes the same damage (only her effect durations are halved, by main)');
  }

  // The Phantom while her ghost crew stands: round and chain ×0.5, grape ×1.
  {
    const ghost = { h: H, len: 17, ghost: true, boss: true };
    const r = ['round', 'chain', 'grape'].map((ammo) => shot('beam', 18, { ammo, target: ghost }));
    const kegGhost = shot('bow', 18, { target: ghost, force: 'keg' });
    const banished = shot('beam', 18, { target: { ...ghost, ghost: false } });
    check(r[0].dmg === 5 && r[1].dmg === 2 && r[2].dmg === 3 && r[0].ghostMul === 0.5 && r[1].ghostMul === 0.5 && r[2].ghostMul === 1 && r[2].crewKill === 1 && banished.dmg === 10 && banished.ghostMul === 1,
      `ghost crew: round ${r[0].dmg} (×0.5), chain ${r[1].dmg} (×0.5), grape ${r[2].dmg} (×1, still kills ${r[2].crewKill}); once banished ×1 (${banished.dmg})`);
    check(near(kegGhost.dmg, 10 * 1.5 * 1.75 * 0.5) && kegGhost.ghostMul === 0.5, `a crit on her is ×1.75 × 0.5 too (${kegGhost.dmg}); ghostMul is returned for the keg burst`);
  }

  // The seeded RNG.
  {
    // The reference mulberry32 (Tommy Ettinger's, as published by bryc).
    const reference = (a) => () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const seeds = [0, 1, 13, 7932, 2 ** 31, 4294967295];
    const badRef = seeds.filter((s) => {
      const a = C.mulberry32(s);
      const b = reference(s);
      for (let i = 0; i < 2000; i++) if (a() !== b()) return true;
      return false;
    });
    check(badRef.length === 0, `mulberry32 matches the reference generator for 2000 draws on seeds ${seeds.join(', ')}${badRef.length ? ' -> differs on ' + badRef.join(', ') : ''}`);
    const r1 = C.mulberry32(7932);
    const r2 = C.mulberry32(7932);
    const r3 = C.mulberry32(7933);
    const s1 = Array.from({ length: 50 }, r1);
    const s2 = Array.from({ length: 50 }, r2);
    const s3 = Array.from({ length: 50 }, r3);
    let inRange = true;
    let sum = 0;
    const r4 = C.mulberry32(42);
    for (let i = 0; i < 100000; i++) {
      const v = r4();
      if (!(v >= 0 && v < 1)) inRange = false;
      sum += v;
    }
    check(same(s1, s2) && !same(s1, s3) && inRange && Math.abs(sum / 100000 - 0.5) < 0.01, `mulberry32: the same seed gives the same numbers, another seed others, all in [0, 1) (mean ${(sum / 100000).toFixed(4)})`);

    // One draw per unforced player shot: crits are deterministic for a seed.
    const run = (seed) => {
      const rng = C.mulberry32(seed);
      let draws = 0;
      const counted = () => {
        draws++;
        return rng();
      };
      const crits = [];
      for (let i = 0; i < 400; i++) crits.push(shot(['beam', 'stern', 'bow'][i % 3], 6 + (i % 30), { rng: counted }).crit ? 1 : 0);
      return { crits: crits.join(''), draws };
    };
    const a = run(13);
    const b = run(13);
    const c = run(7932);
    check(a.crits === b.crits && a.crits !== c.crits && a.draws === 400, `crits from a seeded combatRng are deterministic: the same seed gives the same ${a.crits.split('1').length - 1} crits in 400 shots, one draw per shot (${a.draws})`);
    const rng = C.mulberry32(99);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (shot('stern', 8, { rng }).crit) n++;
    check(Math.abs(n / 20000 - 0.23) < 0.01, `over 20000 point-blank stern rakes ${(n / 20000).toFixed(4)} crit (chance 0.23)`);
    const throwing = shot('stern', 8, { rng: () => { throw new Error('rng'); } });
    const noRng = shot('stern', 8, { rng: null });
    check(!throwing.crit && !noRng.crit && throwing.dmg === 25, 'without a working rng a player shot does not crit (and does not throw)');
  }

  // ------------------------------------------------------------------ crewNow, strikeAt (§3.1)
  {
    const cn = (crew0, hpLow, maxHp, killed = 0) => C.crewNow({ crew0, hpLow, maxHp, killed });
    const ex = [
      ['privateer at 32/80', cn(12, 32, 80), 9], ['privateer at 80/80', cn(12, 80, 80), 12], ['Phantom at 1/300', cn(24, 1, 300), 13],
      ["Man-o'-War at 80/160", cn(20, 80, 160), 15], ["Man-o'-War at 32/160", cn(20, 32, 160), 12], ['Corsair Cutter at 14/35', cn(8, 14, 35), 6],
    ];
    const bad = ex.filter(([, got, want]) => got !== want);
    check(bad.length === 0, `crewNow on the §3.3 examples: ${ex.map(([n, g]) => `${n} ${g}`).join(', ')}${bad.length ? ' -> ' + bad.map(([n, g, w]) => `${n} ${g} (want ${w})`).join('; ') : ''}`);
    check(cn(12, 32, 80, 3) === 6 && cn(12, 32, 80, 9) === 0 && cn(12, 32, 80, 50) === 0 && cn(12, 0, 80, 7) === 0 && cn(8, -900, 35, 0) === 4,
      'crewNow subtracts the killed and never goes below 0 (even with more killed than aboard or hull below 0)');
    // Hull damage alone takes at most half of every crew.
    const half = [];
    for (const [key, t] of Object.entries(SHIP_TYPES)) {
      if (!t.crew) continue;
      for (let hp = t.hp; hp >= -t.hp; hp -= 0.5) {
        const c = cn(t.crew, hp, t.hp);
        const lost = t.crew - c;
        const want = Math.floor(t.crew * 0.5 * (1 - Math.max(0, hp) / t.hp) + 1e-9);
        if (lost > Math.floor(t.crew / 2) || lost !== want || !isInt(c)) half.push(`${key} at ${hp}: ${c}`);
      }
      if (cn(t.crew, 0, t.hp) <= C.strikeAt(t.crew)) half.push(`${key}: hull alone reaches the notch`);
    }
    check(half.length === 0, `hull damage alone thins every crew by floor(crew0 × 0.5 × (1 − hpLow / maxHp)), at most half, never to the notch (every ship type, hp from full to −full)${half.length ? ' -> ' + half.slice(0, 4).join('; ') : ''}`);
    // Repairs never bring sailors back: main passes hpLow, the lowest hp she has had.
    const hps = [80, 70, 52, 40, 33, 45, 60, 80, 80, 31, 50, 80];
    let hpLow = Infinity;
    const crews = hps.map((hp) => {
      hpLow = Math.min(hpLow, hp);
      return C.crewNow({ crew0: 12, hpLow, maxHp: 80, killed: 0, hp });
    });
    const rising = crews.some((c, i) => i > 0 && c > crews[i - 1]);
    check(!rising && crews[crews.length - 1] === cn(12, 31, 80), `crewNow never resurrects sailors: hull 80 → 33 → repaired to 80 → 31 → 80 gives crews ${crews.join(' ')}`);
    const strikes = [[8, 1], [9, 1], [10, 2], [12, 2], [14, 2], [20, 4], [24, 4], [0, 0]];
    const badS = strikes.filter(([c, w]) => C.strikeAt(c) !== w);
    check(badS.length === 0, `strikeAt: ${strikes.map(([c]) => `${c} → ${C.strikeAt(c)}`).join(', ')}`);
  }

  // ------------------------------------------------------------------ boarding: the worked examples (§3.3)
  const stock = (crew = 12, blade = 1, hpFrac = 1) => ({ crew, crew0: crew, blade, hpFrac });
  const enemyOf = (key, hp, killed = 0) => {
    const t = SHIP_TYPES[key];
    return { crew: C.crewNow({ crew0: t.crew, hpLow: hp, maxHp: t.hp, killed }), crew0: t.crew, grit: t.grit, hpFrac: hp / t.hp };
  };
  const attack = (att, def, heave = 0) => C.resolveBoarding(att, def, { heave, playerAttacks: true });
  const defend = (raider, me) => C.resolveBoarding(raider, me, { enemyAttacks: true, home: true, playerDefends: true });
  // [label, result, { P, M, D, R (3 decimals), defLoss, attLoss, defLeft, attLeft, hullDmg, captured, overrun, attackerStrikes, label }]
  {
    const ph = enemyOf('phantom', 1);
    const rows = [
      ['1. soften them up: brig at 32/80', attack(stock(), enemyOf('privateer', 32)), { P: 12, M: 1.6, D: 9.9, R: 1.939, defLoss: 8, attLoss: 1, defLeft: 1, attLeft: 11, hullDmg: 16, captured: true, label: 'capture' }],
      ['1. with three heaves (0.12)', attack(stock(), enemyOf('privateer', 32), 0.12), { P: 13.44, R: 2.172, defLoss: 9, attLoss: 1, captured: true }],
      ['2. full-hull rush: brig at 80/80', attack(stock(), enemyOf('privateer', 80)), { P: 12, M: 1, D: 13.2, R: 0.909, defLoss: 5, attLoss: 4, defLeft: 7, attLeft: 8, hullDmg: 10, captured: false, label: 'risky' }],
      ['2. with three heaves', attack(stock(), enemyOf('privateer', 80), 0.12), { R: 1.018, defLoss: 5, attLoss: 4, captured: false, label: 'risky' }],
      ['3. raiders board you', defend(enemyOf('raider', 45), stock()), { P: 13.2, M: 1, D: 18, R: 0.733, defLoss: 4, attLoss: 5, defLeft: 8, attLeft: 7, hullDmg: 8, overrun: false, attackerStrikes: false, captured: false }],
      ['3. with Boarding party 2 + Cutlass 1', defend(enemyOf('raider', 45), stock(18, 1.2)), { D: 32.4, R: 0.407, defLoss: 3, attLoss: 11, attLeft: 1, overrun: false, attackerStrikes: true }],
      ['4. overrun: 5 crew at 30 % hull', defend(enemyOf('raider', 45), stock(5, 1, 0.3)), { P: 13.2, M: 1.35, D: 7.5, R: 2.376, defLoss: 3, attLoss: 1, defLeft: 2, attLeft: 11, overrun: true, attackerStrikes: false }],
      ['5. the Phantom at 1 hp', attack(stock(), ph), { M: 1.997, D: 19.5, R: 1.229, defLoss: 7, attLoss: 3, defLeft: 6, captured: false, label: 'fight' }],
      ['5. with five heaves (0.2)', attack(stock(), ph, 0.2), { R: 1.474, defLoss: 9, defLeft: 4, captured: true }],
      ['5. with four heaves (0.16)', attack(stock(), ph, 0.16), { R: 1.425, defLoss: 8, defLeft: 5, captured: false }],
      ['5. again after the cooldown with 9 crew', attack(stock(9), { ...ph, crew: 6 }), { R: 1.997, defLoss: 5, defLeft: 1, captured: true }],
      ['5. with Boarding party 2 + Cutlass 2', attack(stock(18, 1.4), ph), { R: 2.58, captured: true, label: 'capture' }],
      ["6. Man-o'-War at 50 %", attack(stock(), enemyOf('manowar', 80)), { R: 0.857, attLoss: 5, captured: false, label: 'risky' }],
      ["6. Man-o'-War at 20 %", attack(stock(), enemyOf('manowar', 32)), { R: 1.286, attLoss: 3, defLeft: 5, captured: false, label: 'fight' }],
      ['6. Corsair Cutter at 40 %', attack(stock(), enemyOf('cutter', 14)), { R: 3.2, attLoss: 1, captured: true, label: 'capture' }],
    ];
    for (const [name, r, want] of rows) {
      const off = [];
      for (const [k, w] of Object.entries(want)) {
        const got = k === 'label' ? C.previewLabel(r) : r[k];
        if (['P', 'M', 'D', 'R'].includes(k) ? f3(got) !== f3(w) : got !== w) off.push(`${k} ${typeof got === 'number' && ['P', 'M', 'D', 'R'].includes(k) ? f3(got) : got} (want ${w})`);
      }
      // Examples 3 and 4 are raiders boarding you (no preview label); the rest are your boardings.
      const defending = /^[34]\./.test(name);
      const label = C.previewLabel(r);
      const text = defending ? (r.overrun ? 'OVERRUN!' : r.attackerStrikes ? 'Boarders beaten!' : 'Boarders driven back!') : `${C.WORDS[label]} −${r.attLoss}`;
      const flags = `${r.captured ? ', captured' : ''}${r.overrun ? ', OVERRUN' : ''}${r.attackerStrikes ? ', the raider strikes' : ''}`;
      const sums = `P ${f3(r.P)}, M ${f3(r.M)}, D ${f3(r.D)}, R ${f3(r.R)}, lost ${r.defLoss} / ${r.attLoss}, left ${r.defLeft} / ${r.attLeft}${flags}`;
      check(off.length === 0, `§3.3 example ${name}: ${sums} (${text})${off.length ? ' -> ' + off.join('; ') : ''}`);
    }
    // The bookkeeping around the examples.
    const ex1 = attack(stock(), enemyOf('privateer', 32));
    const crewAfter = Math.min(12, ex1.attLeft + C.CAPTURE.crew);
    check(crewAfter === 12 && C.captureGold(SHIP_TYPES.privateer.gold) === 145 && SHIP_TYPES.privateer.gold * 10 === 60 && C.CAPTURE.prizeBonus === 50,
      `example 1: you lose 1 (12 → ${ex1.attLeft}, +${C.CAPTURE.crew} for the capture → ${crewAfter}, capped); gold ${C.captureGold(SHIP_TYPES.privateer.gold)} at once (sinking her drops 60) and +50 prize bonus`);
    const ex2 = attack(stock(), enemyOf('privateer', 80));
    check(80 - ex2.hullDmg === 70, `example 2: her hull 80 → ${80 - ex2.hullDmg} (2 per sailor beaten)`);
    const ex3 = defend(enemyOf('raider', 45), stock());
    const cap3 = Math.min(12 - 1, Math.ceil(0.6 * 12));
    check(cap3 === 8 && ex3.defLoss <= cap3 && ex3.hullDmg === 8, `example 3: you lose ${ex3.defLoss} (cap ${cap3}) and ${ex3.hullDmg} hull: "Boarders driven back!"`);
    const ex3b = defend(enemyOf('raider', 45), stock(18, 1.2));
    check(ex3b.attackerStrikes && ex3b.attLeft <= C.strikeAt(12) && C.captureGold(SHIP_TYPES.raider.gold) === 125, `example 3: beaten boarders (1 left ≤ notch ${C.strikeAt(12)}): the raider is yours for ${C.captureGold(SHIP_TYPES.raider.gold)} gold`);
    const ex4 = defend(enemyOf('raider', 45), stock(5, 1, 0.3));
    const ex4Uncapped = C.resolveBoarding(enemyOf('raider', 45), stock(5, 1, 0.3), { enemyAttacks: true, home: true, playerDefends: false });
    check(ex4.defLoss === 3 && ex4Uncapped.defLoss === 5 && C.plunderGold(740 - 500) === 60,
      `example 4: you lose ${ex4.defLoss} (cap min(4, 3); ${ex4Uncapped.defLoss} without it); they grab 25 % of this level's plunder (240 → ${C.plunderGold(240)})`);
    const ph1 = attack(stock(), ph);
    check(ph.crew === 13 && C.strikeAt(24) === 4 && ph1.defLeft > C.strikeAt(24), `example 5: the spectral Phantom has ${ph.crew} ghosts (notch ${C.strikeAt(24)}); one stock boarding leaves ${ph1.defLeft}`);
  }

  // ------------------------------------------------------------------ boarding: defaults, monotonicity, caps, R = ∞
  {
    // Without playerAttacks / playerDefends, the flags follow enemyAttacks.
    const a1 = C.resolveBoarding(stock(2), enemyOf('manowar', 160));
    const a2 = attack(stock(2), enemyOf('manowar', 160));
    const d1 = C.resolveBoarding(enemyOf('raider', 45), stock(5, 1, 0.3), { enemyAttacks: true, home: true });
    const d2 = defend(enemyOf('raider', 45), stock(5, 1, 0.3));
    check(same(a1, a2) && same(d1, d2) && a1.attLeft === 1, 'without playerAttacks / playerDefends the player\'s caps still apply (the player is the one attacking or defending)');
    const o = C.boardingOdds(stock(), enemyOf('privateer', 32), { heave: 0.12 });
    const r = attack(stock(), enemyOf('privateer', 32), 0.12);
    check(o.P === r.P && o.M === r.M && o.D === r.D && o.R === r.R && Object.keys(o).sort().join() === 'D,M,P,R', 'boardingOdds gives the same P, M, D, R as resolveBoarding');
    const heaves = [0.2, 0.3, 5].map((h) => C.boardingOdds(stock(), enemyOf('privateer', 32), { heave: h }).P);
    const neg = C.boardingOdds(stock(), enemyOf('privateer', 32), { heave: -1 }).P;
    check(heaves.every((p) => near(p, 14.4)) && neg === 12, `heave is clamped to 0..0.2 (0.3 and 5 give P ${f3(heaves[1])}; −1 gives ${neg})`);
  }
  {
    const badHp = [];
    const badCoupled = [];
    const badAtt = [];
    const badDef = [];
    let n = 0;
    const enemies = Object.entries(SHIP_TYPES).filter(([, t]) => t.crew);
    for (const [key, t] of enemies) {
      for (const crew of [3, 6, 12, 15, 18, 22]) {
        for (const blade of [1, 1.2, 1.4, 1.6]) {
          for (const heave of [0, 0.12, 0.2]) {
            let prevFixed = null;
            let prevCoupled = null;
            for (let hp = t.hp; hp >= 1; hp -= 1) {
              const fixed = attack(stock(crew, blade), { crew: t.crew, crew0: t.crew, grit: t.grit, hpFrac: hp / t.hp }, heave);
              const coupled = attack(stock(crew, blade), enemyOf(key, hp), heave);
              n += 2;
              if (prevFixed && (fixed.defLoss < prevFixed.defLoss || fixed.attLoss > prevFixed.attLoss)) badHp.push(`${key} crew ${crew} blade ${blade} hp ${hp}`);
              if (prevCoupled && (coupled.defLeft > prevCoupled.defLeft || (prevCoupled.captured && !coupled.captured))) badCoupled.push(`${key} crew ${crew} blade ${blade} hp ${hp}`);
              prevFixed = fixed;
              prevCoupled = coupled;
            }
          }
        }
      }
      // More crew, blade or heave on the attacking side: never fewer of hers beaten, never more of ours lost.
      for (const hp of [t.hp, t.hp * 0.6, t.hp * 0.3, 1]) {
        const def = enemyOf(key, hp);
        for (const blade of [1, 1.2, 1.4, 1.6]) {
          let prev = null;
          for (let crew = 1; crew <= 30; crew++) {
            const res = attack(stock(crew, blade), def);
            n++;
            if (prev && (res.defLoss < prev.defLoss || res.attLeft < prev.attLeft)) badAtt.push(`${key} at ${hp}: crew ${crew} blade ${blade}`);
            prev = res;
          }
        }
        for (const crew of [3, 12, 22]) {
          let prev = null;
          for (let blade = 0.5; blade <= 2.5; blade += 0.05) {
            for (const heave of [0, 0.04, 0.08, 0.12, 0.16, 0.2]) {
              const res = attack(stock(crew, blade), def, heave);
              n++;
              if (prev && (res.defLoss < prev.defLoss || res.attLoss > prev.attLoss)) badAtt.push(`${key} at ${hp}: crew ${crew} blade ${blade.toFixed(2)} heave ${heave}`);
              prev = res;
            }
            prev = attack(stock(crew, blade), def, 0); // the next blade step starts from no heave
          }
        }
      }
    }
    // Defending your own deck: more crew or blade beats more raiders and loses no more of yours.
    for (const rc of [4, 8, 12]) {
      for (const hpFrac of [1, 0.6, 0.3, 0.05]) {
        for (const blade of [1, 1.2, 1.4, 1.6]) {
          let prev = null;
          for (let crew = 1; crew <= 30; crew++) {
            const res = defend({ crew: rc, crew0: 12, grit: 1.1 }, stock(crew, blade, hpFrac));
            n++;
            if (prev && (res.attLoss < prev.attLoss || res.defLeft < prev.defLeft)) badDef.push(`raider ${rc} vs crew ${crew} blade ${blade} at ${hpFrac}`);
            prev = res;
          }
        }
      }
    }
    check(badHp.length === 0, `lower defender hull (same crew) → defLoss never smaller, attLoss never larger${badHp.length ? ' -> ' + badHp.slice(0, 3).join('; ') : ''}`);
    check(badCoupled.length === 0, `with hull-thinned crews (crewNow), lower hull → never more defenders left, never un-captured${badCoupled.length ? ' -> ' + badCoupled.slice(0, 3).join('; ') : ''}`);
    check(badAtt.length === 0, `more crew, blade or heave → defLoss never smaller (and never fewer of ours left / lost more)${badAtt.length ? ' -> ' + badAtt.slice(0, 3).join('; ') : ''}`);
    check(badDef.length === 0, `defending with more crew or blade → never fewer raiders beaten, never fewer of ours left${badDef.length ? ' -> ' + badDef.slice(0, 3).join('; ') : ''} (${n} boardings in the monotonicity checks)`);
  }
  {
    const badA = [];
    const badD = [];
    const badAll = [];
    let n = 0;
    const consistent = (r, a, d) =>
      isInt(r.defLoss) && isInt(r.attLoss) && r.defLoss >= 0 && r.attLoss >= 0 && r.defLoss <= d && r.attLoss <= a &&
      r.defLeft === d - r.defLoss && r.attLeft === a - r.attLoss && r.hullDmg === 2 * r.defLoss;
    for (let a = 0; a <= 25; a++) {
      for (let d = 0; d <= 30; d++) {
        for (const s of [0.3, 0.8, 1, 1.5, 3, 10]) {
          for (const hpFrac of [0, 0.01, 0.5, 1]) {
            const at = attack({ crew: a, crew0: a, blade: s, hpFrac: 1 }, { crew: d, crew0: Math.max(d, 8), grit: 1.1, hpFrac });
            const df = defend({ crew: a, crew0: Math.max(a, 8), grit: s }, { crew: d, crew0: d, blade: 1, hpFrac });
            n += 2;
            if (a >= 1 && at.attLeft < 1) badA.push(`${a} vs ${d} (${s}, ${hpFrac})`);
            if (d >= 1 && (df.defLeft < 1 || df.defLoss > Math.ceil(0.6 * d - 1e-9))) badD.push(`${a} raiders vs ${d} (${s}, ${hpFrac})`);
            if (!consistent(at, a, d) || !consistent(df, a, d) || at.overrun || at.attackerStrikes || df.captured) badAll.push(`${a} vs ${d} (${s}, ${hpFrac})`);
          }
        }
      }
    }
    check(badA.length === 0, `attacking, the player never loses its whole crew (attLoss ≤ crew − 1)${badA.length ? ' -> ' + badA.slice(0, 3).join('; ') : ''}`);
    check(badD.length === 0, `defending, the player never loses its whole crew, nor more than ceil(0.6 × crew)${badD.length ? ' -> ' + badD.slice(0, 3).join('; ') : ''}`);
    check(badAll.length === 0, 'every boarding is whole numbers that add up (losses ≤ crews, left = crew − loss, hull = 2 × defLoss; ' +
      `captured only when the player attacks, overrun / strikes only when an enemy does) (${n} boardings)${badAll.length ? ' -> ' + badAll.slice(0, 3).join('; ') : ''}`);
    // A hopeless boarding still beats 15 % of her crew, and losses use R no lower than 0.5.
    const hopeless = attack(stock(3), enemyOf('manowar', 160));
    const hopelessRaw = C.resolveBoarding(stock(3), enemyOf('manowar', 160), { playerAttacks: false });
    check(f3(hopeless.R) === '0.107' && hopeless.defLoss === 3 && hopelessRaw.attLoss === 3 && hopeless.attLoss === 2,
      `3 hands against a full Man-o'-War (R ${f3(hopeless.R)}): she still loses round(20 × 0.15) = ${hopeless.defLoss}; round(20 × 0.3 / 0.5) = 12 would take all ${hopelessRaw.attLoss} of yours, capped to ${hopeless.attLoss}`);
    // Overrun is R ≥ 1: even odds overrun you.
    const even = defend({ crew: 10, crew0: 12, grit: 1.2 }, stock(8));
    const under = defend({ crew: 10, crew0: 12, grit: 1.2 }, stock(8, 1.0001));
    check(even.R === 1 && even.overrun && under.R < 1 && !under.overrun, `overrun at R ≥ 1 (R ${f3(even.R)}: OVERRUN!; R ${under.R.toFixed(5)}: held)`);
    const raidAll = C.resolveBoarding({ crew: 12, crew0: 12, grit: 1.1 }, { crew: 1, crew0: 12, blade: 1, hpFrac: 1 }, { enemyAttacks: true, playerDefends: false });
    check(raidAll.attLoss <= 12 && raidAll.attLeft >= 0, 'an enemy attacker never loses more hands than it brought');
    const empty = attack(stock(), { crew: 0, crew0: 12, grit: 1.1, hpFrac: 0.5 });
    const emptyOdds = C.boardingOdds(stock(), { crew: 0, crew0: 12, grit: 1.1, hpFrac: 0.5 });
    check(empty.R === Infinity && emptyOdds.R === Infinity && empty.defLoss === 0 && empty.attLoss === 0 && empty.captured && C.previewLabel(empty) === 'capture',
      'a defender with no crew: R = ∞, nobody lost, captured');
    const tiny = attack(stock(), { crew: 1, crew0: 24, grit: 3, hpFrac: 1 });
    check(Number.isFinite(tiny.R) && tiny.R > 0, `R is finite whenever the defender has crew (1 sailor: R ${f3(tiny.R)})`);
  }

  // ------------------------------------------------------------------ previewLabel (§3.3)
  {
    const L = (R, captured = false, opts) => C.previewLabel({ R, captured }, opts);
    check(L(1.199) === 'risky' && L(1.2) === 'fight' && L(0.5) === 'risky' && L(3, true) === 'capture' && L(0.4, true) === 'capture' && L(1.5, false, { surrendered: true }) === 'take' && L(0.1, true, { surrendered: true }) === 'take',
      'previewLabel: R 1.199 RISKY!, R 1.2 FIGHT!, captured CAPTURE! (whatever R), a surrendered target TAKE HER!');
    const at12 = attack(stock(12), { crew: 10, crew0: 24, grit: 1, hpFrac: 1 });
    const below = attack(stock(12, 0.9999), { crew: 10, crew0: 24, grit: 1, hpFrac: 1 });
    check(at12.R === 1.2 && C.previewLabel(at12) === 'fight' && C.previewLabel(below) === 'risky', `on real odds: R ${f3(at12.R)} is FIGHT!, R ${below.R.toFixed(5)} is RISKY!`);
    // The capture boundary: the Phantom left exactly on the notch (captured) or one above it (not).
    const ph = enemyOf('phantom', 1);
    const on = attack(stock(), ph, 0.2);
    const above = attack(stock(), ph, 0.16);
    check(on.defLeft === C.strikeAt(24) && C.previewLabel(on) === 'capture' && above.defLeft === C.strikeAt(24) + 1 && C.previewLabel(above) === 'fight',
      `the capture boundary: ${on.defLeft} left (= notch ${C.strikeAt(24)}) is CAPTURE!, ${above.defLeft} left is FIGHT!`);
  }

  // ------------------------------------------------------------------ gold (§3.7)
  {
    const want = { cutter: 85, privateer: 145, prahu: 105, junk: 185, corsair: 145, manowar: 225, galleon: 525, raider: 125, phantom: 625 };
    const got = Object.fromEntries(Object.keys(want).map((k) => [k, C.captureGold(SHIP_TYPES[k].gold)]));
    const formula = Object.entries(SHIP_TYPES).filter(([, t]) => t.gold !== undefined).every(([, t]) => C.captureGold(t.gold) === t.gold * 20 + 25);
    check(same(got, want) && formula, `captureGold: ${Object.entries(got).map(([k, v]) => `${k} ${v}`).join(', ')} (gold × 20 + 25 for every type)`);
    const sinkVsCapture = Object.keys(want).every((k) => C.captureGold(SHIP_TYPES[k].gold) > 2 * SHIP_TYPES[k].gold * 10);
    check(sinkVsCapture, 'capturing pays more than twice the gold of sinking, for every type');
    const pl = [[0, 0], [3, 0], [4, 1], [100, 25], [241, 60], [-50, 0], [1e6, 250000]];
    const badP = pl.filter(([g, w]) => C.plunderGold(g) !== w);
    check(badP.length === 0, `plunderGold: ${pl.map(([g]) => `${g} → ${C.plunderGold(g)}`).join(', ')}`);
  }

  // ------------------------------------------------------------------ junk in, finite results out
  {
    const hostile = {};
    const KEYS = [
      'crew', 'crew0', 'blade', 'grit', 'hpFrac', 'heave', 'enemyAttacks', 'home', 'playerAttacks', 'playerDefends', 'ammo', 'base', 'dist', 'vx', 'vz',
      'target', 'along', 'shooter', 'rng', 'force', 'h', 'len', 'ghost', 'player', 'critBase', 'enemyRake', 'hpLow', 'maxHp', 'killed', 'R', 'captured',
      'surrendered', 'aspect', 'zone',
    ];
    for (const k of KEYS) {
      Object.defineProperty(hostile, k, { enumerable: true, get() { throw new Error('getter'); } });
    }
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const junk = [undefined, null, NaN, Infinity, -Infinity, -1, 0, -0, 0.5, 1e308, -1e308, 2 ** 53, '12', '', 'round', 'stern', true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n, new Date(0), hostile, proxy];
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
    const fin = (v) => typeof v === 'number' && Number.isFinite(v);
    const okShot = (r) =>
      r && fin(r.dmg) && r.dmg >= 0 && fin(r.rangeMul) && fin(r.aspectMul) && fin(r.critMul) && fin(r.ghostMul) && [null, 'stern', 'bow'].includes(r.aspect) &&
      typeof r.pointBlank === 'boolean' && typeof r.crit === 'boolean' && [null, 'rudder', 'mast', 'keg', 'routed'].includes(r.critEffect) &&
      ['bow', 'mid', 'stern'].includes(r.zone) && isInt(r.crewKill) && r.crewKill >= 0 && typeof r.slow === 'boolean' && Array.isArray(r.tags) && r.tags.every((t) => typeof t === 'string');
    const okBoard = (r) =>
      r && [r.P, r.M, r.D].every((v) => fin(v) && v >= 0) && typeof r.R === 'number' && !Number.isNaN(r.R) && r.R >= 0 &&
      [r.defLoss, r.attLoss, r.defLeft, r.attLeft, r.hullDmg].every((v) => isInt(v) && v >= 0) &&
      [r.captured, r.overrun, r.attackerStrikes].every((v) => typeof v === 'boolean') && (r.R !== Infinity || r.defLoss + r.defLeft === 0);
    const okOdds = (r) => r && [r.P, r.M, r.D].every((v) => fin(v) && v >= 0) && typeof r.R === 'number' && !Number.isNaN(r.R) && r.R >= 0;
    for (const j of junk) {
      const J = show(j);
      tryIt(`rangeMul(${J})`, () => C.rangeMul(j), (r) => fin(r) && r >= 0.75 && r <= 1.25);
      tryIt(`aspectOf(${J})`, () => [C.aspectOf(j, j, j), C.aspectOf(j, 3, 0), C.aspectOf(1, j, 2), C.aspectOf(0, 1, j)], (rs) => rs.every((r) => [null, 'stern', 'bow'].includes(r.aspect) && fin(r.cos) && Math.abs(r.cos) <= 1));
      tryIt(`hitZone(${J})`, () => [C.hitZone(j, j), C.hitZone(j, 9), C.hitZone(2, j)], (rs) => rs.every((r) => ['bow', 'mid', 'stern'].includes(r)));
      tryIt(`critChance(${J})`, () => [C.critChance(j), C.critChance({ critBase: j, aspect: j, dist: j }), C.critChance({ critBase: j, aspect: 'stern', dist: 5 })], (rs) => rs.every((r) => fin(r) && r >= 0 && r <= 0.35));
      tryIt(`ammoUnlocked(${J})`, () => [C.ammoUnlocked(j, j), C.ammoUnlocked('grape', j), C.ammoUnlocked(j, 6)], (rs) => rs.every((r) => typeof r === 'boolean'));
      tryIt(`effectFor(${J})`, () => [C.effectFor(j), C.effectFor({ ammo: j, zone: j })], (rs) => rs.every((r) => ['rudder', 'mast', 'keg', 'routed'].includes(r)));
      tryIt(`shotResult(${J})`, () => C.shotResult(j), okShot);
      const fields = { ammo: 'round', base: 10, dist: 12, vx: 0, vz: 30, target: { h: 0, len: 9.5, ghost: false, boss: false }, along: -3, shooter: { player: true, critBase: 0.06 }, rng: () => 0.5, force: null };
      for (const k of Object.keys(fields)) tryIt(`shotResult({ ${k}: ${J} })`, () => C.shotResult({ ...fields, [k]: j }), okShot);
      for (const k of ['h', 'len', 'ghost', 'boss']) tryIt(`shotResult(target.${k} ${J})`, () => C.shotResult({ ...fields, target: { ...fields.target, [k]: j } }), okShot);
      for (const k of ['player', 'critBase', 'enemyRake']) tryIt(`shotResult(shooter.${k} ${J})`, () => C.shotResult({ ...fields, shooter: { player: k !== 'enemyRake', critBase: 0.06, enemyRake: 0.4, [k]: j } }), okShot);
      tryIt(`shotResult(rng → ${J})`, () => C.shotResult({ ...fields, rng: () => j }), okShot);
      tryIt(`crewNow(${J})`, () => [C.crewNow(j), C.crewNow({ crew0: j, hpLow: j, maxHp: j, killed: j }), C.crewNow({ crew0: 12, hpLow: j, maxHp: 80, killed: 0 }), C.crewNow({ crew0: 12, hpLow: 30, maxHp: j, killed: j })], (rs) => rs.every((r) => isInt(r) && r >= 0 && r <= 1e4));
      tryIt(`strikeAt(${J})`, () => C.strikeAt(j), (r) => isInt(r) && r >= 0);
      const side = { crew: 12, crew0: 12, blade: 1, grit: 1.1, hpFrac: 0.5 };
      tryIt(`boardingOdds(${J})`, () => [C.boardingOdds(j, j, j), C.boardingOdds(side, j), C.boardingOdds(j, side, { heave: j })], (rs) => rs.every(okOdds));
      tryIt(`resolveBoarding(${J})`, () => [C.resolveBoarding(j, j, j), C.resolveBoarding(side, j), C.resolveBoarding(j, side), C.resolveBoarding(side, side, j)], (rs) => rs.every(okBoard));
      for (const k of Object.keys(side)) {
        tryIt(`resolveBoarding(att.${k} ${J})`, () => C.resolveBoarding({ ...side, [k]: j }, side, { heave: 0.04 }), okBoard);
        tryIt(`resolveBoarding(def.${k} ${J})`, () => C.resolveBoarding(side, { ...side, [k]: j }, { enemyAttacks: true, home: true }), okBoard);
      }
      for (const k of ['heave', 'enemyAttacks', 'home', 'playerAttacks', 'playerDefends']) tryIt(`resolveBoarding(opts.${k} ${J})`, () => C.resolveBoarding(side, side, { [k]: j }), okBoard);
      tryIt(`previewLabel(${J})`, () => [C.previewLabel(j, j), C.previewLabel({ R: j, captured: j }), C.previewLabel({ R: 2 }, j)], (rs) => rs.every((r) => ['capture', 'fight', 'risky', 'take'].includes(r)));
      tryIt(`captureGold(${J})`, () => C.captureGold(j), (r) => fin(r) && r >= 25);
      tryIt(`plunderGold(${J})`, () => C.plunderGold(j), (r) => isInt(r) && r >= 0);
      tryIt(`mulberry32(${J})`, () => { const g = C.mulberry32(j); return [g(), g(), g()]; }, (rs) => rs.every((v) => v >= 0 && v < 1));
    }
    const more = problems.length > 6 ? ` (+${problems.length - 6} more)` : '';
    check(problems.length === 0, `${junk.length} kinds of junk (missing, NaN, ±Infinity, huge, strings, arrays, functions, symbols, bigints, throwing getters, proxies) ` +
      `in every argument and field of every function: no throws, finite, well-formed results${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') + more : ''}`);
    // Inputs are never changed.
    const target = Object.freeze({ h: 1, len: 9, ghost: true, boss: false });
    const shooter = Object.freeze({ player: true, critBase: 0.09 });
    const att = Object.freeze({ crew: 12, crew0: 12, blade: 1.2, hpFrac: 1 });
    const def = Object.freeze({ crew: 9, crew0: 12, grit: 1.1, hpFrac: 0.4 });
    let threw = '';
    try {
      C.shotResult(Object.freeze({ ammo: 'grape', base: 10, dist: 8, vx: 0, vz: 1, target, along: 0, shooter, rng: () => 0, force: null }));
      C.resolveBoarding(att, def, Object.freeze({ heave: 0.12 }));
      C.crewNow(Object.freeze({ crew0: 12, hpLow: 3, maxHp: 80, killed: 2 }));
    } catch (e) {
      threw = e.message;
    }
    check(!threw, `inputs are only read, never written (frozen inputs work)${threw ? ' -> ' + threw : ''}`);
  }

  // ------------------------------------------------------------------ "The Kraken Seas" (SPEC3 §4.1, §4.2, §13.1)
  // Appended checks: armourMul, and the six new ship types against the per-type rules above.
  {
    const A = C.armourMul;
    const cases = [
      [null, 0.5, undefined, 0.5], ['stern', 0.5, undefined, 1], ['bow', 0.5, undefined, 1],
      [null, undefined, undefined, 1], ['stern', undefined, undefined, 1], ['bow', undefined, false, 1],
      [null, 0.5, true, 1], ['stern', 0.5, true, 1], [null, 0.5, false, 0.5], [null, 0.5, 'yes', 0.5], [null, 0.5, 1, 0.5],
      [null, 1, undefined, 1], [null, 0, undefined, 0], [null, 0.25, undefined, 0.25],
    ];
    const bad = cases.filter(([aspect, armour, crit, want]) => A(aspect, armour, crit) !== want).map(([a, r, c]) => `(${show(a)}, ${show(r)}, ${show(c)}) → ${A(a, r, c)}`);
    check(typeof A === 'function' && bad.length === 0,
      `armourMul: a beam hit on armour 0.5 → ×0.5, a stern or bow rake ×1, no armour ×1, a crit (crit === true) ×1 (§4.2)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    const armoured = Object.keys(SHIP_TYPES).filter((k) => SHIP_TYPES[k].armour !== undefined);
    check(same(armoured, ['ironclad']) && SHIP_TYPES.ironclad.armour === 0.5 && !('ARMOUR' in C),
      `the armour number lives only on the ship type (ironclad.armour ${SHIP_TYPES.ironclad.armour}); combat.js has no ARMOUR table`);
    // On real shots at an Iron Turtle (heading 0.3, length 11): her beam, the rake boundary, a beam crit.
    const iron = SHIP_TYPES.ironclad;
    const at = (deg, extra = {}) => {
      const h = 0.3;
      const info = C.shotResult({
        ammo: 'round', base: 12, dist: 18, vx: Math.sin(h + deg * DEG) * 30, vz: Math.cos(h + deg * DEG) * 30,
        target: { h, len: iron.len, ghost: false, boss: false }, along: 0, shooter: { player: true, critBase: 0.06 }, force: 'none', ...extra,
      });
      return Math.round(info.dmg * A(info.aspect, iron.armour, info.crit) * 1e9) / 1e9;
    };
    const got = { beam: at(90), stern: at(0), edge: at(36), past: at(37.5), bow: at(180), beamCrit: at(90, { force: 'crit' }) };
    check(got.beam === 6 && got.stern === 24 && got.edge === 24 && got.past === 6 && got.bow === 18 && got.beamCrit === 21,
      `on an Iron Turtle, 12 per ball: beam ${got.beam} (CLANG!), stern rake ${got.stern}, 36° ${got.edge}, 37.5° ${got.past}, bow rake ${got.bow}, a beam crit ${got.beamCrit} (full)`);
    const hostile = new Proxy({}, { get() { throw new Error('proxy'); } });
    const junk = [undefined, null, NaN, Infinity, -Infinity, -0.5, 1.5, 2, '0.5', '', 'mid', 'beam', true, {}, [], () => 1, Symbol('x'), 10n, hostile];
    const badJ = [];
    for (const j of junk) {
      try {
        const vals = [A(j, j, j), A(null, j), A(j, 0.5), A('stern', j, j), A(null, 0.5, j)];
        if (!vals.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) badJ.push(`${show(j)}: ${vals.join(',')}`);
        if (A(null, j) !== (typeof j === 'number' && j >= 0 && j <= 1 ? j : 1)) badJ.push(`armour ${show(j)} → ${A(null, j)}`);
      } catch (e) {
        badJ.push(`${show(j)}: threw ${e.message}`);
      }
    }
    check(badJ.length === 0, `armourMul takes junk: an armour that is not a number in [0, 1] counts as none (×1); never throws, always 0..1${badJ.length ? ' -> ' + badJ.slice(0, 4).join('; ') : ''}`);
  }
  {
    // §4.1: the six new types pass every per-type rule above (crew, notch, hull zones, capture gold, boarding).
    const NEW = { shark: [40, 105], bombketch: [70, 165], ironclad: [120, 265], fireship: [30, 85], skiff: [50, 125], inkheart: [350, 725] };
    const bad = [];
    const rows = [];
    for (const [key, [sunk, captured]] of Object.entries(NEW)) {
      const t = SHIP_TYPES[key];
      if (!t) {
        bad.push(`${key}: missing`);
        continue;
      }
      const why = [];
      if (!(isInt(t.crew) && t.crew >= 1)) why.push(`crew ${t.crew}`);
      if (!(typeof t.grit === 'number' && t.grit > 0)) why.push(`grit ${t.grit}`);
      if (t.gold * 10 !== sunk || C.captureGold(t.gold) !== captured || C.captureGold(t.gold) !== t.gold * 20 + 25) why.push(`gold ${t.gold * 10} / ${C.captureGold(t.gold)}`);
      if (!(C.captureGold(t.gold) > 2 * t.gold * 10)) why.push('capture pays no more than twice sinking');
      if (C.crewNow({ crew0: t.crew, hpLow: 0, maxHp: t.hp, killed: 0 }) <= C.strikeAt(t.crew)) why.push('hull alone reaches the notch');
      if (t.crew - C.crewNow({ crew0: t.crew, hpLow: -t.hp, maxHp: t.hp, killed: 0 }) > Math.floor(t.crew / 2)) why.push('hull takes more than half the crew');
      const e = t.len / 6;
      if (C.hitZone(e + 1e-6, t.len) !== 'bow' || C.hitZone(-e - 1e-6, t.len) !== 'stern' || C.hitZone(0, t.len) !== 'mid') why.push('hit zones');
      const res = C.resolveBoarding({ crew: 12, crew0: 12, blade: 1, hpFrac: 1 }, { crew: t.crew, crew0: t.crew, grit: t.grit, hpFrac: 0.5 }, {});
      if (!(Number.isFinite(res.R) && res.R > 0 && isInt(res.defLoss) && isInt(res.attLoss) && res.attLeft >= 1)) why.push(`boarding ${show(res)}`);
      if (why.length) bad.push(`${key}: ${why.join(', ')}`);
      rows.push(`${t.name} ${sunk}/${captured}`);
    }
    check(bad.length === 0, `the six new types (§4.1): whole crews ≥ 1, hull alone never reaches the notch, three hull zones, gold ×10 sunk / ×20 + 25 captured (${rows.join(', ')}), sane boarding odds${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll combat checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
