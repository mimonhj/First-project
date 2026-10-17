import * as THREE from 'three';

// Level 7, "The Turtle Atolls" (SPEC3 §5.4).
// South Seas noon: white-sand atolls round turquoise lagoons, an island shaped like a giant turtle, a
// stilt village with conch-shell roofs and a bruise-purple storm wall to the east where the waterspouts come from.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   spoutLoops (the waterspouts' loops: { cx, cz, rx, rz, w, phase }),
//   update(t, dt, { simTime, camera, hazards }), dispose(), group }
// (hazards: the mechanics' visuals() snapshot: this env draws its own hazards from it.)
//
// STAGE 0 SCAFFOLD: a valid empty sea (the palette, open water, the start in the middle, six enemy spawns and
// four crate spots on a ring of radius 75). Stage 1 builds the level.

export const meta = {
  name: 'The Turtle Atolls',
  subtitle: 'White-sand atolls and turquoise lagoons. Waterspouts dance under the storm wall.',
};

export const palette = {
  skyTop: 0x2f7fe0,
  skyHorizon: 0xbfeff0,
  sunColor: 0xfff4d6,
  sunDir: [0.3, 0.8, 0.4],
  sunIntensity: 2.3,
  hemiSky: 0xd8f4ff,
  hemiGround: 0x4a7a8a,
  hemiIntensity: 1.3,
  fogColor: 0xbfe8e8,
  fogNear: 140,
  fogFar: 380,
  waterDeep: 0x0f7f9a,
  waterShallow: 0x48e0d0,
  waterFoam: 0xffffff,
  waveAmp: 0.6,
  cloudColor: 0xffffff,
  cloudShade: 0xb8c8e0,
  cloudCount: 12,
};

const WORLD_R = 145;
const RING = 75; // the enemy spawns and crate spots stand on this ring round the start

// Points on the ring of radius RING round the start (at the origin, facing +z), at these bearings in
// degrees (x = sin, z = cos, like a heading).
function ring(degs) {
  return degs.map((d) => {
    const a = (d * Math.PI) / 180;
    return { x: Math.round(Math.sin(a) * RING * 1000) / 1000, z: Math.round(Math.cos(a) * RING * 1000) / 1000 };
  });
}

export function build(scene, ctx = {}) {
  const group = new THREE.Group();
  group.name = 'env:atolls';
  scene.add(group);
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: 0 },
    // (any prefix is well spread, the first one ahead of the start)
    enemySpawns: ring([0, 180, 60, 240, 120, 300]),
    reefs: [],
    crateSpots: ring([45, 225, 135, 315]),
    spoutLoops: [],
    update() {},
    dispose() {
      scene.remove(group);
    },
    group,
  };
}
