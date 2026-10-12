import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared cartoon ("cel-shaded") look used by every module.
//
// - Surfaces use MeshToonMaterial with a shared 3-tone gradient, so lighting
//   falls into hard bands like a hand-painted cartoon.
// - Dark ink outlines come from three's OutlineEffect (see scenery.js). Each
//   material can tune or disable its outline via `material.userData.outlineParameters`.
// - Prefer rounded, smooth-normal geometry (spheres, capsules, lathes, cylinders,
//   RoundedBoxGeometry). Hard boxes have split normals, which crack the outline at corners.

export const INK = [0.012, 0.008, 0.02]; // outline colour (linear RGB 0..1, near-black ink)
export const OUTLINE_THICKNESS = 0.006; // default line weight (clip-space; constant on screen)

const gradients = new Map();
// A tiny 1D texture with N flat tones; NearestFilter keeps the bands crisp.
export function gradientMap(steps = 3) {
  let tex = gradients.get(steps);
  if (!tex) {
    const data = new Uint8Array(steps * 4);
    for (let i = 0; i < steps; i++) {
      // Tones are biased bright so shadows stay colourful, like animation cels.
      const v = Math.round(255 * (0.55 + (0.45 * i) / Math.max(1, steps - 1)));
      data.set([v, v, v, 255], i * 4);
    }
    tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    gradients.set(steps, tex);
  }
  return tex;
}

const toonCache = new Map();
/**
 * Cached cartoon material.
 * @param {number} color hex colour
 * @param {object} [opts]
 * @param {number} [opts.emissive] hex glow colour (lava, lanterns, windows)
 * @param {number} [opts.emissiveIntensity]
 * @param {boolean|{thickness?:number,color?:number[]}} [opts.outline=true] false disables the ink line
 * @param {boolean} [opts.transparent]
 * @param {number} [opts.opacity]
 * @param {number} [opts.side] THREE.FrontSide / DoubleSide
 * @param {number} [opts.steps=3] number of shading bands
 * @param {boolean} [opts.fog=true]
 */
export function toon(color, opts = {}) {
  const key = JSON.stringify([color, opts]);
  let m = toonCache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(opts.steps ?? 3),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    fog: opts.fog ?? true,
  });
  setOutline(m, opts.outline ?? true);
  toonCache.set(key, m);
  return m;
}

/** Configure (or disable with `false`) the ink outline drawn around a material. */
export function setOutline(material, outline = true) {
  if (outline === false) {
    material.userData.outlineParameters = { visible: false };
  } else {
    const o = outline === true ? {} : outline;
    material.userData.outlineParameters = {
      thickness: o.thickness ?? OUTLINE_THICKNESS,
      color: o.color ?? INK,
      alpha: 1,
      visible: true,
      keepAlive: true,
    };
  }
  return material;
}

/** Disable outlines on a material (sky, ocean, particles, instanced meshes). */
export function noOutline(material) {
  return setOutline(material, false);
}

/**
 * Merge all static meshes under `root` that share a material into one mesh per
 * material, to cut draw calls. Meshes with `userData.keep = true` (animated
 * parts), and anything under such a node, are left alone. Returns `root`.
 * Call once after building a static prop or environment.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const victims = [];
  root.traverse((obj) => {
    if (obj === root) return;
    for (let p = obj; p && p !== root; p = p.parent) if (p.userData.keep) return;
    if (!obj.isMesh || obj.isInstancedMesh || Array.isArray(obj.material)) return;
    const g = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
    // Merged geometries must share attribute sets.
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld));
    const list = groups.get(obj.material) || [];
    list.push(g);
    groups.set(obj.material, list);
    victims.push(obj);
  });
  for (const v of victims) v.parent.remove(v);
  for (const [material, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    root.add(mesh);
  }
  return root;
}

/**
 * Look of a level. Environment modules export one of these; scenery.js applies it.
 * Colours are hex numbers.
 */
export const DEFAULT_PALETTE = {
  skyTop: 0x3a8ee6, // zenith
  skyHorizon: 0xbfe8ff, // near the horizon
  sunColor: 0xfff2d6,
  sunDir: [0.5, 0.8, 0.3], // direction *towards* the sun
  sunIntensity: 2.6,
  hemiSky: 0xcfe9ff,
  hemiGround: 0x4a6a8a,
  hemiIntensity: 1.6,
  fogColor: 0xbfe8ff,
  fogNear: 120,
  fogFar: 320,
  waterDeep: 0x1f7fc4,
  waterShallow: 0x46c3e0,
  waterFoam: 0xffffff,
  waveAmp: 1, // scales wave height (1 = gentle)
  cloudColor: 0xffffff,
  cloudShade: 0xd6e4f5,
  cloudCount: 14,
};
