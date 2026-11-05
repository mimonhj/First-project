import * as THREE from 'three';

// Level 11, "The Sunken Spires" (SPEC4 §2.4).
// Turquoise noon over a drowned city: toppled columns and two arches to sail under, gold domes bobbing like buoys,
// glowing coral gardens, and King Coral, a half-sunk stone king's head with a coral crown. Three coral currents run
// through the city as bands of scrolling foam arrows with silver fish riding them.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   currents (3 polylines, 8 u wide, §2.6), warmables() -> the hidden objects to warm-draw (§14),
//   update(t, dt, { simTime, camera, hazards }), dispose(), group }
// (hazards: the mechanics' visuals() snapshot: this env draws its own hazard visuals from it.)
//
// STAGE 0 SCAFFOLD: a valid empty sea (the palette, open water, the start in the middle, six enemy spawns and
// four crate spots on a ring of radius 75, no hazard data). Stage 1 builds the level.

export const meta = {
  name: 'The Sunken Spires',
  subtitle: 'Turquoise noon over a drowned city. Coral currents run through the streets.',
};

export const palette = {
  skyTop: 0x2a7fd8,
  skyHorizon: 0xc8f4ff,
  sunColor: 0xfffbe8,
  sunDir: [0.2, 0.9, 0.3],
  sunIntensity: 2.4,
  hemiSky: 0xe0f8ff,
  hemiGround: 0x3a6a7a,
  hemiIntensity: 1.35,
  fogColor: 0xbff0f0,
  fogNear: 140,
  fogFar: 400,
  waterDeep: 0x0e8aa0,
  waterShallow: 0x5ff0e0,
  waterFoam: 0xffffff,
  waveAmp: 0.5,
  cloudColor: 0xffffff,
  cloudShade: 0xc0d8e8,
  cloudCount: 12,
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
  group.name = 'env:spires';
  scene.add(group);
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: 0 },
    // (any prefix is well spread, the first one ahead of the start)
    enemySpawns: ring([0, 180, 60, 240, 120, 300]),
    reefs: [],
    crateSpots: ring([45, 225, 135, 315]),
    currents: [],
    // nothing hidden to warm-draw yet
    warmables() {
      return [];
    },
    update() {},
    dispose() {
      scene.remove(group);
    },
    group,
  };
}
