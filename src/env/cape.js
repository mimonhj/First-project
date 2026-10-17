import * as THREE from 'three';

// Level 8, "The Cape of Storms" (SPEC3 §5.5).
// A stormy orange-violet sunset off a green-and-ochre cape: cliffs with crashing surf, a red-and-white
// lighthouse and a conch-horn tower that sounds before each rogue wave.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   rogueDirs (the directions rogue waves come from, radians, 2–4 from open sea),
//   update(t, dt, { simTime, camera, hazards }), dispose(), group }
// (hazards: the mechanics' visuals() snapshot: this env draws its own hazards from it.)
//
// STAGE 0 SCAFFOLD: a valid empty sea (the palette, open water, the start in the middle, six enemy spawns and
// four crate spots on a ring of radius 75). Stage 1 builds the level.

export const meta = {
  name: 'The Cape of Storms',
  subtitle: 'A stormy sunset off the cape. Rogue waves roll in from the open sea.',
};

export const palette = {
  skyTop: 0x4b3a8f,
  skyHorizon: 0xffb38a,
  sunColor: 0xffc89a,
  sunDir: [-0.6, 0.25, 0.5],
  sunIntensity: 2.0,
  hemiSky: 0xffd8c0,
  hemiGround: 0x3a4a6a,
  hemiIntensity: 1.2,
  fogColor: 0xe8a8a0,
  fogNear: 110,
  fogFar: 340,
  waterDeep: 0x1b5c8c,
  waterShallow: 0x3fc7c9,
  waterFoam: 0xffffff,
  waveAmp: 0.9,
  cloudColor: 0xf0d0e0,
  cloudShade: 0x6a4a7a,
  cloudCount: 16,
};

const WORLD_R = 150;
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
  group.name = 'env:cape';
  scene.add(group);
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: 0 },
    // (any prefix is well spread, the first one ahead of the start)
    enemySpawns: ring([0, 180, 60, 240, 120, 300]),
    reefs: [],
    crateSpots: ring([45, 225, 135, 315]),
    rogueDirs: [],
    update() {},
    dispose() {
      scene.remove(group);
    },
    group,
  };
}
