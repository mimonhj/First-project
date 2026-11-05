import * as THREE from 'three';

// Level 12, "Shellback Shoals" (SPEC4 §2.5), the finale.
// A coral-pink sunset over golden sandbanks, giant shells and whale ribs; Rock Forts on sea stacks with red flags;
// and in the middle of the bay a crab-shaped island with a ruined fort on its back: the sleeping Shellback, with a
// stream of snore bubbles rising beside it every few seconds.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   tideBars (4 sandbars, §2.6), fortSpots (sea stacks for the Rock Forts), shellbackLair { x, z, r }, shellbackArena
//   { x, z, r }, setAwake(k) (sand slides off the crab island, k 0..1), setCalm(k) (the sky eases to a golden
//   evening with a soft rainbow), warmables() -> the hidden objects to warm-draw (§14),
//   update(t, dt, { simTime, camera, hazards }), dispose(), group }
// (hazards: the mechanics' visuals() snapshot: this env draws its own hazard visuals from it.)
//
// STAGE 0 SCAFFOLD: a valid empty sea (the palette, open water, the start in the middle, six enemy spawns and
// four crate spots on a ring of radius 75, no hazard data). Stage 1 builds the level.

export const meta = {
  name: 'Shellback Shoals',
  subtitle: 'A coral-pink sunset over golden sandbanks. The island in the bay… snores.',
};

export const palette = {
  skyTop: 0x5a3a8a,
  skyHorizon: 0xffa88a,
  sunColor: 0xffc0a0,
  sunDir: [0.6, 0.2, -0.5],
  sunIntensity: 2.1,
  hemiSky: 0xffd8d0,
  hemiGround: 0x4a3a5a,
  hemiIntensity: 1.25,
  fogColor: 0xf0b8b0,
  fogNear: 110,
  fogFar: 360,
  waterDeep: 0x1a5a8a,
  waterShallow: 0x4fd0c8,
  waterFoam: 0xfff4ec,
  waveAmp: 0.7,
  cloudColor: 0xffd0e0,
  cloudShade: 0x7a5a8a,
  cloudCount: 14,
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
  group.name = 'env:shoals';
  scene.add(group);
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: 0 },
    // (any prefix is well spread, the first one ahead of the start)
    enemySpawns: ring([0, 180, 60, 240, 120, 300]),
    reefs: [],
    crateSpots: ring([45, 225, 135, 315]),
    tideBars: [],
    fortSpots: [],
    // (the sleeping island: in the bay ahead of the start, its keep-off ring r 12; the arena, open water round it)
    shellbackLair: { x: 0, z: 40, r: 12 },
    shellbackArena: { x: 0, z: 40, r: 70 },
    setAwake() {},
    setCalm() {},
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
