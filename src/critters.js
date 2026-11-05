// The island's animals (SPEC4 §7.1): cats, dogs, goats, parrots and an owl, monkeys, crabs and turtles, each species
// one InstancedMesh + its ink twin (volcano.js's method; <= 14 calls), animated through their instance matrices (hop,
// bob, waddle, wag, flap, scuttle). They never block the captain: no blocker, not in folk(), a hop aside within 1.2 u.
//
// createCritters(scene, { reducedMotion }) -> { set(list), update(t, dt, captain), pick(ray) -> i | null,
//   near(captain) -> i | null, react(i), visible(on), dispose() }
//
// STAGE 0 SCAFFOLD: the final API as a null object: no animal is built or drawn. Stage 1 (1Q) builds them.

export function createCritters(scene, opts = {}) {
  return {
    set() {},
    update() {},
    pick: () => null,
    near: () => null,
    react() {},
    visible() {},
    dispose() {},
  };
}
