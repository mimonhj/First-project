// Voyage IV's rules (SPEC4 §2.6, §3.1): the fog banks of Misty Mangroves, the coral currents of the Sunken Spires,
// the ebb tide of Shellback Shoals, and the three new ships' behaviours (the Sting Sloop's stern hold and dance, the
// Net Sloop's nets, the Coral Witch's summons and song), which follow their type flags (kiter, nets, summoner) on
// any level; the warning-shape cap (WARN) and every new word (WORDS4).
//
// Pure: imports nothing (the Node tests load it as a data: URL). main composes it as the third part of
// composeMechanics (mechanics3.js) and passes def.mechanics to all three factories: each keeps the ids it knows.
//
// createMechanics4(ids, ctx) -> { init(), onSpawn(e, waveIndex), onCapture(e), onSink(e), onRemove(e), step(dt),
//   steer(e, dt) -> { h, speed } | null, holdFire(e), drift(s) -> { vx, vz } | null, avoid() -> [{ x, z, r }],
//   shipMods(s) -> { speedMul, capAdd, turnMul, spin }, playerMods() -> { speedMul, turnMul, netted: { t, max } | null },
//   hidden(target, viewer), fogAt(x, z), cut(), cutHold(down), objective(), minimap(), summary(), bonus(),
//   visuals() -> { fog, currents, tide, nets, songs, summons }, get state, dispose() }
// ctx = main's ctx3 (hold() included) + { warn: { take(kind), give(kind), boss }, cutHold() -> s, spyglass() -> u,
//   summon(kind, x, z, n, owner), puffersAlive() -> n, tables: { RAIDERS, STATUS } }
//
// STAGE 0 SCAFFOLD: the final API (SPEC4 §11.1) as a null object that keeps only its own ids and does nothing (no
// fog, no current, no tide, no net). Stage 1 (1B) writes the rules.

export const MECHANIC4_IDS = Object.freeze(['fog', 'currents', 'tide']);

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

// The ships' behaviours (§3.1) and the hazards (§2.6): Stage 1 fills these tables (each number lives in one).
export const STINGER = freeze({});
export const NET = freeze({});
export const WITCH = freeze({});
export const FOG = freeze({});
export const CURRENT = freeze({});
export const TIDE = freeze({});
// §0.1: at most 6 warning shapes on screen (a new one, and its attack, waits for a free slot) and at most 2 of the
// Shellback's attacks telegraphed at once (the only home of that cap: the Shellback reads it as ctx.warn.boss).
export const WARN = freeze({ max: 6, boss: 2 });
// Every new pop, hint and live-region word (the foes and the Shellback read it through ctx.tables).
export const WORDS4 = freeze({});

const IDENTITY = Object.freeze({ speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 });
const NO_PLAYER_MODS = Object.freeze({ speedMul: 1, turnMul: 1, netted: null });
const NO_VISUALS = Object.freeze({ fog: Object.freeze([]), currents: Object.freeze([]), tide: null, nets: Object.freeze([]), songs: Object.freeze([]), summons: Object.freeze([]) });

export function createMechanics4(ids, ctx) {
  const mine = (Array.isArray(ids) ? ids : []).filter((id) => MECHANIC4_IDS.includes(id));
  const noop = () => {};
  return {
    init: noop,
    onSpawn: noop,
    onCapture: noop,
    onSink: noop,
    onRemove: noop,
    step: noop,
    steer: () => null,
    holdFire: () => false,
    drift: () => null,
    avoid: () => [],
    shipMods: () => IDENTITY,
    playerMods: () => NO_PLAYER_MODS,
    hidden: () => false,
    fogAt: () => false,
    cut: () => false,
    cutHold: noop,
    objective: () => null,
    minimap: () => [],
    summary: () => [],
    bonus: () => 0,
    visuals: () => NO_VISUALS,
    get state() {
      return { ids: [...mine] };
    },
    dispose: noop,
  };
}
