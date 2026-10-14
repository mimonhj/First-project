import * as THREE from 'three';

// Level 4, "Doubloon Bay" (SPEC2 §6.4): golden hour over Port Doubloon.
// Stage 0 placeholder: a valid, empty sea with the level's palette (the town, the harbour, the
// sandbars, the escape gates and the convoy starts arrive in Stage 1). Same contract as europe.js.

export const meta = {
  name: 'Doubloon Bay',
  subtitle: 'Golden hour over Port Doubloon. Treasure galleons run for the open sea.',
};

export const palette = {
  skyTop: 0x3b6fd6,
  skyHorizon: 0xffc27a,
  sunColor: 0xffd9a0,
  sunDir: [-0.7, 0.3, 0.4],
  sunIntensity: 2.3,
  hemiSky: 0xffe2b8,
  hemiGround: 0x5a6a8a,
  hemiIntensity: 1.3,
  fogColor: 0xffd6a8,
  fogNear: 140,
  fogFar: 380,
  waterDeep: 0x1f6fb5,
  waterShallow: 0x4cc6d8,
  waterFoam: 0xffffff,
  waveAmp: 0.6,
  cloudColor: 0xfff1dc,
  cloudShade: 0xf2b48a,
  cloudCount: 10,
};

const WORLD_R = 150;

// Six spawn points on a ring of radius 75 around the player's start (the middle of the bay).
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
  root.name = 'env-doubloon';
  scene.add(root);
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: Math.PI },
    enemySpawns: ring(75, 6),
    reefs: [], // sandbars (Stage 1)
    escapes: [], // [{ x, z, r }] the gates the treasure galleons run for (Stage 1)
    convoyStarts: [], // [{ x, z, h }] where the galleons set out (Stage 1)
    update(/* t, dt, ctx */) {},
    dispose() {
      scene.remove(root);
    },
    group: root,
  };
}
