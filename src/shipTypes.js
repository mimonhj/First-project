// Ship registry shared by the models (ships.js) and the game logic (main.js).
//
// Geometry contract for every model built from these:
// - origin at the waterline (y = 0), amidships; the bow points to +z
// - hull length along z is about `len`, overall width (incl. outriggers) about `wid`
// - deck at about y = 1.2 (big ships may go up to 1.8); keel at about y = -0.8
// - cannon ports on both sides at z = gunOffset(type, i), y ≈ 0.8
//
// Gameplay fields: hp, maxSpeed (units/s), accel, turn (rad/s at full speed),
// reload (s per side), guns (per side), dmg (per ball), gold (coins dropped),
// engage (preferred fighting distance), spread (aim error in radians, enemies only),
// shallow (optional: not slowed down by reefs).
// Crew (SPEC2 §3.1, §6.7; enemies only, the player's comes from the tavern): crew (full complement),
// grit (fighting quality in a boarding), boardable (false: can't be grappled), merchant (a treasure
// galleon: never attacks, runs for the escape gates), boarder (a raider that boards you), ghost (the
// Phantom's rules). The galleon, raider and phantom models arrive in Stage 1 of the "Boarders Away!"
// update; until then no level uses them.

export const SHIP_TYPES = {
  player: {
    name: 'The Sea Biscuit',
    hp: 120, len: 10, wid: 3.6, maxSpeed: 12, accel: 4, turn: 1.4, reload: 1.5, guns: 3, dmg: 10,
  },

  // Level 1: Coast of Europe
  cutter: {
    name: 'Corsair Cutter',
    hp: 35, len: 7, wid: 2.6, maxSpeed: 10.5, accel: 3.2, turn: 1.3, reload: 2.6, guns: 2, dmg: 4,
    gold: 3, engage: 20, spread: 0.12, crew: 8, grit: 1.0,
  },
  privateer: {
    name: 'Privateer Brig',
    hp: 80, len: 9.5, wid: 3.3, maxSpeed: 8.5, accel: 2.6, turn: 0.9, reload: 2.4, guns: 3, dmg: 5,
    gold: 6, engage: 22, spread: 0.1, crew: 12, grit: 1.1,
  },

  // Level 2: Bali
  prahu: {
    name: 'Prahu Raider',
    hp: 35, len: 8, wid: 3.2, maxSpeed: 11, accel: 3.6, turn: 1.5, reload: 2.4, guns: 2, dmg: 4,
    gold: 4, engage: 18, spread: 0.1, crew: 9, grit: 1.0,
    shallow: true, // shallow draft: not slowed by reefs
  },
  junk: {
    name: 'Dragon Junk',
    hp: 100, len: 11, wid: 3.8, maxSpeed: 7.5, accel: 2.3, turn: 0.8, reload: 2.3, guns: 3, dmg: 4,
    gold: 8, engage: 22, spread: 0.09, crew: 14, grit: 1.2,
  },

  // Level 3: The Volcano
  corsair: {
    name: 'Ember Corsair',
    hp: 60, len: 9, wid: 3.1, maxSpeed: 11, accel: 3.2, turn: 1.2, reload: 2.6, guns: 2, dmg: 5,
    gold: 6, engage: 20, spread: 0.12, crew: 10, grit: 1.2,
  },
  manowar: {
    name: "Man-o'-War",
    hp: 160, len: 13, wid: 4.4, maxSpeed: 7, accel: 2.1, turn: 0.7, reload: 2.7, guns: 4, dmg: 5,
    gold: 10, engage: 24, spread: 0.08, crew: 20, grit: 1.4,
  },
  inferno: {
    name: 'The Molten Maw',
    boss: true,
    hp: 280, len: 16, wid: 5.2, maxSpeed: 6, accel: 1.8, turn: 0.55, reload: 2.8, guns: 6, dmg: 4,
    gold: 20, engage: 25, spread: 0.07, crew: 24, grit: 1.5,
    boardable: false, // the Molten Maw fights to the end
  },

  // Level 4: Doubloon Bay
  galleon: {
    name: 'Treasure Galleon',
    hp: 140, len: 14, wid: 4.6, maxSpeed: 6.5, accel: 1.8, turn: 0.5, reload: 3.2, guns: 2, dmg: 4,
    gold: 25, engage: 26, spread: 0.14, crew: 14, grit: 0.8,
    merchant: true,
  },

  // Level 5: Frostbite Straits
  raider: {
    name: 'Frost Raider',
    hp: 45, len: 9, wid: 2.8, maxSpeed: 12.5, accel: 4.5, turn: 1.6, reload: 3.0, guns: 1, dmg: 4,
    gold: 5, engage: 9, spread: 0.12, crew: 12, grit: 1.1,
    boarder: true,
    shallow: true,
  },

  // Level 6: The Maelstrom
  phantom: {
    name: 'The Phantom Galleon',
    boss: true,
    hp: 300, len: 17, wid: 5.4, maxSpeed: 6.5, accel: 2, turn: 0.6, reload: 2.6, guns: 6, dmg: 5,
    gold: 30, engage: 24, spread: 0.07, crew: 24, grit: 1.5,
    ghost: true,
  },

  // Voyage III · The Kraken Seas (SPEC3 §4.1). Their behaviours follow these flags on any level
  // (mechanics3.js): ram (the Shark Raider charges), mortar (the Bomb Ketch lobs shells), armour (beam
  // hits × armour, combat.js armourMul), fireship (sails at you and explodes; frost makes her strike),
  // flagship (the Inkheart: ink pots; when she falls her crew flee and the Kraken rises).
  // Level 7: The Turtle Atolls
  shark: {
    name: 'Shark Raider',
    hp: 40, len: 8, wid: 2.6, maxSpeed: 13, accel: 4.5, turn: 1.7, reload: 3.0, guns: 1, dmg: 4,
    gold: 4, engage: 18, spread: 0.12, crew: 8, grit: 1.0,
    ram: true,
  },
  bombketch: {
    name: 'Bomb Ketch',
    hp: 70, len: 9, wid: 3.0, maxSpeed: 6.5, accel: 2.2, turn: 0.8, reload: 3.5, guns: 1, dmg: 3,
    gold: 7, engage: 42, spread: 0.12, crew: 10, grit: 0.9,
    mortar: true,
  },

  // Level 8: The Cape of Storms
  ironclad: {
    name: 'Iron Turtle',
    hp: 150, len: 11, wid: 4.2, maxSpeed: 6, accel: 1.8, turn: 0.7, reload: 2.8, guns: 3, dmg: 6,
    gold: 12, engage: 20, spread: 0.09, crew: 16, grit: 1.3,
    armour: 0.5,
  },
  fireship: {
    name: 'Fire Ship',
    hp: 30, len: 7.5, wid: 2.6, maxSpeed: 11.5, accel: 4, turn: 1.4, reload: 99, guns: 0, dmg: 0,
    gold: 3, engage: 0, spread: 0, crew: 4, grit: 0.8,
    fireship: true,
  },

  // Level 9: The Kraken's Deep
  skiff: {
    name: 'Squid Skiff',
    hp: 40, len: 8, wid: 2.6, maxSpeed: 13, accel: 4.5, turn: 1.7, reload: 3.0, guns: 1, dmg: 4,
    gold: 5, engage: 9, spread: 0.12, crew: 10, grit: 1.1,
    boarder: true,
    shallow: true,
  },
  inkheart: {
    name: 'The Inkheart',
    boss: true,
    hp: 360, len: 17, wid: 5.6, maxSpeed: 7, accel: 2, turn: 0.65, reload: 2.4, guns: 6, dmg: 6,
    gold: 35, engage: 24, spread: 0.07, crew: 26, grit: 1.6,
    flagship: true,
  },
};

/** z position (along the hull, bow = +z) of gun i on a ship type. */
export function gunOffset(t, i) {
  if (t.guns === 1) return 0;
  const span = t.len * 0.55;
  return -span / 2 + (span * i) / (t.guns - 1) - t.len * 0.03;
}
