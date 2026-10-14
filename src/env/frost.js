import * as THREE from 'three';

// Level 5, "Frostbite Straits" (SPEC2 §6.5): a pastel arctic strait at dawn.
// Stage 0 placeholder: a valid, empty sea with the level's palette (the fjord, the icebergs and the
// drifting ice floes moved by step() arrive in Stage 1). Same contract as europe.js, plus step().

export const meta = {
  name: 'Frostbite Straits',
  subtitle: 'Ice floes, snowy fjords and the longships of the frost raiders.',
};

export const palette = {
  skyTop: 0x5d7fd6,
  skyHorizon: 0xf3e6ff,
  sunColor: 0xffe3f0,
  sunDir: [0.5, 0.25, -0.6],
  sunIntensity: 1.9,
  hemiSky: 0xe9e6ff,
  hemiGround: 0x5a6a9a,
  hemiIntensity: 1.4,
  fogColor: 0xe6ecff,
  fogNear: 90,
  fogFar: 360,
  waterDeep: 0x1d5f9e,
  waterShallow: 0x5fc3e0,
  waterFoam: 0xf4fbff,
  waveAmp: 0.5,
  cloudColor: 0xffffff,
  cloudShade: 0xd8d0f0,
  cloudCount: 12,
};

const WORLD_R = 140;

// Six spawn points on a ring of radius 75 around the player's start.
function ring(r, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r });
  }
  return out;
}

export function build(scene /* , ctx = {} */) {
  const root = new THREE.Group();
  root.name = 'env-frost';
  scene.add(root);
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: 0 },
    enemySpawns: ring(75, 6),
    reefs: [], // the drifting ice floes, { x, z, r, ice: true }, moved in place by step() (Stage 1)
    step(/* simTime, dt */) {}, // gameplay motion in simulated time (main calls it every step)
    update(/* t, dt, ctx */) {},
    dispose() {
      scene.remove(root);
    },
    group: root,
  };
}
