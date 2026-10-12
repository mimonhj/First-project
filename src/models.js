import * as THREE from 'three';

// Everything is built from boxes and low-segment cylinders with flat shading,
// which, combined with the low-resolution render, gives the blocky pixel look.

const matCache = new Map();
export function mat(color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

// Sail cloth glows slightly so it stays bright even when seen from the shaded side.
const clothCache = new Map();
function clothMat(color) {
  let m = clothCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.45 });
    clothCache.set(color, m);
  }
  return m;
}

const basicCache = new Map();
export function basicMat(color) {
  let m = basicCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    basicCache.set(color, m);
  }
  return m;
}

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = boxGeoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxGeoCache.set(key, g);
  }
  return g;
}

function addBox(group, w, h, d, color, x, y, z, material = mat(color)) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

// Ships are modelled facing +z (bow at +z), deck at about y = 1.2.
export function buildShip(t, isEnemy) {
  const g = new THREE.Group();
  const L = t.len;
  const W = t.wid;

  addBox(g, W * 0.55, 0.8, L * 0.75, t.hull, 0, -0.1, 0); // keel
  addBox(g, W, 1.0, L * 0.85, t.hull, 0, 0.7, -L * 0.02); // hull
  addBox(g, W * 0.7, 0.9, L * 0.15, t.hull, 0, 0.8, L * 0.47); // bow
  addBox(g, W * 0.35, 0.6, L * 0.12, t.hull, 0, 1.0, L * 0.58); // bow tip
  addBox(g, 0.12, 0.12, L * 0.25, 0x5a3a22, 0, 1.4, L * 0.68); // bowsprit
  addBox(g, W * 0.95, 0.06, L * 0.85, 0xc49a6c, 0, 1.22, -L * 0.02); // deck
  for (const s of [-1, 1]) addBox(g, 0.2, 0.35, L * 0.85, t.trim, (s * W) / 2, 1.35, -L * 0.02); // rails
  addBox(g, W, 1.0, L * 0.22, t.hull, 0, 1.7, -L * 0.33); // stern castle
  addBox(g, W * 1.04, 0.16, L * 0.23, t.trim, 0, 2.25, -L * 0.33);

  // Cannon ports along both sides.
  for (let i = 0; i < t.guns; i++) {
    const z = gunOffset(t, i);
    for (const s of [-1, 1]) addBox(g, 0.12, 0.32, 0.45, 0x111111, s * (W / 2 + 0.02), 0.8, z);
  }

  // Masts and sails.
  const mastZ = [[0.05], [0.2, -0.12], [0.28, 0.02, -0.2]][t.masts - 1];
  mastZ.forEach((mz, i) => {
    const z = mz * L;
    const H = (i === 0 && t.masts > 1 ? 0.85 : 1) * (4 + L * 0.35);
    addBox(g, 0.3, H, 0.3, 0x5a3a22, 0, 1.2 + H / 2, z);
    addBox(g, W * 1.4, H * 0.32, 0.12, t.sail, 0, 1.2 + H * 0.45, z + 0.18, clothMat(t.sail));
    addBox(g, W * 1.1, H * 0.24, 0.12, t.sail, 0, 1.2 + H * 0.78, z + 0.18, clothMat(t.sail));
    addBox(g, W * 1.5, 0.12, 0.12, 0x5a3a22, 0, 1.2 + H * 0.62, z + 0.1); // yard
    if (isEnemy) {
      // A blocky skull on the main sail.
      const y = 1.2 + H * 0.45;
      addBox(g, 0.7, 0.6, 0.06, 0xf2f2f2, 0, y + 0.1, z + 0.26);
      addBox(g, 0.4, 0.25, 0.06, 0xf2f2f2, 0, y - 0.3, z + 0.26);
      for (const s of [-1, 1]) addBox(g, 0.16, 0.16, 0.08, 0x111111, s * 0.16, y + 0.12, z + 0.28);
    }
    if (i === mastZ.length - 1 || mastZ.length === 1) {
      addBox(g, 0.06, 0.55, 0.9, t.flag, 0, 1.2 + H + 0.25, z - 0.45, clothMat(t.flag));
    }
  });

  return g;
}

// z position (along the hull) of gun i.
export function gunOffset(t, i) {
  if (t.guns === 1) return 0;
  const span = t.len * 0.55;
  return -span / 2 + (span * i) / (t.guns - 1) - t.len * 0.03;
}

export function buildIsland(r, rng) {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, 1.6, 8), mat(0xe8d28a));
  sand.position.y = 0.2;
  sand.rotation.y = rng() * Math.PI;
  g.add(sand);
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.68, r * 0.8, 1.0, 7), mat(0x4caf50));
  grass.position.y = 1.4;
  grass.rotation.y = rng() * Math.PI;
  g.add(grass);
  if (r > 6) {
    const hill = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.45, 2.2, 6), mat(0x3d8b40));
    hill.position.set((rng() - 0.5) * r * 0.4, 2.9, (rng() - 0.5) * r * 0.4);
    g.add(hill);
  }

  const palms = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < palms; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * r * 0.5;
    const px = Math.cos(a) * d;
    const pz = Math.sin(a) * d;
    const h = 3 + rng() * 1.5;
    addBox(g, 0.4, h, 0.4, 0x8b5a2b, px, 1.9 + h / 2, pz);
    for (let k = 0; k < 4; k++) {
      const leaf = addBox(g, 2.6, 0.25, 0.7, 0x2e8b3a, px, 1.9 + h, pz);
      leaf.rotation.y = (k * Math.PI) / 4 + a;
      leaf.rotation.z = 0.25;
    }
  }
  if (rng() < 0.6) {
    const rock = addBox(g, 1.2, 0.9, 1.0, 0x8a8a8a, r * 0.9, 0.4, (rng() - 0.5) * r);
    rock.rotation.y = rng();
  }
  // A treasure chest, just for looks.
  if (rng() < 0.4) {
    addBox(g, 0.9, 0.6, 0.6, 0x7a4a1a, r * 0.3, 2.2, -r * 0.2);
    addBox(g, 0.95, 0.12, 0.65, 0xffd23f, r * 0.3, 2.3, -r * 0.2);
  }
  return g;
}

// Floating health bar shown above enemy ships.
export function buildHealthBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), basicMat(0x1b1022));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.32), basicMat(0xd7263d));
  fg.position.z = 0.01;
  g.add(bg, fg);
  g.userData.fg = fg;
  return g;
}

export function setHealthBar(bar, ratio) {
  const fg = bar.userData.fg;
  const r = Math.max(0.001, Math.min(1, ratio));
  fg.scale.x = r;
  fg.position.x = -(1 - r) * 1.5;
}
