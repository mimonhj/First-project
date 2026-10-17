import * as THREE from 'three';

// Level 9, "The Kraken's Deep" (SPEC3 §5.6), the finale.
// A moonlit night under a huge low moon, foam that glows cyan, wrecks on their sides and the Kraken Crew's
// lair. The Kraken rises in the krakenArena; setDread(k) darkens the water before the rise, setDawn(k) eases
// the sky to dawn gold once it is driven off.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   krakenArena ({ x, z, r }: open water, r ≥ 60, clear of colliders by 10), setDread(k), setDawn(k),
//   update(t, dt, { simTime, camera, hazards }), dispose(), group }
// (hazards: the mechanics' visuals() snapshot: this env draws its own hazards from it.)
//
// STAGE 0 SCAFFOLD: a valid empty sea (the palette, open water, the start in the middle, six enemy spawns and
// four crate spots on a ring of radius 75). Stage 1 builds the level.

export const meta = {
  name: "The Kraken's Deep",
  subtitle: 'A moonlit sea that glows. The Kraken Crew guards the Deep.',
};

export const palette = {
  skyTop: 0x0f1638,
  skyHorizon: 0x3a3f7a,
  sunColor: 0xcfe0ff,
  sunDir: [0.2, 0.7, -0.5],
  sunIntensity: 1.2,
  hemiSky: 0x7a86c8,
  hemiGround: 0x101833,
  hemiIntensity: 1.2,
  fogColor: 0x232a5a,
  fogNear: 70,
  fogFar: 300,
  waterDeep: 0x0b2a4a,
  waterShallow: 0x1f8f9a,
  waterFoam: 0x9ff7ff,
  waveAmp: 0.75,
  cloudColor: 0x4a5080,
  cloudShade: 0x232a4a,
  cloudCount: 10,
};

const WORLD_R = 140;
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
  group.name = 'env:deep';
  scene.add(group);
  // (k 0..1: the water darkens before the rise; the sky eases to dawn gold. Nothing to change yet.)
  const setDread = () => {};
  const setDawn = () => {};
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: 0 },
    // (any prefix is well spread, the first one ahead of the start)
    enemySpawns: ring([0, 180, 60, 240, 120, 300]),
    reefs: [],
    crateSpots: ring([45, 225, 135, 315]),
    krakenArena: { x: 0, z: 0, r: 60 },
    setDread,
    setDawn,
    update() {},
    dispose() {
      scene.remove(group);
    },
    group,
  };
}
