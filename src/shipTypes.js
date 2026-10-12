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

export const SHIP_TYPES = {
  player: {
    name: 'The Sea Biscuit',
    hp: 120, len: 10, wid: 3.6, maxSpeed: 12, accel: 4, turn: 1.4, reload: 1.5, guns: 3, dmg: 10,
  },

  // Level 1: Coast of Europe
  cutter: {
    name: 'Corsair Cutter',
    hp: 35, len: 7, wid: 2.6, maxSpeed: 10.5, accel: 3.2, turn: 1.3, reload: 2.6, guns: 2, dmg: 4,
    gold: 3, engage: 20, spread: 0.12,
  },
  privateer: {
    name: 'Privateer Brig',
    hp: 80, len: 9.5, wid: 3.3, maxSpeed: 8.5, accel: 2.6, turn: 0.9, reload: 2.4, guns: 3, dmg: 5,
    gold: 6, engage: 22, spread: 0.1,
  },

  // Level 2: Bali
  prahu: {
    name: 'Prahu Raider',
    hp: 35, len: 8, wid: 3.2, maxSpeed: 11, accel: 3.6, turn: 1.5, reload: 2.4, guns: 2, dmg: 4,
    gold: 4, engage: 18, spread: 0.1,
    shallow: true, // shallow draft: not slowed by reefs
  },
  junk: {
    name: 'Dragon Junk',
    hp: 100, len: 11, wid: 3.8, maxSpeed: 7.5, accel: 2.3, turn: 0.8, reload: 2.3, guns: 3, dmg: 4,
    gold: 8, engage: 22, spread: 0.09,
  },

  // Level 3: The Volcano
  corsair: {
    name: 'Ember Corsair',
    hp: 60, len: 9, wid: 3.1, maxSpeed: 11, accel: 3.2, turn: 1.2, reload: 2.6, guns: 2, dmg: 5,
    gold: 6, engage: 20, spread: 0.12,
  },
  manowar: {
    name: "Man-o'-War",
    hp: 160, len: 13, wid: 4.4, maxSpeed: 7, accel: 2.1, turn: 0.7, reload: 2.7, guns: 4, dmg: 5,
    gold: 10, engage: 24, spread: 0.08,
  },
  inferno: {
    name: 'The Molten Maw',
    boss: true,
    hp: 280, len: 16, wid: 5.2, maxSpeed: 6, accel: 1.8, turn: 0.55, reload: 2.8, guns: 6, dmg: 4,
    gold: 20, engage: 25, spread: 0.07,
  },
};

/** z position (along the hull, bow = +z) of gun i on a ship type. */
export function gunOffset(t, i) {
  if (t.guns === 1) return 0;
  const span = t.len * 0.55;
  return -span / 2 + (span * i) / (t.guns - 1) - t.len * 0.03;
}
