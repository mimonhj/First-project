import * as THREE from 'three';

// Level 6, "The Maelstrom" (SPEC2 §6.6): a stormy night at the end of the world.
// Stage 0 placeholder: a valid, empty sea with the level's palette (the whirlpool, Skull Rock, the
// sea stacks, the rain and the lightning bolt arrive in Stage 1). Same contract as europe.js, plus
// `current` (read by the 'current' mechanic) and flash(x, z) (lightning).

export const meta = {
  name: 'The Maelstrom',
  subtitle: 'A stormy night where the sea swallows itself. The Phantom Galleon waits.',
};

export const palette = {
  skyTop: 0x1d1f4a,
  skyHorizon: 0x6e5aa8,
  sunColor: 0xbfd6ff,
  sunDir: [0.3, 0.7, -0.4],
  sunIntensity: 1.3,
  hemiSky: 0x8a86c8,
  hemiGround: 0x1a2033,
  hemiIntensity: 1.2,
  fogColor: 0x3a3a6a,
  fogNear: 70,
  fogFar: 300,
  waterDeep: 0x153a5c,
  waterShallow: 0x2f7f8f,
  waterFoam: 0xd8f2ff,
  waveAmp: 0.8,
  cloudColor: 0x6a6890,
  cloudShade: 0x34304e,
  cloudCount: 18,
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
  root.name = 'env-maelstrom';
  scene.add(root);
  return {
    worldRadius: WORLD_R,
    colliders: [],
    playerStart: { x: 0, z: 0, h: 0 },
    enemySpawns: ring(75, 6),
    reefs: [],
    current: { x: 0, z: 0, r: 75, pull: 3.2, swirl: 2.8, eye: 12, eyeDps: 5 },
    flash(/* x, z */) {}, // a lightning bolt and a sky flash (Stage 1)
    update(/* t, dt, ctx */) {},
    dispose() {
      scene.remove(root);
    },
    group: root,
  };
}
