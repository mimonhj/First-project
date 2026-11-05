import * as THREE from 'three';

// Level 10, "Misty Mangroves" (SPEC4 §2.3).
// A green-gold dusk in a mangrove maze: islets on arching roots, the Banyan Arch over the main channel, a lantern-lit
// stilt village, lily pads with frogs, hanging moss, a monkey temple ruin, fireflies, and slow banks of white fog
// drifting through the channels.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   fogLoops (the fog banks' loops, §2.6), warmables() -> the hidden objects to warm-draw (§14),
//   update(t, dt, { simTime, camera, hazards }), dispose(), group }
// (hazards: the mechanics' visuals() snapshot: this env draws its own hazard visuals from it.)
//
// STAGE 0 SCAFFOLD: a valid empty sea (the palette, open water, the start in the middle, six enemy spawns and
// four crate spots on a ring of radius 75, no hazard data). Stage 1 builds the level.

export const meta = {
  name: 'Misty Mangroves',
  subtitle: 'A green-gold dusk in a mangrove maze. Fog banks drift through the channels.',
};

export const palette = {
  skyTop: 0x2f4f6f,
  skyHorizon: 0xf2c66b,
  sunColor: 0xffd89a,
  sunDir: [-0.5, 0.3, 0.6],
  sunIntensity: 2.0,
  hemiSky: 0xd8e8b8,
  hemiGround: 0x3a4a2a,
  hemiIntensity: 1.25,
  fogColor: 0xc8d8a8,
  fogNear: 90,
  fogFar: 320,
  waterDeep: 0x1f5a4a,
  waterShallow: 0x5fb08a,
  waterFoam: 0xf4ffe0,
  waveAmp: 0.4,
  cloudColor: 0xffe8c0,
  cloudShade: 0x8a7a6a,
  cloudCount: 10,
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
  group.name = 'env:mangroves';
  scene.add(group);
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: 0 },
    // (any prefix is well spread, the first one ahead of the start)
    enemySpawns: ring([0, 180, 60, 240, 120, 300]),
    reefs: [],
    crateSpots: ring([45, 225, 135, 315]),
    fogLoops: [],
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
