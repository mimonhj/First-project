// The tavern's Sea Guide (SPEC4 §8.7): one card per foe kind of the whole game (the 16 enemy ship types of Voyages
// I–III, the Kraken, Voyage IV's seven kinds and the Shellback), each with its icon, its name, "What it does" and "How
// to beat it" in one line each; unmet kinds show a "?" silhouette with "Not met yet".
//
// Pure: imports nothing (the Node tests load it as a data: URL). The names are shipTypes.js's and foes4.js's (the
// Node test checks they agree); the counters say what the meet cards (§3.1) and the levels' rumours say.
//
// GUIDE: [{ id, name, icon, does, beat, from, ... }], guideFor(met, unlocked, counts?) -> [{ ...card, seen, beaten }]
//
// A card: id (a SHIP_TYPES key, 'kraken', or a Voyage IV kind of pools.js's V4_KINDS), name, icon (the picture's key
// for the tavern panel: 'ship' for every ship type, the kind's own id for the creatures, the forts and the bosses
// that are not ships), colour (the kind's colour, a CSS hex: §3.1 gives each new kind one no other enemy uses), does
// and beat (one line each, ≤ 90 characters), from (the level where it is first met), voyage (1..4), kind ('ship' |
// 'boss' (a boss ship) | 'monster' | 'pack' | 'fort'), and v4 (true: whether it has been met is voyage4.met's bit).

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

/** The words an unmet card shows in place of its own (with a "?" silhouette). */
export const NOT_MET = 'Not met yet';

/** Voyage IV's kinds in voyage4.met's bit order (pools.js V4_KINDS: met bit 1 << i). */
const V4_ORDER = ['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'fort', 'shellback'];

const card = (id, name, icon, colour, from, kind, does, beat) => ({ id, name, icon, colour, does, beat, from, voyage: from >= 10 ? 4 : from >= 7 ? 3 : from >= 4 ? 2 : 1, kind, v4: V4_ORDER.includes(id) });

/** §8.7: the cards in the order the guide lists them (the order you meet them in, level by level). */
export const GUIDE = freeze([
  // Voyage I · The Seven Seas
  card('cutter', 'Corsair Cutter', 'ship', '#c0392b', 1, 'ship', 'A quick little pirate ship with two guns a side.', 'Turn side-on and fire your broadside first!'),
  card('privateer', 'Privateer Brig', 'ship', '#2c3e7a', 1, 'ship', 'A sturdy brig with three guns a side.', 'Keep your side to her and fire. Chain shot slows her down.'),
  card('prahu', 'Prahu Raider', 'ship', '#d98a1e', 2, 'ship', 'Skims right over the light coral that slows your keel.', 'Stay in deep water and let her come to you.'),
  card('junk', 'Dragon Junk', 'ship', '#b8322a', 2, 'ship', 'A big, tough ship that soaks up cannonballs.', 'Keep firing from the side and dodge her broadsides.'),
  card('corsair', 'Ember Corsair', 'ship', '#e2572b', 3, 'ship', 'A fast fighter from the volcano seas.', 'Grape shot thins her crew. Then board her for gold!'),
  card('manowar', "Man-o'-War", 'ship', '#3b3442', 3, 'ship', 'A giant warship with four guns a side.', 'Stay out of her broadside and hit her bow or stern.'),
  card('inferno', 'The Molten Maw', 'ship', '#ff6a1a', 3, 'boss', 'A blazing boss ship, far too hot to board.', 'Sink her! Steer out of the red lava circles.'),
  // Voyage II · The Far Seas
  card('galleon', 'Treasure Galleon', 'ship', '#e2b13c', 4, 'ship', 'Runs for the open sea with a hold full of gold.', 'Catch her, thin her crew and board her for a fortune.'),
  card('raider', 'Frost Raider', 'ship', '#7fb8e0', 5, 'ship', 'Rows up close and throws ropes to board you.', 'Cut her ropes fast! Chain shot slows her longship.'),
  card('phantom', 'The Phantom Galleon', 'ship', '#7ad9c8', 6, 'boss', 'A ghost ship that round shot barely scratches.', 'Scatter her ghost crew with grape shot, then board her.'),
  // Voyage III · The Kraken Seas
  card('shark', 'Shark Raider', 'ship', '#5f7a8a', 7, 'ship', 'Charges at you bow first to ram.', 'Turn aside when she charges. Frost shot takes her bite away.'),
  card('bombketch', 'Bomb Ketch', 'ship', '#8a5a2b', 7, 'ship', 'Lobs mortar shells at you from far away.', 'Steer out of the red circles, then sail in close.'),
  card('ironclad', 'Iron Turtle', 'ship', '#4a5a4a', 8, 'ship', 'Iron sides shrug off a broadside.', 'Rake her bow or stern, or set her alight with fire shot.'),
  card('fireship', 'Fire Ship', 'ship', '#2b2b2b', 8, 'ship', 'Sails right at you and explodes.', 'Sink her far away, or freeze her and she gives up.'),
  card('skiff', 'Squid Skiff', 'ship', '#6a3b8a', 9, 'ship', 'A fast little boat that boards you.', 'Cut her ropes fast! Chain shot slows her down.'),
  card('inkheart', 'The Inkheart', 'ship', '#4b2a6b', 9, 'boss', "The Kraken Crew's flagship lobs sticky ink pots.", 'Keep moving! Beat her, and then the Kraken rises.'),
  card('kraken', 'The Kraken', 'kraken', '#8a3b8a', 9, 'monster', 'A giant sea monster that slams and grabs ships.', 'Steer out of its warnings. Stink shot makes it let go!'),
  // Voyage IV · The Sunset Isles
  card('jolly', 'Monkey Jollyboats', 'jolly', '#f2c230', 10, 'pack', 'Little boats of cheeky monkeys throwing coconuts.', 'Grape shot tips them over. Steer out of the brown circles!'),
  card('stinger', 'Sting Sloop', 'stinger', '#f2c230', 10, 'ship', 'A fast sloop that hides behind you.', 'Turn to get her in your sights, or chain shot her!'),
  card('netsloop', 'Net Sloop', 'netsloop', '#1f6b3a', 10, 'ship', 'Throws a big net that slows you down.', 'Steer out of the white net. Netted? Cut it, and you are free!'),
  card('puffer', 'Puffer Mines', 'puffer', '#f28a1e', 11, 'monster', 'Spiky puffers that puff up and pop near ships.', 'Pop them from far away, before they puff!'),
  card('witch', "Coral Witch's Barge", 'witch', '#f27a8a', 11, 'ship', 'Calls up puffers and mends her fleet with a song.', 'Sink or board her first! Stink shot hushes her.'),
  card('coilback', 'Old Coilback', 'coilback', '#2f9e8a', 11, 'monster', 'A grumpy sea serpent that dives and lunges.', "Steer out of the green lane, then hit its head while it's dizzy!"),
  card('fort', 'Rock Fort', 'fort', '#d9b07a', 12, 'fort', 'A stone fort that fires along its red line.', 'Change course when the red line points at you. Knock it down!'),
  card('shellback', 'The Shellback', 'shellback', '#e2483d', 12, 'monster', 'The sleepy island in the bay wakes up: a giant crab!', 'Knock down its towers first, and dodge its claws.'),
]);

const level = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 1);
const bits = (v) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v & 0xff : 0);
const counted = (counts, id) => {
  try {
    if (!counts || typeof counts !== 'object' || !Object.prototype.hasOwnProperty.call(counts, id)) return null;
    const n = counts[id];
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? Math.min(n, 9999) : null;
  } catch {
    return null; // a throwing getter or a hostile proxy
  }
};

/**
 * The cards for this save, in GUIDE's order, each { ...card, seen, beaten }: seen is voyage4.met's bit for a Voyage IV
 * kind (met: 0..255, bit 1 << V4_KINDS.indexOf(id)), and for every earlier kind true once its level is open (unlocked:
 * the highest level open); beaten is counts[id] when the save counts it (counts: an optional { id: n }, e.g.
 * feats.prizes for the ships captured and the Kraken's feat), else null ("Beaten ×N" where counted). Junk is a fresh
 * save: nothing met, level 1 open, nothing counted. A fresh array every call.
 */
export function guideFor(met, unlocked, counts) {
  const m = bits(met);
  const u = level(unlocked);
  return GUIDE.map((c) => ({ ...c, seen: c.v4 ? (m & (1 << V4_ORDER.indexOf(c.id))) !== 0 : u >= c.from, beaten: counted(counts, c.id) }));
}
