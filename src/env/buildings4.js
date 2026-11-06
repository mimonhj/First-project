// The eleven new buildings' art (SPEC4 §4.1, §4.3): tiers 1-3 of the Treehouse, the Houseboat Moorings, the Hilltop
// Villa, the Blacksmith's Forge, the Fishing Hut, the Goat Farm, the Music Hall, the Trophy Museum, the
// Observatory, the Aquarium and the Mermaid Grotto (and tier 0 for the islet plots: a sand outline and the "Build
// me!" board), each built in its plot's frame within its pad (islandPlan's PADS) from the town's own parts and
// colours (sparrow's frozen `kit`), each from a stream of its own per (plot, tier), so a building always looks the
// same whenever it is built. sparrow bakes them into the development layer's second half.
//
// kit(id, tier, kitHelpers) -> Group, info(id, tier) -> { footprint, eave, top, door, porch }
//
// The frame. A kit is built in its plot's frame: +z its front (the board's side), x across, and y = 0 the deck it
// stands on, so sparrow adds the group to the plot's frame (its platform's group) at y = the deck's height. On the
// two islets the origin is the pad's centre at its highest ground point (sparrow / districts.js place it): the
// islet kits stand on a plinth of their own that reaches 2.4 u below 0 (the Villa on the hill's shoulder) or into
// the sea (the Grotto's rocks), so a slope or the shore under a pad is covered. Every vertex above y = 0.3 lies
// inside info(id, tier).footprint, which lies 0.2 u inside the plot's pad (PADS: the seven pad limits and the four
// islet pads), so the pad (the tier-3 footprint + 0.2 u) never outgrows PADS.
//
// The group's meshes are plain toon meshes made with the kit's materials (ink / thin / flat, and emissive window and
// lantern glows), for sparrow's devChunk to bake: nothing in it is shared with the town but the kit's cached
// geometries and materials, and nothing draws the town's rand(). Extras ride on group.userData (none is a child, so
// devChunk never bakes them):
// - anim: [{ id, group, update(t, dt) }] the tier's animated parts (§4.3: the forge's glow, the water wheel, the
//   observatory's dome, the aquarium's water shimmer, the music notes, the windpump), each one mesh (or one
//   InstancedMesh) with no ink outline, so one draw call each; `group` is in the kit's frame (add it to the plot's
//   frame like the kit) and `update(t, dt)` animates it (visual time; glows and pulses <= 1 Hz). A new array per kit()
//   call: keep the parts of the tier standing now.
// - smoke: [{ x, y, z, s, colors }] chimney smoke sources in the kit's frame (sparrow's smoke puffs).
// - moored: { group, x, z, ry, smoke } on the Houseboat Moorings at tiers 2-3: the barge with its cabin, moored
//   alongside the platform (§4.1: "its barge moored alongside in the water"), its origin at the waterline, placed at
//   (x, z) turned ry in the plot frame (y = the sea), outside the pad: scenery that bobs like the town's boats.
//   It holds the gangplank and the mooring lines that reach the posts on the deck.
// kit(id, 0) for the seven shack plots is an empty group (their tier 0 is today's shack, sparrow's kit0).
// If the kit carries board(parent, x, y, z, ry) (sparrow's painted "Build me!" board), the islets' tier-0 boards
// use it; until then they are drawn here (the same post and plank, a painted hammer on a cream face).

const PI = Math.PI;
const TAU = PI * 2;

// The plots: forge s4, music s5, fishing s9, farm s10, museum s11, aquarium s12, homeF s17 (each within its pad
// limit in PADS), homeE and grotto on Sunset Beach, homeG and observatory on Lookout Hill (the islet pads, centred).
// The islet plots have a tier 0 of their own.
const ISLET = { homeE: true, homeG: true, observatory: true, grotto: true };

// ---------------------------------------------------------------------------
// The kit of the call being built (sparrow's frozen art helpers) and its THREE
// ---------------------------------------------------------------------------
let K = null;
let T = null;
let C = null; // the town's colours
let SMOKE = null; // { obj, local, s, colors } collected while building
let ANIM = null;
let ROOT = null;

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const r3 = (v) => Math.round(v * 1000) / 1000;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const ink = (c) => K.ink(c);
const thin = (c) => K.thin(c);
const flat = (c) => K.flat(c);
const add = (...a) => K.add(...a);
const rbox = (w, h, d, r = 0.08, seg = 1) => K.rbox(w, h, d, r, seg);
const cyl = (rt, rb, h, seg = 12, open = false) => K.cyl(rt, rb, h, seg, open);
const sph = (seg = 10) => K.sphere(seg);
const box = (w, h, d) =>
  cached(`bx${r3(w)},${r3(h)},${r3(d)}`, () => {
    const g = new T.BoxGeometry(w, h, d);
    g.deleteAttribute('uv');
    return g;
  });
const cone = (r, h, seg = 12) => cached(`co${r3(r)},${r3(h)},${seg}`, () => new T.ConeGeometry(r, h, seg));
const torus = (R, r, ts = 18, rs = 6, arc = TAU) => cached(`to${r3(R)},${r3(r)},${ts},${rs},${r3(arc)}`, () => new T.TorusGeometry(R, r, rs, ts, arc));
function lathe(key, profile, seg = 16) {
  return cached(`la:${key}:${seg}`, () => {
    const pts = profile[0][1] > profile[profile.length - 1][1] ? profile.slice().reverse() : profile;
    return new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg);
  });
}
/** A flat extruded shape from 2-D points (xy plane, depth along z, centred on z = 0). */
function slab(key, pts, depth, bevel = 0.02) {
  return cached(`sl:${key}:${r3(depth)}:${r3(bevel)}`, () => {
    const sh = new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y)));
    const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    g.deleteAttribute('uv');
    return g;
  });
}
const domeGeo = (seg = 16) => cached(`dome${seg}`, () => new T.SphereGeometry(1, seg, Math.max(4, seg >> 1), 0, TAU, 0, PI / 2));

/** Lighter (k > 0) or darker (k < 0) version of an sRGB hex colour (as sparrow's shade). */
function shade(hex, k) {
  const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return (f((hex >> 16) & 255) << 16) | (f((hex >> 8) & 255) << 8) | f(hex & 255);
}

// The glows: plain emissive toon materials with no outline (devChunk bakes their emissive light into the layer's
// glow attribute, so a lit window needs no mesh of its own). One cached material per look.
const glowCache = new Map();
function glow(color, emissive, k) {
  const key = `${color},${emissive},${k}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new T.MeshToonMaterial({ color, emissive, emissiveIntensity: k });
    m.name = 'buildings4:glow';
    m.userData.outlineParameters = { visible: false };
    glowCache.set(key, m);
  }
  return m;
}
const winGlow = () => glow(0xffd36b, 0xffb43c, 0.75); // as sparrow's WINDOW_GLOW
const lampGlow = () => glow(0xffc04a, 0xffa526, 1.1); // as sparrow's lanternGlow
const paperGlow = () => glow(0xffa64a, 0xff7a1a, 0.9); // Lantern Lane's paper lanterns
const pearlGlow = () => glow(0xdff4ff, 0x9fd8ff, 0.55);
const blueGlow = () => glow(0x8fe0ff, 0x3fb8ff, 0.8);
// the forge's coals: a material of its own, pulsing (one forge)
let coalMat = null;
function coalGlow() {
  if (!coalMat) {
    coalMat = new T.MeshToonMaterial({ color: 0xff8a3a, emissive: 0xff5a14, emissiveIntensity: 1.0 });
    coalMat.name = 'buildings4:forge-glow';
    coalMat.userData.outlineParameters = { visible: false };
  }
  return coalMat;
}

function sub(parent, x, y, z, ry = 0) {
  const g = new T.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}
function puff(obj, x, y, z, s = 0.6, colors = null) {
  SMOKE.push({ obj, local: V(x, y, z), s, colors });
}

// ---------------------------------------------------------------------------
// Parts (sparrow's look: rounded boards, ink outlines on the big shapes, thin ink on trim)
// ---------------------------------------------------------------------------
const FLOWERS = [0xe2383d, 0xf58fb0, 0xffd84a, 0xfaf6ee, 0x9b6fd6, 0xff9a3c];

/** A window in a wall facing +z: frame, glass (lit or dark), glazing bars, shutters and a flower box. */
function pane(g, x, y, z, w, h, lit, shutter, flowerBox = true, k = 0) {
  add(g, rbox(w + 0.2, h + 0.2, 0.1, 0.04), ink(C.woodDeep), x, y, z + 0.02);
  add(g, rbox(w, h, 0.1, 0.03), lit ? winGlow() : ink(C.glass), x, y, z + 0.05);
  add(g, box(0.05, h, 0.12), thin(C.woodDeep), x, y, z + 0.07);
  add(g, box(w, 0.05, 0.12), thin(C.woodDeep), x, y, z + 0.07);
  if (shutter !== null && shutter !== undefined) {
    for (const s of [-1, 1]) {
      const sh = add(g, rbox(w * 0.48, h + 0.08, 0.06, 0.03), ink(shutter), x + s * (w * 0.74 + 0.1), y, z + 0.16);
      sh.rotation.y = s * 0.4;
    }
  }
  if (flowerBox) {
    add(g, rbox(w + 0.14, 0.18, 0.26, 0.04), ink(C.wood2), x, y - h / 2 - 0.14, z + 0.16);
    const n = Math.max(3, Math.round(w / 0.2));
    for (let i = 0; i < n; i++) add(g, sph(8), ink(FLOWERS[(i + k) % FLOWERS.length]), x - w / 2 + (w * (i + 0.5)) / n, y - h / 2 - 0.01 + (i % 2) * 0.04, z + 0.2, 0, 0, 0, 0.1);
    for (let i = 0; i < n - 1; i++) add(g, sph(6), ink(C.leaf), x - w / 2 + (w * (i + 1)) / n, y - h / 2 - 0.05, z + 0.26, 0, 0, 0, [0.09, 0.06, 0.07]);
  }
}
/** A flush window (frame, glass, bars) standing at most 0.07 u out of its wall: for walls at a footprint's edge. */
function flushWin(g, x, y, z, w, h, lit, frame = C.woodDeep) {
  add(g, rbox(w + 0.14, h + 0.14, 0.06, 0.025), ink(frame), x, y, z + 0.01);
  add(g, rbox(w, h, 0.06, 0.02), lit ? winGlow() : ink(C.glass), x, y, z + 0.025);
  add(g, box(0.04, h, 0.04), thin(frame), x, y, z + 0.05);
  add(g, box(w, 0.04, 0.04), thin(frame), x, y, z + 0.05);
}
/** A round window (porthole) facing +z. */
function porthole(g, x, y, z, r, lit, rim = C.brass) {
  add(g, torus(r, r * 0.22, 12, 4), ink(rim), x, y, z + 0.03);
  add(g, cyl(r, r, 0.05, 14), lit ? winGlow() : ink(C.glass), x, y, z + 0.01, PI / 2);
}
/** A door in a wall facing +z (its foot at y = 0): frame, a round-topped door, a knob and a step. */
function doorway(g, x, z, col, w = 0.8, h = 1.6, step = true) {
  add(g, rbox(w + 0.2, h + 0.12, 0.1, 0.04), ink(C.woodDeep), x, 0.1 + h / 2, z + 0.03);
  add(g, rbox(w, h, 0.12, 0.05), ink(col), x, 0.06 + h / 2, z + 0.06);
  add(g, cyl(w / 2 + 0.1, w / 2 + 0.1, 0.1, 14, false), ink(C.woodDeep), x, 0.1 + h, z + 0.03, PI / 2, 0, 0, [1, 1, 0.55]);
  add(g, cyl(w / 2, w / 2, 0.12, 14), ink(col), x, 0.06 + h, z + 0.06, PI / 2, 0, 0, [1, 1, 0.5]);
  add(g, sph(8), ink(C.brass), x + w * 0.3, 0.06 + h * 0.5, z + 0.15, 0, 0, 0, 0.06);
  if (step) add(g, rbox(w + 0.3, 0.1, 0.32, 0.03), ink(C.wood3), x, 0.05, z + 0.18);
}
/** Walls of a storey (w x d, h tall, its floor at y): board-and-batten, clapboard, stone or brick, corner posts. */
function storey(g, w, d, h, y, col, o = {}) {
  add(g, rbox(w, h, d, 0.1, 2), ink(col), 0, y + h / 2, 0);
  const bat = thin(shade(col, o.stone ? -0.16 : -0.18));
  if (o.clap) {
    for (let yy = y + 0.3; yy < y + h - 0.15; yy += 0.3) {
      add(g, box(w - 0.06, 0.05, 0.05), bat, 0, yy, d / 2 + 0.01);
      add(g, box(w - 0.06, 0.05, 0.05), bat, 0, yy, -d / 2 - 0.01);
      for (const sx of [-1, 1]) add(g, box(0.05, 0.05, d - 0.06), bat, sx * (w / 2 + 0.01), yy, 0);
    }
  } else if (o.stone) {
    // ashlar courses: a line every 0.32 and staggered joints
    let row = 0;
    for (let yy = y + 0.32; yy < y + h - 0.1; yy += 0.32, row++) {
      add(g, box(w + 0.01, 0.035, d + 0.01), bat, 0, yy, 0);
      for (let x = -w / 2 + (row % 2 ? 0.35 : 0.65); x < w / 2 - 0.15; x += 0.7) {
        add(g, box(0.035, 0.3, 0.03), bat, x, yy - 0.16, d / 2 + 0.005);
        add(g, box(0.035, 0.3, 0.03), bat, x, yy - 0.16, -d / 2 - 0.005);
      }
    }
  } else if (!o.plain) {
    for (let bx = -w / 2 + 0.45; bx < w / 2 - 0.3; bx += 0.5) {
      add(g, box(0.07, h - 0.2, 0.05), bat, bx, y + h / 2, d / 2 + 0.02);
      add(g, box(0.07, h - 0.2, 0.05), bat, bx, y + h / 2, -d / 2 - 0.02);
    }
    for (const sx of [-1, 1]) for (let bz = -d / 2 + 0.45; bz < d / 2 - 0.3; bz += 0.5) add(g, box(0.05, h - 0.2, 0.07), bat, sx * (w / 2 + 0.02), y + h / 2, bz);
  }
  const pw = o.postW ?? 0.2;
  if (o.post !== false) for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, rbox(pw, h + 0.1, pw, 0.05), ink(o.post ?? C.woodDark), sx * w / 2, y + h / 2, sz * d / 2);
  const bw = o.bandW ?? 0.24;
  if (o.band !== false) add(g, rbox(w + bw, 0.16, d + bw, 0.05), ink(o.band ?? C.woodDark), 0, y + h + 0.04, 0);
}
/** A gable roof (ridge along x) on a wall top at y: three shingle bands a side, a ridge cap, gable triangles (inset
 * from the roof's ends), patches from the plot's stream. Spans x +-w/2 and z +-(0.53 d + 0.1). */
function gable(g, w, d, y, rh, color, o = {}) {
  const R = o.rand;
  const half = d / 2;
  const slope = Math.atan2(rh, half);
  const L = Math.hypot(half, rh);
  const darker = shade(color, -0.12);
  for (const s of [-1, 1]) {
    for (let b = 0; b < 3; b++) {
      const u0 = b / 3;
      const u1 = (b + 1) / 3 + 0.06;
      const um = (u0 + u1) / 2;
      const m = add(g, rbox(w - b * 0.02, 0.2, (u1 - u0) * L, 0.06), ink(b === 1 ? darker : color), 0, y + rh - um * rh + 0.12 + b * 0.035, s * um * half);
      m.rotation.x = s * slope;
    }
  }
  add(g, cyl(0.15, 0.15, w + 0.06, 10), ink(shade(color, -0.25)), 0, y + rh + 0.2, 0, 0, 0, PI / 2);
  const tri = slab(`gable${r3(d)},${r3(rh)}`, [[-half + 0.35, 0], [half - 0.35, 0], [0, rh - 0.25]], 0.14, 0.03);
  const inset = o.inset ?? 0.45;
  for (const sx of [-1, 1]) {
    const m = add(g, tri, ink(o.gable ?? C.cream), sx * (w / 2 - inset), y, 0);
    m.rotation.y = PI / 2;
  }
  for (let i = 0; i < (o.patches ?? 0) && R; i++) {
    const um = 0.3 + R() * 0.4;
    const pc = sub(g, (R() - 0.5) * (w - 1.2), y + rh - um * rh + 0.26, um * half);
    pc.rotation.x = slope;
    const pw = 0.45 + R() * 0.3;
    const pd = 0.4 + R() * 0.25;
    const p = add(pc, rbox(pw, 0.06, pd, 0.02), ink(o.patchColor ?? C.canvas), 0, 0, 0);
    p.rotation.y = (R() - 0.5) * 0.5;
    for (const [nx, nz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const v = V(nx * (pw / 2 - 0.07), 0.04, nz * (pd / 2 - 0.07)).applyEuler(p.rotation);
      add(pc, sph(6), flat(C.iron), v.x, v.y, v.z, 0, 0, 0, 0.03);
    }
  }
}
/** A wavy (scalloped) trim board of length L, facing +z, hung under an eave. */
const wavyGeo = (L) =>
  cached(`wavy${r3(L)}`, () => {
    const n = Math.max(3, Math.round(L / 0.42));
    const pts = [new T.Vector2(-L / 2, 0.08), new T.Vector2(L / 2, 0.08)];
    for (let i = n * 6; i >= 0; i--) {
      const x = -L / 2 + (L * i) / (n * 6);
      pts.push(new T.Vector2(x, -0.09 - 0.07 * (0.5 - 0.5 * Math.cos(((x + L / 2) / (L / n)) * TAU))));
    }
    const sh = new T.Shape(pts);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -0.025);
    g.deleteAttribute('uv');
    return g;
  });
/** A gable roof whose eaves are hung with wavy trim. */
function wavyRoof(g, w, d, y, rh, col, trim, R, o = {}) {
  gable(g, w, d, y, rh, col, { ...o, rand: R, gable: o.gable ?? trim });
  for (const s of [-1, 1]) {
    const m = add(g, wavyGeo(w - 0.1), ink(trim), 0, y + 0.02, s * (d / 2 + 0.03));
    m.rotation.y = s > 0 ? 0 : PI;
  }
}
/** A one-pitch roof from a front edge (zf, yf) to a back edge (zb, yb), x0..x1, with plank lines and a fascia. */
function shedRoof(g, x0, x1, zf, yf, zb, yb, col, o = {}) {
  const L = Math.hypot(zf - zb, yf - yb);
  const th = Math.atan2(yf - yb, zf - zb);
  const r = sub(g, (x0 + x1) / 2, (yf + yb) / 2, (zf + zb) / 2);
  r.rotation.x = -th;
  const w = x1 - x0;
  add(r, rbox(w, 0.12, L, 0.04), ink(col), 0, 0, 0);
  const n = Math.max(2, Math.round(L / 0.42));
  for (let i = 1; i < n; i++) add(r, box(w - 0.04, 0.03, 0.05), thin(shade(col, -0.22)), 0, 0.07, -L / 2 + (L * i) / n);
  if (o.fascia !== false) add(r, rbox(w, 0.16, 0.06, 0.02), ink(o.fascia ?? shade(col, -0.25)), 0, -0.04, L / 2 - 0.03);
  return r;
}
/** A brick chimney (its foot at y), smoking when `smoke`. */
function chimney(g, x, y, z, h, smoke = true, s = 0.6, col = C.stone) {
  add(g, rbox(0.5, h, 0.5, 0.06), ink(col), x, y + h / 2, z);
  add(g, rbox(0.62, 0.16, 0.62, 0.05), ink(C.stoneDark), x, y + h, z);
  for (let i = 0; i < Math.floor(h / 0.32) - 1; i++) add(g, rbox(0.22, 0.1, 0.04, 0.02), thin(shade(col, -0.25)), x + ((i % 2) - 0.5) * 0.22, y + 0.3 + i * 0.32, z + 0.25);
  if (smoke) puff(g, x, y + h + 0.15, z, s);
}
/** An iron stovepipe from y0 to y1 with a cap, smoking. */
function stovepipe(g, x, y0, y1, z, s = 0.5) {
  add(g, cyl(0.09, 0.09, y1 - y0, 10), ink(C.iron), x, (y0 + y1) / 2, z);
  add(g, cone(0.2, 0.18, 10), ink(C.iron), x, y1 + 0.12, z);
  puff(g, x, y1 + 0.28, z, s);
}
const barrelGeo = () => lathe('barrel', [[0, -0.5], [0.36, -0.5], [0.44, -0.3], [0.48, 0], [0.44, 0.3], [0.36, 0.5], [0, 0.5]], 14);
function barrel(g, x, y, z, s = 1, color = C.barrel, top = null) {
  const b = sub(g, x, y, z);
  b.scale.setScalar(s);
  add(b, barrelGeo(), ink(color), 0, 0.5, 0);
  for (const hy of [0.2, 0.8]) add(b, torus(0.455, 0.035, 18, 4), thin(C.hoop), 0, hy, 0, PI / 2);
  add(b, cyl(0.36, 0.36, 0.04, 14), top === null ? thin(shade(color, 0.15)) : flat(top), 0, 1.0, 0);
  return b;
}
function crate(g, x, y, z, s = 1, ry = 0, color = C.wood3) {
  const c = sub(g, x, y, z, ry);
  c.scale.setScalar(s);
  add(c, rbox(0.8, 0.8, 0.8, 0.06), ink(color), 0, 0.4, 0);
  const slat = thin(shade(color, -0.25));
  for (const sz of [-1, 1]) {
    add(c, rbox(0.8, 0.1, 0.05, 0.02), slat, 0, 0.12, sz * 0.41);
    add(c, rbox(0.8, 0.1, 0.05, 0.02), slat, 0, 0.68, sz * 0.41);
    const d = add(c, rbox(0.98, 0.09, 0.05, 0.02), slat, 0, 0.4, sz * 0.41);
    d.rotation.z = sz * 0.62;
  }
  return c;
}
function bench(g, x, z, ry, col = C.wood3, len = 1.2) {
  const b = sub(g, x, 0, z, ry);
  add(b, rbox(len, 0.08, 0.36, 0.03), ink(col), 0, 0.3, 0);
  add(b, rbox(len, 0.28, 0.06, 0.03), ink(col), 0, 0.54, -0.16, -0.12, 0, 0);
  for (const sx of [-1, 1]) add(b, rbox(0.08, 0.3, 0.32, 0.03), ink(C.woodDark), sx * (len / 2 - 0.12), 0.15, 0);
  return b;
}
/** A lamp post with a lantern hanging from its arm (the arm along +z of ry). */
function lampPost(g, x, z, ry, h = 2.3, arm = 0.5) {
  const p = sub(g, x, 0, z, ry);
  add(p, cyl(0.07, 0.1, h, 8), ink(C.woodDark), 0, h / 2, 0);
  add(p, rbox(0.26, 0.1, 0.26, 0.04), ink(C.woodDark), 0, 0.05, 0);
  K.beam(p, ink(C.woodDark), V(0, h - 0.12, 0), V(0, h - 0.12, arm), 0.08, 0.08, 0.03);
  K.rod(p, thin(C.iron), V(0, h - 0.13, arm - 0.04), V(0, h - 0.3, arm - 0.04), 0.012);
  K.lantern(p, 0, h - 0.62, arm - 0.04, lampGlow(), 0.85);
  return p;
}
function flowerPot(g, x, y, z, col = 0xe2383d, s = 1, pot = C.cork) {
  add(g, cyl(0.13 * s, 0.1 * s, 0.2 * s, 10), ink(pot), x, y + 0.1 * s, z);
  add(g, sph(8), ink(C.leaf2), x, y + 0.26 * s, z, 0, 0, 0, 0.15 * s);
  for (let i = 0; i < 3; i++) add(g, sph(6), ink(col), x + Math.cos(i * 2.1) * 0.08 * s, y + 0.34 * s, z + Math.sin(i * 2.1) * 0.08 * s, 0, 0, 0, 0.065 * s);
}
/** A rounded rock (a squashed sphere, turned by the plot's stream). */
function rock(g, x, y, z, sx, sy, sz, col, R, seg = 8) {
  const m = add(g, sph(seg), ink(col), x, y, z, 0, R ? R() * TAU : 0, 0, [sx, sy, sz]);
  return m;
}
/** A fence run: posts every ~0.6 u and two rails, from a to b (y = 0), h tall. */
function fence(g, a, b, h = 0.85, col = C.wood3) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 0.6));
  for (let i = 0; i <= n; i++) add(g, box(0.1, h, 0.1), ink(C.woodDark), a[0] + (dx * i) / n, h / 2, a[1] + (dz * i) / n);
  for (let i = 0; i <= n; i++) add(g, cone(0.075, 0.08, 4), ink(C.woodDark), a[0] + (dx * i) / n, h + 0.04, a[1] + (dz * i) / n, 0, PI / 4, 0);
  for (const yy of [h * 0.45, h * 0.85]) K.beam(g, thin(col), V(a[0], yy, a[1]), V(b[0], yy, b[1]), 0.07, 0.09, 0.02);
}
const pennantGeo = () => slab('pennant', [[-0.13, 0], [0.13, 0], [0, -0.3]], 0.02, 0.008);
/** Bunting: a sagging line from a to b with pennants. */
function bunting(g, a, b, sag, cols, n = 0) {
  const pts = K.sagCurve(a, b, sag, 12);
  K.rope(g, thin(C.rope), pts, 0.018, 4);
  const count = n || Math.max(3, Math.round(a.distanceTo(b) / 0.32));
  const dir = V().subVectors(b, a).setY(0).normalize();
  const ry = Math.atan2(-dir.z, dir.x);
  for (let i = 1; i < count; i++) {
    const u = i / count;
    const p = V().lerpVectors(a, b, u);
    p.y -= sag * 4 * u * (1 - u);
    add(g, pennantGeo(), thin(cols[i % cols.length]), p.x, p.y, p.z, 0, ry, 0);
  }
}
/** A flag on a pole: the pole from y0 to y1 at (x, z), the flag flying toward +x of ry. */
function flagPole(g, x, y0, y1, z, col, ry = 0, w = 0.7, h = 0.45) {
  add(g, cyl(0.035, 0.045, y1 - y0, 8), ink(C.woodDark), x, (y0 + y1) / 2, z);
  add(g, sph(8), ink(C.brass), x, y1 + 0.05, z, 0, 0, 0, 0.07);
  const f = sub(g, x, y1 - h / 2 - 0.05, z, ry);
  add(f, slab(`flag${r3(w)},${r3(h)}`, [[0, -h / 2], [w, -h / 2 + 0.04], [w - 0.15, 0], [w, h / 2 - 0.04], [0, h / 2]], 0.03, 0.01), ink(col), 0.02, 0, 0);
}
/** A fish shape (xy plane, facing +x, its middle at the origin), extruded. */
const fishGeo = (L = 1, H = 0.42, d = 0.1) =>
  slab(`fish${r3(L)},${r3(H)}`, (() => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * PI;
      pts.push([0.15 * L + Math.cos(a) * 0.35 * L, Math.sin(a) * H * 0.5]);
    }
    pts.push([-0.28 * L, 0.04 * H], [-0.5 * L, 0.42 * H], [-0.44 * L, 0], [-0.5 * L, -0.42 * H], [-0.28 * L, -0.04 * H]);
    for (let i = 1; i < 12; i++) {
      const a = PI + (i / 12) * PI;
      pts.push([0.15 * L + Math.cos(a) * 0.35 * L, Math.sin(a) * H * 0.5]);
    }
    return pts;
  })(), d, 0.015);
function fish(g, x, y, z, L, col, rz = 0, ry = 0, eye = true) {
  const f = sub(g, x, y, z, ry);
  f.rotation.z = rz;
  add(f, fishGeo(L, L * 0.42), ink(col), 0, 0, 0);
  if (eye) for (const s of [-1, 1]) add(f, sph(6), flat(C.black), 0.36 * L, 0.04 * L, s * 0.055, 0, 0, 0, 0.035 * Math.max(1, L));
  return f;
}
/** A five-pointed star (xy plane), extruded. */
const starGeo = (r = 0.2, d = 0.05) =>
  slab(`star${r3(r)}`, Array.from({ length: 10 }, (_, i) => {
    const a = PI / 2 + (i * PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  }), d, 0.01);
/** A scallop shell fan in the xy plane (hinge at the origin, opening up +y): ribs alternately two colours, each a
 * wedge of an ellipse (half-width a, height b) with a bulging edge, tilted in turn so the fan looks fluted. */
function shellFan(g, a, b, n, cols, depth = 0.08, a0 = 0.06 * PI, a1 = 0.94 * PI) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const pts = [[0, 0]];
    for (let k = 0; k <= 6; k++) {
      const t = t0 + ((t1 - t0) * k) / 6;
      const r = 1 + 0.07 * Math.sin((PI * k) / 6);
      pts.push([Math.cos(t) * a * r, Math.sin(t) * b * r]);
    }
    const m = add(g, slab(`shell${r3(a)},${r3(b)},${n},${i},${r3(a0)},${r3(a1)}`, pts, depth, 0.015), ink(cols[i % cols.length]), 0, 0, (i % 2) * 0.03);
    out.push(m);
  }
  return out;
}
/** A crow-step of stakes and a string round a footprint (a building plot marked out), with chalk lines. */
function stakeOutline(g, F, y = 0) {
  const [x0, x1, z0, z1] = [F[0] + 0.06, F[1] - 0.06, F[2] + 0.06, F[3] - 0.06];
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (const [x, z] of corners) {
    add(g, rbox(0.07, 0.5, 0.07, 0.02), ink(C.wood3), x, y + 0.22, z);
    add(g, cone(0.05, 0.08, 6), ink(C.red), x, y + 0.5, z);
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    K.rope(g, thin(C.white), [V(ax, y + 0.36, az), V((ax + bx) / 2, y + 0.33, (az + bz) / 2), V(bx, y + 0.36, bz)], 0.012, 4);
    const len = Math.hypot(bx - ax, bz - az);
    const m = add(g, box(len, 0.012, 0.05), flat(C.white), (ax + bx) / 2, y + 0.01, (az + bz) / 2);
    m.rotation.y = Math.atan2(-(bz - az), bx - ax);
  }
}
/** The "Build me!" board (tier 0 on the islets): sparrow's when the kit carries one, else drawn alike here. */
function board(g, x, y, z, ry) {
  if (typeof K.board === 'function') return K.board(g, x, y, z, ry);
  const b = sub(g, x, y, z, ry);
  add(b, rbox(0.12, 1.25, 0.12, 0.03), ink(C.woodDark), 0, 0.62, -0.05);
  add(b, rbox(1.12, 0.62, 0.09, 0.04), ink(C.woodDark), 0, 1.0, 0);
  add(b, rbox(1.0, 0.5, 0.04, 0.02), flat(C.cream), 0, 1.0, 0.04);
  // a painted hammer and a little house
  const hm = add(b, box(0.07, 0.32, 0.02), flat(C.wood2), -0.28, 0.96, 0.065);
  hm.rotation.z = -0.6;
  const hh = add(b, box(0.2, 0.08, 0.02), flat(C.iron), -0.18, 1.08, 0.066);
  hh.rotation.z = -0.6;
  add(b, box(0.32, 0.2, 0.02), flat(C.red), 0.2, 0.92, 0.065);
  const rf = add(b, slab('boardRoof', [[-0.22, 0], [0.22, 0], [0, 0.16]], 0.02, 0), flat(C.blue), 0.2, 1.02, 0.066);
  rf.rotation.set(0, 0, 0);
  for (const sx of [-1, 1]) add(b, sph(6), flat(C.iron), sx * 0.44, 1.2, 0.06, 0, 0, 0, 0.03);
  return b;
}
/** A palm frond (as sparrow's), for the giant palm: its base at the origin, reaching out along +z. */
const frondGeo = () =>
  cached('frond4', () => {
    const g = new T.SphereGeometry(1, 10, 3);
    g.scale(0.5, 0.12, 1.75);
    g.translate(0, 0, 1.65);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const x = p.getX(i);
      p.setY(i, p.getY(i) + 0.42 * Math.abs(x) + 0.42 * z - 0.2 * z * z);
      p.setX(i, x * (1 - 0.3 * Math.max(0, z - 1.4)));
    }
    g.computeVertexNormals();
    g.deleteAttribute('uv');
    return g;
  });

/** An animated part: built by `make(part)` in a pivot at (x, y, z) of the kit's frame, then baked into one mesh with
 * no ink outline (one draw call); `step(pivot, t, dt)` moves it. */
function anim(id, x, y, z, make, step, o = {}) {
  const group = new T.Group();
  group.name = `plot4-anim:${id}`;
  group.position.set(x, y, z);
  if (o.ry) group.rotation.y = o.ry;
  const pivot = new T.Group();
  group.add(pivot);
  make(pivot);
  K.bake(pivot, { force: 'flat' });
  group.userData.keep = true;
  ANIM.push({ id, group, update: (t, dt) => step(pivot, t, dt) });
  return group;
}

// ---------------------------------------------------------------------------
// The Blacksmith's Forge (Lantern Lane, s4; footprint x -1.0..1.0, z -1.9..0.7; max 8)
// An anvil under a lean-to and a glowing hearth; then brick walls, a tall chimney and a horseshoe sign; then the
// Iron Works: a water wheel fed by a flume from a cistern, a bellows, a gable roof with a vent.
// ---------------------------------------------------------------------------
function forgeArt(g, tier, R) {
  const BR = 0xc0614a;
  const SOOT = 0x5b6278;
  const H = { x: -0.42, z: -1.42, w: 1.06, d: 0.78 };
  // the yard's stone floor
  add(g, rbox(1.96, 0.12, 2.56, 0.04), ink(C.stoneDark), 0, 0.06, -0.6);
  for (let i = 1; i < 5; i++) add(g, box(1.9, 0.02, 0.035), thin(shade(C.stoneDark, -0.25)), 0, 0.125, -1.88 + i * 0.51);
  // the hearth: brick, a stone lip, the coal bed and the firebox mouth
  add(g, rbox(H.w, 0.82, H.d, 0.06), ink(BR), H.x, 0.53, H.z);
  for (const yy of [0.33, 0.56, 0.79]) add(g, box(H.w + 0.015, 0.03, H.d + 0.015), thin(shade(BR, -0.32)), H.x, yy, H.z);
  add(g, rbox(H.w + 0.08, 0.1, H.d + 0.06, 0.04), ink(C.stone), H.x, 0.98, H.z);
  add(g, rbox(H.w - 0.28, 0.05, H.d - 0.3, 0.02), flat(0x2a1a14), H.x, 1.03, H.z);
  add(g, cyl(0.2, 0.2, 0.05, 14, false), flat(0x2a1a14), H.x, 0.5, H.z + H.d / 2 + 0.005, PI / 2, 0, 0, [1, 1, 0.75]);
  add(g, rbox(0.3, 0.06, 0.04, 0.02), winGlow(), H.x, 0.38, H.z + H.d / 2 + 0.02);
  // the glowing coals and a few sparks over the anvil: their own mesh, pulsing at 0.6 Hz
  anim(
    'forgeGlow',
    0,
    0,
    0,
    (p) => {
      const m = coalGlow();
      const coals = [[-0.26, -0.1], [-0.08, -0.14], [0.1, -0.08], [0.24, -0.12], [-0.18, 0.1], [0.02, 0.08], [0.2, 0.11]];
      for (const [cx, cz] of coals) add(p, sph(6), m, H.x + cx, 1.07, H.z + cz, 0, cx * 7, 0, [0.11, 0.055, 0.09]);
      for (const [sx, sy, sz] of [[0.12, 1.12, -0.18], [0.3, 1.24, -0.28], [0.02, 1.3, -0.12], [0.22, 1.42, -0.2]]) add(p, sph(5), m, sx, sy, sz, 0, 0, 0, 0.022);
    },
    (p, t) => {
      coalGlow().emissiveIntensity = 0.95 + 0.35 * Math.sin(t * TAU * 0.6);
    },
  );
  // the anvil on its stump
  add(g, cyl(0.22, 0.26, 0.5, 10), ink(C.wood2), 0.2, 0.37, -0.22);
  add(g, torus(0.22, 0.02, 14, 3), thin(C.trunkRing), 0.2, 0.6, -0.22, PI / 2);
  const an = sub(g, 0.2, 0.62, -0.22, 0.15);
  add(an, rbox(0.3, 0.1, 0.22, 0.03), ink(C.iron), 0, 0.05, 0);
  add(an, rbox(0.16, 0.12, 0.13, 0.03), ink(C.iron), 0, 0.15, 0);
  add(an, rbox(0.48, 0.12, 0.2, 0.03), ink(C.iron), -0.03, 0.26, 0);
  add(an, cone(0.08, 0.3, 10), ink(C.iron), 0.34, 0.26, 0, 0, 0, -PI / 2, [1, 1, 0.9]);
  add(an, rbox(0.08, 0.06, 0.12, 0.02), ink(C.iron), -0.3, 0.27, 0);
  // the hammer and tongs on the anvil
  add(an, rbox(0.12, 0.07, 0.07, 0.02), ink(C.iron), 0.05, 0.36, 0.02);
  const hh = add(an, cyl(0.018, 0.018, 0.34, 6), ink(C.wood3), 0.05, 0.36, 0.2, PI / 2);
  hh.rotation.order = 'XYZ';
  // the quench barrel (water) and a grindstone
  barrel(g, -0.62, 0.12, 0.3, 0.52, C.barrel2, 0x5fb8e8);
  const gs = sub(g, 0.62, 0.12, 0.3, 0.3);
  for (const sx of [-0.12, 0.12]) add(gs, rbox(0.06, 0.62, 0.06, 0.02), ink(C.woodDark), sx, 0.31, 0);
  add(gs, cyl(0.26, 0.26, 0.09, 16), ink(C.stone), 0, 0.5, 0, 0, 0, PI / 2);
  add(gs, cyl(0.03, 0.03, 0.34, 6), ink(C.iron), 0, 0.5, 0, 0, 0, PI / 2);
  K.rod(gs, ink(C.iron), V(0.17, 0.5, 0), V(0.17, 0.66, 0.08), 0.02);
  add(gs, rbox(0.3, 0.06, 0.3, 0.02), ink(C.wood2), 0, 0.06, 0);
  // the posts (front taller), beams; tools hanging from the back beam
  const post = ink(C.woodDark);
  const posts = tier >= 3 ? [[-0.86, 0.52, 2.2], [0.46, 0.52, 2.2], [-0.86, -1.76, 2.2], [0.46, -1.76, 2.2]] : [[-0.86, 0.52, 2.42], [0.86, 0.52, 2.42], [-0.86, -1.76, 2.1], [0.86, -1.76, 2.1]];
  for (const [px, pz, ph] of posts) add(g, rbox(0.16, ph, 0.16, 0.04), post, px, 0.12 + (ph - 0.12) / 2, pz, 0, 0, 0, [1, (ph - 0.12) / ph, 1]);
  for (let i = 0; i < 3; i++) {
    const tx = 0.05 + i * 0.22;
    const tg = sub(g, tx, 1.78, -1.62);
    add(tg, cyl(0.012, 0.012, 0.26, 4), thin(C.iron), 0, 0.13, 0);
    if (i === 1) {
      for (const s of [-1, 1]) {
        const j = add(tg, rbox(0.03, 0.5, 0.03, 0.01), ink(C.iron), s * 0.04, -0.2, 0);
        j.rotation.z = s * 0.12;
      }
    } else {
      add(tg, cyl(0.022, 0.022, 0.42, 6), ink(C.wood3), 0, -0.18, 0);
      add(tg, rbox(0.18, 0.08, 0.08, 0.02), ink(C.iron), 0, -0.42, 0);
    }
  }
  if (tier < 3) {
    K.beam(g, post, V(-0.95, 2.36, 0.52), V(0.95, 2.36, 0.52), 0.13, 0.13, 0.03);
    K.beam(g, post, V(-0.95, 2.04, -1.76), V(0.95, 2.04, -1.76), 0.13, 0.13, 0.03);
    for (const sx of [-0.86, 0.86]) K.beam(g, post, V(sx, 2.36, 0.52), V(sx, 2.04, -1.76), 0.11, 0.11, 0.03);
    // the lean-to's roof (sloping to the back), soot-dark planks and a patch
    shedRoof(g, -0.97, 0.97, 0.66, 2.5, -1.86, 2.16, SOOT);
    const pt = add(g, rbox(0.42, 0.04, 0.36, 0.02), ink(C.canvas), 0.4, 2.42, -0.2);
    pt.rotation.set(-0.13, 0.2, 0, 'YXZ');
  }
  if (tier >= 2) {
    const wallH = tier >= 3 ? 2.12 : 1.98;
    // brick walls at the back and the left (a lit window), planks at the right
    add(g, rbox(tier >= 3 ? 1.42 : 1.9, wallH, 0.1, 0.03), ink(BR), tier >= 3 ? -0.24 : 0, 0.12 + wallH / 2, -1.83);
    add(g, rbox(0.1, wallH, 2.3, 0.03), ink(BR), -0.88, 0.12 + wallH / 2, -0.68);
    let row = 0;
    for (let yy = 0.42; yy < wallH; yy += 0.3, row++) {
      for (const z of [-1.775, -1.885]) add(g, box(tier >= 3 ? 1.36 : 1.84, 0.025, 0.02), thin(shade(BR, -0.3)), tier >= 3 ? -0.24 : 0, yy, z);
      for (const x of [-0.825, -0.935]) add(g, box(0.02, 0.025, 2.24), thin(shade(BR, -0.3)), x, yy, -0.68);
      for (let k = 0; k < 5; k++) add(g, box(0.02, 0.27, 0.02), thin(shade(BR, -0.3)), -0.935, yy - 0.15, -1.55 + k * 0.42 + (row % 2) * 0.21);
    }
    const lw = sub(g, -0.9, 0, -0.55, -PI / 2);
    flushWin(lw, 0, 1.35, 0, 0.5, 0.46, true);
    add(g, rbox(0.08, wallH, 1.36, 0.03), ink(C.wood2), 0.46, 0.12 + wallH / 2, -1.12);
    for (let bz = -1.72; bz < -0.5; bz += 0.34) add(g, box(0.04, wallH - 0.15, 0.05), thin(shade(C.wood2, -0.25)), 0.51, 0.12 + wallH / 2, bz);
    // the chimney: a tall brick stack from the hearth, smoking
    chimney(g, H.x, 1.02, -1.56, tier >= 3 ? 4.5 : 3.4, true, 0.7, BR);
    add(g, rbox(0.6, 0.3, 0.6, 0.05), ink(C.stone), H.x, 2.6, -1.56);
    for (const yy of [3.4, 4.2]) if (yy < (tier >= 3 ? 5.3 : 4.3)) add(g, rbox(0.56, 0.08, 0.56, 0.03), ink(C.iron), H.x, yy, -1.56);
    // the horseshoe sign hanging from the front beam
    const sg = sub(g, tier >= 3 ? -0.2 : 0.3, 0, 0.6);
    for (const sx of [-0.22, 0.22]) K.rod(sg, thin(C.iron), V(sx, tier >= 3 ? 2.12 : 2.32, -0.04), V(sx, 1.93, 0), 0.012);
    add(sg, rbox(0.62, 0.42, 0.06, 0.03), ink(C.woodDark), 0, 1.74, 0);
    add(sg, rbox(0.54, 0.34, 0.03, 0.02), ink(C.cream), 0, 1.74, 0.03);
    const shoe = add(sg, torus(0.12, 0.035, 14, 5, PI * 1.35), ink(C.gold), 0, 1.72, 0.06);
    shoe.rotation.z = PI * 0.825;
    for (const s of [-1, 1]) add(sg, sph(5), flat(C.iron), s * 0.24, 1.88, 0.05, 0, 0, 0, 0.022);
    if (tier === 2) {
      // the coal store at the back right: a heap and two sacks
      for (let i = 0; i < 9; i++) add(g, sph(6), ink(0x2e2c36), 0.62 + (i % 3) * 0.12 - 0.1 + (R() - 0.5) * 0.04, 0.2 + Math.floor(i / 3) * 0.08, -1.5 + (i % 4) * 0.1, 0, 0, 0, [0.1, 0.08, 0.1]);
      for (const [sx, sz] of [[0.72, -1.0], [0.66, -0.72]]) {
        add(g, sph(10), ink(0xd8c08a), sx, 0.42, sz, 0, 0, 0, [0.2, 0.3, 0.17]);
        add(g, sph(6), thin(0xb59a62), sx, 0.72, sz, 0, 0, 0, [0.07, 0.06, 0.07]);
      }
    }
  }
  if (tier >= 3) {
    // a timber loft over the smithy, with a lit window and a hoist beam
    const lf = sub(g, -0.25, 2.24, -0.68);
    storey(lf, 1.3, 2.24, 0.86, 0, 0xf2e2c2, { band: false, postW: 0.14 });
    for (const s of [-1, 1]) K.beam(lf, ink(C.woodDeep), V(-0.58, 0.08, s * 1.13), V(0.58, 0.78, s * 1.13), 0.08, 0.05, 0.015);
    flushWin(lf, 0.3, 0.45, 1.12, 0.34, 0.32, true);
    flushWin(sub(lf, 0, 0, -1.12, PI), 0, 0.45, 0, 0.34, 0.32, true);
    K.beam(lf, ink(C.woodDark), V(-0.35, 0.8, 0.9), V(-0.35, 0.8, 1.32), 0.08, 0.08, 0.02);
    K.rod(lf, thin(C.rope), V(-0.35, 0.76, 1.28), V(-0.35, 0.2, 1.28), 0.012);
    add(lf, torus(0.05, 0.015, 8, 3, PI * 1.4), ink(C.iron), -0.35, 0.16, 1.28);
    // the smithy's gable roof (ridge front to back) with a louvred vent on the ridge
    const rg = sub(g, -0.25, 3.14, -0.6, PI / 2);
    gable(rg, 2.46, 1.15, 0, 0.8, SOOT, { rand: R, gable: BR, inset: 0.08, patches: 1 });
    const vent = sub(g, -0.25, 4.0, -0.9);
    add(vent, rbox(0.34, 0.32, 0.34, 0.04), ink(C.woodDark), 0, 0.16, 0);
    for (let i = 0; i < 3; i++) add(vent, box(0.36, 0.03, 0.36), thin(C.wood3), 0, 0.07 + i * 0.09, 0);
    add(vent, cone(0.3, 0.22, 4), ink(SOOT), 0, 0.42, 0, 0, PI / 4, 0);
    // the crossed hammers on the front gable
    for (const s of [-1, 1]) {
      const h = sub(g, -0.25, 3.5, 0.63);
      h.rotation.z = s * 0.7;
      add(h, rbox(0.05, 0.42, 0.03, 0.01), ink(C.wood3), 0, 0, 0);
      add(h, rbox(0.17, 0.08, 0.04, 0.015), ink(C.gold), 0, 0.2, 0.01);
    }
    // the bellows by the hearth, with its lever
    const bl = sub(g, -0.56, 0.12, -0.72, 0.35);
    add(bl, rbox(0.42, 0.06, 0.62, 0.02), ink(C.wood2), 0, 0.3, 0);
    const top = add(bl, rbox(0.42, 0.06, 0.62, 0.02), ink(C.wood2), 0, 0.58, 0);
    top.rotation.x = 0.16;
    add(bl, sph(10), ink(0x7a4a2b), 0, 0.44, 0.02, 0, 0, 0, [0.2, 0.12, 0.28]);
    add(bl, cone(0.06, 0.32, 8), ink(C.brass), 0, 0.4, -0.44, -PI / 2);
    for (const sx of [-0.14, 0.14]) add(bl, rbox(0.05, 0.3, 0.05, 0.02), ink(C.woodDark), sx, 0.15, 0.2);
    K.rod(bl, ink(C.woodDark), V(0, 0.62, 0.2), V(0.05, 1.5, 0.32), 0.03);
    add(bl, sph(6), ink(C.iron), 0.05, 1.52, 0.32, 0, 0, 0, 0.05);
    // the wheel bay: the cistern on its stand, the flume, the catch trough
    for (const [px, pz] of [[0.6, -1.84], [0.94, -1.84], [0.6, -1.5], [0.94, -1.5]]) add(g, rbox(0.07, 2.62, 0.07, 0.02), ink(C.woodDark), px, 1.31 + 0.12, pz);
    for (const yy of [0.9, 1.8]) {
      K.beam(g, thin(C.wood2), V(0.6, yy, -1.84), V(0.94, yy + 0.3, -1.5), 0.05, 0.05, 0.015);
      K.beam(g, thin(C.wood2), V(0.94, yy, -1.84), V(0.6, yy + 0.3, -1.5), 0.05, 0.05, 0.015);
    }
    add(g, rbox(0.42, 0.08, 0.42, 0.02), ink(C.wood2), 0.77, 2.74, -1.67);
    const tank = sub(g, 0.77, 2.78, -1.67);
    tank.scale.set(0.42, 0.78, 0.42);
    add(tank, barrelGeo(), ink(C.barrel), 0, 0.5, 0);
    for (const hy of [0.2, 0.8]) add(tank, torus(0.455, 0.035, 18, 4), thin(C.hoop), 0, hy, 0, PI / 2);
    add(tank, cyl(0.36, 0.36, 0.04, 14), flat(0x5fb8e8), 0, 1.0, 0);
    const fl = sub(g, 0.78, 0, 0);
    const a = V(0, 2.62, -1.42);
    const b = V(0, 2.12, -0.98);
    K.beam(fl, ink(C.wood2), a, b, 0.24, 0.05, 0.015);
    for (const s of [-1, 1]) K.beam(fl, thin(C.wood2), a.clone().add(V(s * 0.12, 0.07, 0)), b.clone().add(V(s * 0.12, 0.07, 0)), 0.04, 0.14, 0.012);
    K.beam(fl, flat(0x7fd0f2), a.clone().add(V(0, 0.035, 0)), b.clone().add(V(0, 0.035, 0)), 0.16, 0.02, 0.008);
    K.rod(fl, flat(0x9fe0ff), V(0, 2.1, -0.96), V(0, 1.96, -0.9), 0.05);
    K.rod(g, ink(C.woodDark), V(0.78, 0.12, -1.0), V(0.78, 2.08, -1.0), 0.03);
    add(g, rbox(0.4, 0.3, 1.72, 0.04), ink(C.wood2), 0.77, 0.27, -0.88);
    add(g, rbox(0.32, 0.03, 1.62, 0.01), flat(0x5fb8e8), 0.77, 0.41, -0.88);
    // the axle into the wall and a gear on it (turning with the wheel)
    anim(
      'waterWheel',
      0.78,
      1.16,
      -0.86,
      (p) => {
        const rim = flat(C.woodDeep);
        const wd = flat(C.wood2);
        for (const sx of [-0.12, 0.12]) {
          add(p, torus(0.8, 0.035, 28, 4), rim, sx, 0, 0, 0, PI / 2, 0);
          for (let i = 0; i < 6; i++) {
            const s = add(p, box(0.04, 1.56, 0.05), rim, sx, 0, 0);
            s.rotation.x = (i / 6) * PI;
          }
        }
        for (let i = 0; i < 12; i++) {
          const a2 = (i / 12) * TAU;
          const pd = add(p, box(0.28, 0.2, 0.05), wd, 0, Math.cos(a2) * 0.72, Math.sin(a2) * 0.72);
          pd.rotation.x = -a2;
        }
        add(p, cyl(0.11, 0.11, 0.3, 12), flat(C.woodDark), 0, 0, 0, 0, 0, PI / 2);
        add(p, cyl(0.035, 0.035, 0.44, 8), flat(C.iron), -0.3, 0, 0, 0, 0, PI / 2);
        add(p, torus(0.16, 0.04, 12, 4), flat(C.iron), -0.24, 0, 0, 0, PI / 2, 0);
      },
      (p, t) => {
        p.rotation.x = -t * 0.9;
      },
    );
  }
}

// ---------------------------------------------------------------------------
// The Music Hall (Lantern Lane, s5; footprint x -2.6..1.4, z -0.8..0.8; max 8)
// A fiddler's stump on a little dais; then a bandstand with a striped canopy; then the Shell Hall: a giant scallop
// shell over the stage, hung with lights and paper lanterns. Music notes rise from it (one InstancedMesh).
// ---------------------------------------------------------------------------
function stump(g, x, z, s = 1) {
  const st = sub(g, x, 0, z);
  st.scale.setScalar(s);
  add(st, lathe('stump', [[0, 0], [0.6, 0], [0.48, 0.08], [0.41, 0.22], [0.39, 0.6], [0, 0.6]], 14), ink(0x8a5a33), 0, 0, 0);
  add(st, cyl(0.37, 0.37, 0.03, 14), flat(C.wood3), 0, 0.6, 0);
  add(st, torus(0.22, 0.015, 14, 3), thin(C.trunkRing), 0, 0.615, 0, PI / 2);
  add(st, torus(0.1, 0.015, 10, 3), thin(C.trunkRing), 0, 0.615, 0, PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = 0.4 + (i * TAU) / 4;
    K.rod(st, ink(0x8a5a33), V(Math.cos(a) * 0.3, 0.16, Math.sin(a) * 0.3), V(Math.cos(a) * 0.55, 0.03, Math.sin(a) * 0.55), 0.07, 6);
  }
  return st;
}
function fiddle(g, x, y, z, rx, ry, rz, s = 1) {
  const f = sub(g, x, y, z, ry);
  f.rotation.set(rx, ry, rz, 'YXZ');
  f.scale.setScalar(s);
  const wood = ink(0xb5532a);
  add(f, sph(10), wood, 0, 0, 0, 0, 0, 0, [0.15, 0.13, 0.05]);
  add(f, sph(10), wood, 0, 0.18, 0, 0, 0, 0, [0.12, 0.11, 0.05]);
  add(f, rbox(0.05, 0.3, 0.03, 0.01), ink(C.black), 0, 0.3, 0.035);
  add(f, rbox(0.04, 0.16, 0.04, 0.01), ink(C.woodDeep), 0, 0.42, 0);
  add(f, sph(6), ink(C.woodDeep), 0, 0.52, 0.0, 0, 0, 0, 0.035);
  add(f, rbox(0.1, 0.03, 0.02, 0.01), ink(C.black), 0, -0.06, 0.05);
  return f;
}
function drum(g, x, y, z, s = 1, col = C.red) {
  const d = sub(g, x, y, z);
  d.scale.setScalar(s);
  add(d, cyl(0.3, 0.3, 0.36, 16), ink(col), 0, 0.18, 0);
  for (const yy of [0.02, 0.34]) add(d, torus(0.3, 0.03, 18, 4), ink(C.gold), 0, yy, 0, PI / 2);
  add(d, cyl(0.29, 0.29, 0.02, 16), flat(C.cream), 0, 0.365, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const z1 = K.rod(d, thin(C.white), V(Math.cos(a) * 0.305, 0.04, Math.sin(a) * 0.305), V(Math.cos(a + 0.5) * 0.305, 0.32, Math.sin(a + 0.5) * 0.305), 0.01, 4);
    z1.name = 'cord';
  }
  return d;
}
function notesAnim(x, y, z, spread, n = 6) {
  // one InstancedMesh of notes (a head, a stem and a flag, baked white; each note tinted)
  const tmp = new T.Group();
  add(tmp, sph(8), flat(0xffffff), 0, 0, 0, 0, 0, 0.35, [0.11, 0.08, 0.06]);
  add(tmp, box(0.025, 0.3, 0.025), flat(0xffffff), 0.085, 0.15, 0);
  const fl = add(tmp, box(0.14, 0.04, 0.025), flat(0xffffff), 0.13, 0.27, 0);
  fl.rotation.z = -0.5;
  const baked = K.bake(tmp, { force: 'flat' });
  const geo = baked[0].geometry;
  const mesh = new T.InstancedMesh(geo, baked[0].material, n);
  mesh.name = 'plot4-music-notes';
  mesh.frustumCulled = false;
  const cols = [0xffd84a, 0xf58fb0, 0x7fd6ff, 0xff9a3c, 0xaee6c8, 0xd7c4f5];
  const c = new T.Color();
  const m4 = new T.Matrix4();
  for (let i = 0; i < n; i++) {
    mesh.setColorAt(i, c.setHex(cols[i % cols.length]));
    mesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  const group = new T.Group();
  group.name = 'plot4-anim:notes';
  group.position.set(x, y, z);
  group.add(mesh);
  group.userData.keep = true;
  const q = new T.Quaternion();
  const pos = new T.Vector3();
  const sc = new T.Vector3();
  const e = new T.Euler();
  ANIM.push({
    id: 'notes',
    group,
    update: (t) => {
      for (let i = 0; i < n; i++) {
        const ph = (t * 0.22 + i / n) % 1;
        const side = ((i * 7) % n) / n - 0.5;
        pos.set(side * spread + Math.sin(t * 0.9 + i * 1.7) * 0.18, ph * 2.6, Math.sin(i * 2.3) * 0.25);
        const k = Math.sin(ph * PI);
        sc.setScalar(Math.max(0.0001, k * 1.25));
        q.setFromEuler(e.set(0, 0, Math.sin(t * 0.8 + i) * 0.3));
        m4.compose(pos, q, sc);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  });
  return group;
}
function musicArt(g, tier, R) {
  const cx = -0.9; // the stage's middle
  if (tier === 1) {
    // a plank dais with the old stump, the fiddle, a stool, a music stand, a hat for coins
    add(g, rbox(2.5, 0.14, 1.5, 0.04), ink(C.wood2), -0.75, 0.07, 0);
    add(g, rbox(1.7, 0.03, 1.1, 0.02), ink(0xc8483a), -0.8, 0.15, 0.0);
    for (const s of [-1, 1]) add(g, box(1.7, 0.035, 0.06), flat(C.gold), -0.8, 0.155, s * 0.48);
    for (let i = 1; i < 6; i++) add(g, box(0.03, 0.02, 1.46), thin(shade(C.wood3, -0.25)), -2.0 + i * 0.42, 0.145, 0);
    stump(sub(g, 0, 0.14, 0), -1.25, -0.15);
    fiddle(g, -1.0, 0.92, -0.08, -0.25, 0.6, 0.35);
    K.rod(g, ink(C.woodDeep), V(-1.45, 0.8, -0.3), V(-0.92, 0.95, 0.1), 0.012);
    const st = sub(g, -0.3, 0.14, 0.2);
    add(st, cyl(0.2, 0.2, 0.06, 12), ink(C.red), 0, 0.5, 0);
    for (let i = 0; i < 3; i++) K.rod(st, ink(C.woodDark), V(Math.cos(i * 2.1) * 0.08, 0.48, Math.sin(i * 2.1) * 0.08), V(Math.cos(i * 2.1) * 0.2, 0, Math.sin(i * 2.1) * 0.2), 0.025, 5);
    const ms = sub(g, 0.35, 0.14, -0.1, -0.4);
    add(ms, cyl(0.02, 0.02, 1.0, 6), ink(C.iron), 0, 0.5, 0);
    for (let i = 0; i < 3; i++) K.rod(ms, ink(C.iron), V(0, 0.08, 0), V(Math.cos(i * 2.1) * 0.2, 0, Math.sin(i * 2.1) * 0.2), 0.015, 4);
    const sh = add(ms, rbox(0.46, 0.34, 0.03, 0.01), ink(C.iron), 0, 1.06, 0.02);
    sh.rotation.x = -0.35;
    const pg = add(ms, rbox(0.4, 0.28, 0.02, 0.01), flat(C.white), 0, 1.07, 0.05);
    pg.rotation.x = -0.35;
    add(g, cyl(0.18, 0.2, 0.04, 14), ink(C.navy), -0.55, 0.16, 0.5);
    add(g, cyl(0.1, 0.12, 0.12, 12), ink(C.navy), -0.55, 0.24, 0.5);
    for (let i = 0; i < 3; i++) add(g, cyl(0.05, 0.05, 0.015, 10), ink(C.gold), -0.5 + i * 0.07, 0.2, 0.36 + i * 0.04);
    // a lantern post and a pole, with bunting between
    lampPost(g, 1.05, -0.35, -PI / 2, 2.25, 0.5);
    add(g, cyl(0.05, 0.06, 2.2, 8), ink(C.woodDark), -2.35, 1.1, -0.5);
    add(g, sph(8), ink(C.orange), -2.35, 2.24, -0.5, 0, 0, 0, 0.09);
    bunting(g, V(-2.35, 2.1, -0.5), V(1.0, 2.1, -0.35), 0.35, [C.orange, C.yellow, C.white, C.pink]);
    notesAnim(-1.1, 1.2, 0, 1.0, 5);
    return;
  }
  // the stage (T2, T3): a raised platform with an orange fascia and white trim; steps at the right end
  add(g, rbox(3.36, 0.45, 1.5, 0.05), ink(C.wood2), cx, 0.225, 0);
  add(g, rbox(3.34, 0.08, 1.46, 0.03), ink(C.wood3), cx, 0.47, 0);
  for (let i = 1; i < 8; i++) add(g, box(0.03, 0.02, 1.42), thin(shade(C.wood3, -0.25)), cx - 1.67 + i * 0.42, 0.515, 0);
  add(g, rbox(3.36, 0.26, 0.05, 0.02), ink(C.orange), cx, 0.25, 0.74);
  for (let i = 0; i < 8; i++) add(g, cyl(0.06, 0.06, 0.03, 10), ink(C.white), cx - 1.5 + i * 0.43, 0.25, 0.77, PI / 2);
  add(g, rbox(0.36, 0.15, 0.9, 0.03), ink(C.wood3), 1.12, 0.075, 0.25);
  add(g, rbox(0.3, 0.29, 0.9, 0.03), ink(C.wood3), 0.93, 0.145, 0.25);
  stump(g, 1.05, -0.5, 0.62);
  if (tier === 2) {
    // four posts, a striped vaulted canopy, a back rail, the drum and the fiddler's chair, lanterns, bunting
    for (const px of [-2.46, 0.66]) for (const pz of [-0.64, 0.62]) {
      add(g, cyl(0.06, 0.07, 2.25, 8), ink(C.white), px, 0.5 + 1.12, pz);
      add(g, cyl(0.1, 0.1, 0.08, 10), ink(C.orange), px, 0.54, pz);
    }
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -0.9 + (i / (n - 1)) * 1.8;
      const m = add(g, rbox(3.3, 0.06, 0.29, 0.02), ink(i % 2 ? C.white : C.orange), cx, 2.72 + Math.cos(a) * 0.32, Math.sin(a) * 0.72);
      m.rotation.x = -a;
    }
    for (const sz of [-1, 1]) add(g, wavyGeo(3.3), ink(C.orange), cx, 2.88, sz * 0.73, 0, sz > 0 ? 0 : PI, 0);
    for (const sx of [-1, 1]) add(g, slab('bandEnd', [[-0.72, 0], [0.72, 0], [0.5, 0.18], [0, 0.28], [-0.5, 0.18]], 0.06, 0.015), ink(C.cream), cx + sx * 1.62, 2.86, 0, 0, PI / 2, 0);
    for (let x = -2.4; x <= 0.6; x += 0.28) add(g, box(0.05, 0.45, 0.05), thin(C.white), x, 0.75, -0.66);
    K.beam(g, ink(C.white), V(-2.46, 1.0, -0.66), V(0.66, 1.0, -0.66), 0.08, 0.07, 0.02);
    drum(g, -0.2, 0.51, -0.25, 1.0);
    for (const s of [-1, 1]) K.rod(g, ink(C.woodDeep), V(-0.2 + s * 0.12, 0.92, -0.22), V(-0.2 + s * 0.2, 1.12, 0.0), 0.015);
    const ch = sub(g, -1.6, 0.51, -0.2, 0.3);
    add(ch, rbox(0.4, 0.06, 0.4, 0.02), ink(C.red), 0, 0.45, 0);
    add(ch, rbox(0.4, 0.5, 0.06, 0.02), ink(C.red), 0, 0.72, -0.18);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(ch, rbox(0.05, 0.45, 0.05, 0.015), ink(C.woodDark), sx * 0.16, 0.22, sz * 0.16);
    fiddle(g, -1.6, 1.1, -0.15, -0.2, 0.3, 0.1);
    for (const px of [-2.46, 0.66]) K.lantern(g, px, 2.0, 0.62, lampGlow(), 0.75);
    bunting(g, V(-2.46, 2.45, 0.66), V(0.66, 2.45, 0.66), 0.2, [C.orange, C.yellow, C.white, C.pink]);
    notesAnim(-0.9, 1.3, 0, 2.0, 6);
    return;
  }
  // T3: the Shell Hall: the scallop shell rises behind the stage and leans over it
  const sg = sub(g, cx, 0.5, -0.62);
  sg.rotation.x = 0.28;
  shellFan(sg, 1.55, 4.0, 9, [0xffd2b8, 0xff9a6c], 0.09);
  // its hinge "ears" and a pearl in a little shell at the hinge
  for (const s of [-1, 1]) {
    const e = sub(sg, s * 0.32, 0.02, 0.05);
    e.rotation.z = s > 0 ? -0.15 : 0.15;
    add(e, slab(`ear${s}`, s > 0 ? [[0, 0], [0.5, 0.05], [0.42, 0.42], [0.05, 0.3]] : [[0, 0], [-0.5, 0.05], [-0.42, 0.42], [-0.05, 0.3]], 0.08, 0.015), ink(0xff8a5c), 0, 0, 0);
  }
  add(sg, sph(12), ink(C.white), 0, 0.22, 0.2, 0, 0, 0, 0.17);
  // lights round its rim
  for (let i = 0; i <= 14; i++) {
    const t = 0.08 * PI + (i / 14) * 0.84 * PI;
    add(sg, sph(6), lampGlow(), Math.cos(t) * 1.55 * 1.04, Math.sin(t) * 4.0 * 1.04, 0.08, 0, 0, 0, 0.065);
  }
  // two lantern posts at the stage front and paper lanterns strung between
  for (const px of [-2.42, 0.62]) {
    add(g, cyl(0.06, 0.08, 2.3, 8), ink(C.woodDark), px, 0.5 + 1.15, 0.6);
    add(g, cyl(0.12, 0.12, 0.08, 10), ink(C.orange), px, 0.54, 0.6);
    K.lantern(g, px, 2.95, 0.6, lampGlow(), 0.9);
  }
  const a = V(-2.42, 2.65, 0.6);
  const b = V(0.62, 2.65, 0.6);
  K.rope(g, thin(C.rope), K.sagCurve(a, b, 0.32, 12), 0.016, 4);
  for (let i = 1; i < 6; i++) {
    const u = i / 6;
    const p = V().lerpVectors(a, b, u);
    p.y -= 0.32 * 4 * u * (1 - u);
    add(g, sph(10), paperGlow(), p.x, p.y - 0.18, p.z, 0, 0, 0, [0.15, 0.17, 0.15]);
    for (const yy of [0.02, -0.38]) add(g, cyl(0.07, 0.07, 0.04, 8), ink(C.woodDeep), p.x, p.y + yy, p.z);
  }
  // on stage: the drum, the fiddler's chair, a squeezebox on a stool
  drum(g, -0.25, 0.51, -0.15, 1.0);
  const ch = sub(g, -1.75, 0.51, -0.1, 0.3);
  add(ch, rbox(0.4, 0.06, 0.4, 0.02), ink(C.red), 0, 0.45, 0);
  add(ch, rbox(0.4, 0.5, 0.06, 0.02), ink(C.red), 0, 0.72, -0.18);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(ch, rbox(0.05, 0.45, 0.05, 0.015), ink(C.woodDark), sx * 0.16, 0.22, sz * 0.16);
  const sq = sub(g, -1.0, 0.51, 0.1, -0.2);
  add(sq, cyl(0.17, 0.17, 0.42, 10), ink(C.wood3), 0, 0.21, 0);
  for (let i = 0; i < 5; i++) add(sq, rbox(0.42, 0.24, 0.05, 0.02), ink(i % 2 ? C.red : C.cream), -0.12 + i * 0.06, 0.6, 0, 0, 0, 0, [0.12, 1, 1]);
  for (const sx of [-1, 1]) add(sq, rbox(0.1, 0.28, 0.14, 0.02), ink(C.woodDeep), sx * 0.2, 0.6, 0);
  notesAnim(-0.9, 1.3, 0, 2.2, 7);
}

// ---------------------------------------------------------------------------
// The Fishing Hut (Lighthouse Point, s9; footprint x -0.7..1.9, z -0.7..0.7; max 7)
// A drying rack hung with fish; then a little smoke shed; then the Fish Market: a stall with fish on ice under a
// striped awning and a giant wooden fish sign.
// ---------------------------------------------------------------------------
function rack(g, x0, x1, zc, legs) {
  const wood = ink(C.wood2);
  for (const x of [x0, x1]) {
    for (const s of [-1, 1]) K.rod(g, wood, V(x, 0, zc + s * legs), V(x, 1.82, zc), 0.045, 6);
    K.beam(g, thin(C.wood3), V(x, 0.7, zc - legs * 0.62), V(x, 0.7, zc + legs * 0.62), 0.05, 0.05, 0.015);
  }
  K.rod(g, ink(C.woodDark), V(x0 - 0.08, 1.76, zc), V(x1 + 0.08, 1.76, zc), 0.035, 6);
  const cols = [C.fish, 0xb9c8d6, C.fishDark, 0xc9a26a, C.fish];
  const n = Math.max(3, Math.min(5, Math.round((x1 - x0) / 0.26)));
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.16 + ((x1 - x0 - 0.32) * i) / (n - 1);
    const len = 0.36 + (i % 2) * 0.08;
    K.rod(g, thin(C.rope), V(x, 1.76, zc), V(x, 1.58, zc), 0.008, 4);
    fish(g, x, 1.58 - len * 0.5, zc, len, cols[i], -PI / 2, (i % 2) * 0.4 - 0.2);
  }
}
function fishingArt(g, tier, R) {
  if (tier === 1) {
    rack(g, 0.62, 1.78, -0.05, 0.42);
    // a net drying over a low rail, a barrel of fish, a lobster pot, a coil of rope, an oar
    K.rod(g, ink(C.woodDark), V(-0.55, 0.85, -0.45), V(0.3, 0.85, -0.45), 0.03);
    for (const x of [-0.55, 0.3]) add(g, rbox(0.07, 0.85, 0.07, 0.02), ink(C.woodDark), x, 0.42, -0.45);
    for (let i = 0; i < 5; i++) K.rope(g, thin(C.net), [V(-0.5 + i * 0.19, 0.86, -0.45), V(-0.5 + i * 0.19 + 0.02, 0.52, -0.38), V(-0.5 + i * 0.19, 0.18, -0.32)], 0.012, 4);
    for (let k = 0; k < 3; k++) K.rope(g, thin(C.net), [V(-0.52, 0.72 - k * 0.22, -0.43 + k * 0.035), V(-0.1, 0.7 - k * 0.22, -0.42 + k * 0.035), V(0.28, 0.72 - k * 0.22, -0.43 + k * 0.035)], 0.01, 4);
    for (let i = 0; i < 4; i++) add(g, sph(6), ink(C.cork), -0.46 + i * 0.24, 0.18, -0.3, 0, 0, 0, [0.06, 0.045, 0.06]);
    barrel(g, -0.35, 0, 0.32, 0.55, C.barrel);
    for (let i = 0; i < 3; i++) fish(g, -0.4 + i * 0.07, 0.62, 0.3 + (i - 1) * 0.08, 0.3, i === 1 ? C.fishDark : C.fish, PI / 2 - 0.3 + i * 0.25, i);
    const lp = sub(g, 0.1, 0, 0.38, 0.4);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4) * PI;
      K.rod(lp, thin(C.wood3), V(-0.25, 0.04 + Math.sin(a) * 0.26, Math.cos(a) * 0.2), V(0.25, 0.04 + Math.sin(a) * 0.26, Math.cos(a) * 0.2), 0.015, 4);
    }
    for (const x of [-0.25, 0.25]) add(lp, torus(0.21, 0.02, 12, 3, PI), thin(C.wood3), x, 0.04, 0, 0, PI / 2, 0, [1, 1.25, 1]);
    add(g, torus(0.16, 0.05, 14, 5), ink(C.rope), 1.55, 0.05, 0.45, PI / 2);
    K.rod(g, ink(C.wood3), V(1.8, 0.05, -0.55), V(1.65, 1.2, -0.62), 0.03);
    add(g, rbox(0.14, 0.4, 0.04, 0.02), ink(C.wood3), 1.64, 1.25, -0.63, 0.05, 0, 0.12);
    return;
  }
  // the smoke shed (T2, T3): a little weathered hut with louvred vents and a smoking pipe
  const hut = sub(g, 0.07, 0, -0.02);
  const W = 1.34;
  const D = 1.0;
  const HH = 1.3;
  add(hut, rbox(W + 0.06, 0.12, D + 0.06, 0.03), ink(C.woodDark), 0, 0.06, 0);
  storey(hut, W, D, HH, 0.12, 0xa7c4d8, { band: C.woodDark, postW: 0.14, bandW: 0.1 });
  flushWin(sub(hut, 0, 0, -D / 2, PI), 0, 0.95, 0, 0.36, 0.3, true);
  doorway(hut, -0.3, D / 2, C.teal, 0.48, 1.05, false);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(hut, box(0.04, 0.05, 0.5), thin(C.woodDeep), s * (W / 2 + 0.01), 0.95 + i * 0.12, 0);
  add(hut, rbox(0.32, 0.3, 0.04, 0.02), winGlow(), 0.33, 0.95, D / 2 + 0.01);
  add(hut, rbox(0.42, 0.4, 0.03, 0.02), ink(C.woodDeep), 0.33, 0.95, D / 2 - 0.005);
  add(hut, box(0.03, 0.3, 0.05), thin(C.woodDeep), 0.33, 0.95, D / 2 + 0.03);
  gable(hut, 1.4, 1.04, 0.12 + HH + 0.1, 0.6, 0x3a6fd8, { rand: R, gable: 0xa7c4d8, inset: 0.04, patches: 1 });
  stovepipe(hut, -0.42, 1.75, 2.4, -0.28, 0.5);
  // smoked fish on a rod across the hut's front, under the eave
  K.rod(hut, thin(C.iron), V(0.05, 1.38, D / 2 + 0.06), V(0.6, 1.38, D / 2 + 0.06), 0.012);
  for (let i = 0; i < 3; i++) fish(hut, 0.12 + i * 0.22, 1.22, D / 2 + 0.07, 0.22, 0xc9864a, -PI / 2, 0, false);
  if (tier === 2) {
    rack(g, 1.0, 1.76, -0.05, 0.42);
    barrel(g, 1.6, 0, 0.44, 0.45, C.barrel);
    crate(g, 0.95, 0, 0.45, 0.4, 0.2);
    return;
  }
  // T3: the Fish Market: a counter of fish on ice under a striped awning, the rack behind, the giant fish sign
  rack(g, 1.02, 1.76, -0.32, 0.32);
  const ct = sub(g, 1.38, 0, 0.42);
  add(ct, rbox(0.86, 0.78, 0.48, 0.04), ink(C.wood2), 0, 0.39, 0);
  for (let i = 0; i < 4; i++) add(ct, box(0.04, 0.7, 0.03), thin(shade(C.wood2, -0.25)), -0.3 + i * 0.2, 0.39, 0.25);
  add(ct, rbox(0.82, 0.08, 0.44, 0.03), flat(0xeaf6ff), 0, 0.81, 0);
  for (let i = 0; i < 6; i++) add(ct, sph(6), flat(0xdff2ff), -0.32 + (i % 3) * 0.32, 0.85, -0.12 + Math.floor(i / 3) * 0.22, 0, i, 0, [0.09, 0.04, 0.09]);
  const fc = [C.fish, C.fishDark, 0xf2a0a0, 0xc9a26a];
  for (let i = 0; i < 4; i++) fish(ct, -0.3 + i * 0.2, 0.88, (i % 2) * 0.1 - 0.05, 0.28, fc[i], 0, 0, true).rotation.set(PI / 2, 0, 0.3 * (i - 1.5));
  // a crab on the ice
  add(ct, sph(8), ink(C.red), 0.3, 0.9, 0.14, 0, 0, 0, [0.08, 0.05, 0.06]);
  for (const s of [-1, 1]) add(ct, sph(6), ink(C.red), 0.3 + s * 0.09, 0.9, 0.2, 0, 0, 0, [0.035, 0.03, 0.035]);
  // the awning on two posts
  for (const px of [0.93, 1.83]) add(g, cyl(0.04, 0.045, 1.95, 8), ink(C.woodDark), px, 0.98, 0.63);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const w = 0.96 / n;
    const m = add(g, rbox(w + 0.01, 0.05, 0.62, 0.02), ink(i % 2 ? C.white : C.teal), 0.9 + w * (i + 0.5), 1.88, 0.32);
    m.rotation.x = 0.32;
    add(g, slab('awnScal', [[-0.12, 0], [0.12, 0], [0.1, -0.06], [0, -0.1], [-0.1, -0.06]], 0.04, 0.008), ink(i % 2 ? C.white : C.teal), 0.9 + w * (i + 0.5), 1.76, 0.63, 0, 0, 0, [w / 0.24, 1, 1]);
  }
  // the giant wooden fish sign, standing on two posts on the hut's ridge
  for (const px of [-0.2, 0.3]) add(g, rbox(0.08, 0.66, 0.08, 0.02), ink(C.woodDark), px, 2.52, -0.02);
  const fs = sub(g, 0.5, 3.2, -0.02);
  add(fs, fishGeo(2.0, 0.8, 0.12), ink(0x2bb3a3), 0, 0, 0);
  add(fs, fishGeo(1.2, 0.3, 0.14), ink(0xfaf6ee), 0.15, -0.12, 0, 0, 0, 0, [1, 1, 1]);
  for (let i = 0; i < 4; i++) add(fs, torus(0.12, 0.02, 10, 3, PI), thin(shade(0x2bb3a3, -0.3)), -0.3 + i * 0.22, 0.08, 0.07, 0, 0, -PI / 2);
  for (const s of [-1, 1]) {
    add(fs, sph(10), flat(C.white), 0.55, 0.08, s * 0.07, 0, 0, 0, 0.1);
    add(fs, sph(8), flat(C.black), 0.58, 0.08, s * 0.12, 0, 0, 0, 0.05);
  }
  add(fs, slab('finTop', [[-0.3, 0.3], [0.25, 0.33], [-0.1, 0.62]], 0.06, 0.012), ink(C.gold), 0, 0, 0);
  add(fs, slab('finBot', [[-0.2, -0.3], [0.15, -0.32], [-0.05, -0.52]], 0.06, 0.012), ink(C.gold), 0, 0, 0);
}

// ---------------------------------------------------------------------------
// The Goat Farm (Lantern Lane, s10; footprint x -2.4..1.2, z -2.15..0.95; max 6)
// A fenced goat pen with a little shed; then a red barn with a goat on its lean-to's roof; then the Dairy &
// Orchard: apple trees, milk churns, a windpump (its fan turns) and a water tank.
// ---------------------------------------------------------------------------
function appleTree(g, x, z, R, s = 1) {
  const t = sub(g, x, 0, z);
  t.scale.setScalar(s);
  K.rod(t, ink(C.trunk), V(0, 0, 0), V(0.05, 1.2, 0.02), 0.09, 7);
  K.rod(t, ink(C.trunk), V(0.03, 0.85, 0.0), V(-0.25, 1.35, 0.1), 0.05, 6);
  for (const [cx, cy, cz, r] of [[0, 1.7, 0, 0.5], [-0.28, 1.5, 0.12, 0.34], [0.28, 1.52, -0.1, 0.34], [0.05, 1.45, 0.3, 0.3]]) add(t, sph(10), ink(r > 0.4 ? C.leaf : C.leaf2), cx, cy, cz, 0, 0, 0, r);
  for (let i = 0; i < 9; i++) {
    const a = R() * TAU;
    const yy = 1.35 + R() * 0.55;
    const rr = 0.44 - Math.abs(yy - 1.62) * 0.35;
    add(t, sph(6), ink(C.apple), Math.cos(a) * rr, yy, Math.sin(a) * rr, 0, 0, 0, 0.06);
  }
  return t;
}
function churn(g, x, z, s = 1) {
  add(g, lathe('churn', [[0, 0], [0.16, 0], [0.17, 0.32], [0.12, 0.4], [0.08, 0.46], [0.09, 0.5], [0, 0.5]], 12), ink(0xc8ccd6), x, 0, z, 0, 0, 0, s);
  add(g, torus(0.165, 0.02, 12, 3), thin(C.iron), x, 0.2 * s, z, PI / 2, 0, 0, s);
}
function goat(g, x, y, z, ry) {
  const gt = sub(g, x, y, z, ry);
  const wht = ink(0xf6f2e8);
  add(gt, sph(10), wht, 0, 0.38, 0, 0, 0, 0, [0.18, 0.15, 0.28]);
  for (const sx of [-0.09, 0.09]) for (const sz of [-0.16, 0.16]) add(gt, cyl(0.03, 0.025, 0.3, 6), ink(0xd8d0c0), sx, 0.15, sz);
  add(gt, sph(10), wht, 0, 0.58, 0.3, 0, 0, 0, [0.1, 0.11, 0.13]);
  for (const s of [-1, 1]) {
    K.rod(gt, ink(0x8f8579), V(s * 0.04, 0.66, 0.28), V(s * 0.09, 0.78, 0.2), 0.018, 5);
    add(gt, sph(6), ink(0xf6f2e8), s * 0.11, 0.6, 0.27, 0, 0, s * 0.6, [0.07, 0.025, 0.04]);
    add(gt, sph(5), flat(C.black), s * 0.06, 0.61, 0.4, 0, 0, 0, 0.018);
  }
  add(gt, cone(0.035, 0.1, 6), ink(0xd8d0c0), 0, 0.46, 0.38, PI, 0, 0);
  add(gt, sph(6), ink(0xf6f2e8), 0, 0.46, -0.27, 0, 0, 0, [0.04, 0.07, 0.04]);
  return gt;
}
function farmArt(g, tier, R) {
  // the pen: a straw floor and a rail fence with a gate at the front
  add(g, rbox(3.5, 0.05, 3.0, 0.02), flat(0xe8cf7a), -0.6, 0.03, -0.6);
  for (let i = 0; i < 14; i++) {
    const m = add(g, box(0.4, 0.015, 0.03), flat(0xd4b45a), -2.1 + R() * 3.0, 0.06, -1.9 + R() * 2.6);
    m.rotation.y = R() * PI;
  }
  const FX = [-2.32, 1.12];
  const FZ = [-2.08, 0.88];
  fence(g, [FX[0], FZ[0]], [FX[1], FZ[0]]);
  fence(g, [FX[0], FZ[0]], [FX[0], FZ[1]]);
  fence(g, [FX[1], FZ[0]], [FX[1], FZ[1]]);
  fence(g, [FX[0], FZ[1]], [-0.95, FZ[1]]);
  fence(g, [-0.15, FZ[1]], [FX[1], FZ[1]]);
  const gate = sub(g, -0.95, 0, FZ[1], 0.5);
  for (const yy of [0.3, 0.7]) add(gate, rbox(0.78, 0.08, 0.05, 0.02), ink(C.wood3), 0.4, yy, 0);
  const br = add(gate, rbox(0.86, 0.07, 0.04, 0.02), ink(C.wood3), 0.4, 0.5, 0.01);
  br.rotation.z = 0.45;
  // a water trough and a hay bale (every tier)
  const tr = sub(g, 0.55, 0, -0.1, 0.1);
  add(tr, rbox(0.9, 0.32, 0.36, 0.05), ink(C.wood2), 0, 0.2, 0);
  add(tr, rbox(0.8, 0.03, 0.26, 0.01), flat(0x5fb8e8), 0, 0.35, 0);
  for (const sx of [-0.38, 0.38]) add(tr, rbox(0.06, 0.12, 0.42, 0.02), ink(C.woodDark), sx, 0.06, 0);
  const hay = (x, z, ry) => {
    const h = sub(g, x, 0, z, ry);
    add(h, rbox(0.7, 0.42, 0.45, 0.12), ink(0xf0d27a), 0, 0.22, 0);
    for (const sx of [-0.18, 0.18]) add(h, box(0.04, 0.44, 0.47), thin(0xc89a3a), sx, 0.22, 0);
  };
  hay(0.45, 0.45, 0.3);
  if (tier === 1) {
    // the goat shed: a little lean-to at the back left
    const sh = sub(g, -1.6, 0, -1.6);
    for (const [w, d, x, z] of [[1.3, 0.08, 0, -0.44], [0.08, 0.9, -0.62, 0], [0.08, 0.9, 0.62, 0]]) add(sh, rbox(w, 1.3, d, 0.03), ink(C.wood2), x, 0.65, z);
    for (let x = -0.5; x < 0.6; x += 0.25) add(sh, box(0.04, 1.2, 0.04), thin(shade(C.wood2, -0.25)), x, 0.65, -0.39);
    shedRoof(sh, -0.72, 0.72, 0.5, 1.5, -0.5, 1.2, ROOF_RED);
    hay(-1.75, -1.6, 0);
    add(g, cyl(0.12, 0.1, 0.22, 10), ink(C.iron), -0.55, 0.11, -1.4);
    add(g, torus(0.1, 0.012, 10, 3, PI), thin(C.iron), -0.55, 0.22, -1.4);
    return;
  }
  // the barn (T2, T3): red walls, white trim, a gambrel roof, big X-braced doors, a hayloft
  const bn = sub(g, -1.3, 0, -1.2);
  const W = 1.92;
  const D = 1.5;
  const H = 1.7;
  add(bn, rbox(W + 0.1, 0.12, D + 0.1, 0.03), ink(C.stoneDark), 0, 0.06, 0);
  storey(bn, W, D, H, 0.12, 0xc8483a, { post: C.white, band: C.white });
  const fz = D / 2;
  // the doors
  for (const s of [-1, 1]) {
    const d = sub(bn, s * 0.3, 0, fz + 0.04);
    add(d, rbox(0.58, 1.2, 0.06, 0.02), ink(0xc8483a), 0, 0.72, 0);
    for (const yy of [0.16, 1.28]) add(d, rbox(0.6, 0.08, 0.08, 0.02), ink(C.white), 0, yy, 0.01);
    for (const sx of [-0.27, 0.27]) add(d, rbox(0.08, 1.2, 0.08, 0.02), ink(C.white), sx, 0.72, 0.01);
    for (const r of [0.98, -0.98]) {
      const x = add(d, rbox(0.07, 1.25, 0.07, 0.02), ink(C.white), 0, 0.72, 0.02);
      x.rotation.z = r * 0.42;
    }
  }
  // the gambrel roof: steep lower slopes and shallow upper slopes, pentagon gable ends
  const ry0 = 0.12 + H + 0.1;
  const half = D / 2 + 0.12;
  const k1 = [half, 0];
  const k2 = [half * 0.55, 0.62];
  const k3 = [0, 0.9];
  for (const s of [-1, 1]) {
    for (const [p, q, c] of [[k1, k2, ROOF_RED], [k2, k3, shade(ROOF_RED, -0.1)]]) {
      const L = Math.hypot(p[0] - q[0], p[1] - q[1]);
      const m = add(bn, rbox(W + 0.16, 0.12, L + 0.08, 0.04), ink(c), 0, ry0 + (p[1] + q[1]) / 2, (s * (p[0] + q[0])) / 2);
      m.rotation.x = s * Math.atan2(p[1] - q[1], p[0] - q[0]) * -1;
    }
  }
  add(bn, cyl(0.1, 0.1, W + 0.12, 8), ink(shade(ROOF_RED, -0.3)), 0, ry0 + 0.95, 0, 0, 0, PI / 2);
  const pent = slab('barnEnd', [[-half + 0.12, 0], [half - 0.12, 0], [half * 0.55 - 0.08, 0.58], [0, 0.84], [-half * 0.55 + 0.08, 0.58]], 0.1, 0.02);
  for (const sx of [-1, 1]) add(bn, pent, ink(0xc8483a), sx * (W / 2 - 0.02), ry0 - 0.02, 0, 0, PI / 2, 0);
  const bb = sub(bn, 0, 0, -D / 2, PI);
  flushWin(bb, -0.45, 1.05, 0.02, 0.4, 0.4, true, C.white);
  flushWin(bb, 0.45, 1.05, 0.02, 0.4, 0.4, true, C.white);
  // the hayloft door with hay poking out, and the pulley beam
  const lf = sub(bn, 0, ry0 + 0.02, fz + 0.03);
  add(lf, rbox(0.44, 0.42, 0.06, 0.02), ink(C.woodDeep), 0, 0.26, 0);
  add(lf, rbox(0.5, 0.06, 0.08, 0.02), ink(C.white), 0, 0.5, 0.01);
  for (let i = 0; i < 5; i++) add(lf, box(0.04, 0.12, 0.12), ink(0xf0d27a), -0.16 + i * 0.08, 0.1, 0.05, 0.3, 0, (i - 2) * 0.2);
  K.beam(bn, ink(C.woodDark), V(0, ry0 + 0.72, fz - 0.05), V(0, ry0 + 0.72, fz + 0.32), 0.08, 0.08, 0.02);
  K.rod(bn, thin(C.rope), V(0, ry0 + 0.66, fz + 0.28), V(0, ry0 - 0.2, fz + 0.28), 0.012);
  // the lean-to at the barn's right with a grass roof, and a goat standing on it
  const lt = sub(g, 0.1, 0, -1.6);
  for (const [w, d, x, z] of [[0.75, 0.08, 0, -0.42], [0.08, 0.85, 0.36, 0]]) add(lt, rbox(w, 1.05, d, 0.03), ink(C.wood2), x, 0.52, z);
  add(lt, rbox(0.08, 1.1, 0.08, 0.02), ink(C.woodDark), 0.36, 0.55, 0.42);
  const sod = sub(lt, 0, 0, 0);
  shedRoof(sod, -0.42, 0.42, 0.48, 1.14, -0.48, 1.24, 0x6fae3e, { fascia: C.woodDark });
  for (let i = 0; i < 6; i++) add(lt, sph(6), ink(C.grass), -0.32 + (i % 3) * 0.32, 1.26, -0.25 + Math.floor(i / 3) * 0.45, 0, 0, 0, [0.12, 0.05, 0.12]);
  goat(lt, 0.02, 1.2, 0.02, -0.7);
  if (tier === 2) {
    hay(-0.2, -0.55, -0.4);
    add(g, cyl(0.12, 0.1, 0.22, 10), ink(C.iron), 0.0, 0.11, 0.2);
    return;
  }
  // T3: the Dairy & Orchard: two apple trees, milk churns, a cheese sign; the windpump and its tank
  appleTree(g, -1.75, 0.35, R, 0.95);
  appleTree(g, -0.6, 0.42, R, 0.85);
  for (const [x, z] of [[-0.12, -0.32], [0.08, -0.4], [-0.02, -0.18]]) churn(g, x, z, 1);
  const cs = sub(bn, 0.75, 0, fz + 0.06);
  add(cs, rbox(0.42, 0.32, 0.04, 0.02), ink(C.cream), 0, 1.4, 0);
  add(cs, slab('cheese', [[-0.14, -0.08], [0.14, -0.08], [0.14, 0.02], [-0.14, 0.1]], 0.04, 0.01), ink(C.yellow), 0, 1.4, 0.03);
  for (const [hx, hy] of [[-0.05, 1.38], [0.06, 1.42]]) add(cs, sph(5), flat(0xe0b02a), hx, hy, 0.06, 0, 0, 0, 0.02);
  const wp = { x: 0.62, z: -0.62 };
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.rod(g, ink(C.iron), V(wp.x + sx * 0.3, 0, wp.z + sz * 0.3), V(wp.x + sx * 0.08, 3.9, wp.z + sz * 0.08), 0.03, 5);
  for (const yy of [0.9, 1.9, 2.9]) {
    const r = 0.3 - (0.22 * yy) / 3.9;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) K.rod(g, thin(C.iron), V(wp.x + a[0] * r, yy, wp.z + a[1] * r), V(wp.x + b[0] * r, yy, wp.z + b[1] * r), 0.015, 4);
  }
  add(g, rbox(0.3, 0.06, 0.3, 0.02), ink(C.iron), wp.x, 3.9, wp.z);
  add(g, cyl(0.06, 0.06, 0.34, 8), ink(C.iron), wp.x, 4.08, wp.z);
  add(g, rbox(0.06, 0.06, 0.62, 0.02), ink(C.iron), wp.x, 4.2, wp.z - 0.32);
  add(g, slab('wpTail', [[0, -0.2], [0.42, -0.12], [0.42, 0.18], [0, 0.22]], 0.03, 0.01), ink(C.red), wp.x, 4.2, wp.z - 0.62, 0, PI / 2, 0);
  K.rod(g, thin(C.iron), V(wp.x, 3.9, wp.z), V(wp.x, 0.1, wp.z), 0.02, 4);
  const tk = sub(g, 0.8, 0, -1.72);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(tk, rbox(0.06, 0.62, 0.06, 0.02), ink(C.woodDark), sx * 0.24, 0.31, sz * 0.24);
  add(tk, cyl(0.33, 0.33, 0.72, 14), ink(0x8f9aa8), 0, 0.98, 0);
  for (const yy of [0.72, 1.24]) add(tk, torus(0.335, 0.02, 14, 3), thin(C.iron), 0, yy, 0, PI / 2);
  add(tk, cone(0.36, 0.2, 14), ink(0x7a8494), 0, 1.44, 0);
  anim(
    'windpump',
    wp.x,
    4.2,
    wp.z + 0.12,
    (p) => {
      add(p, cyl(0.08, 0.08, 0.1, 10), flat(C.iron), 0, 0, 0.0, PI / 2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const b = add(p, box(0.15, 0.4, 0.02), flat(i % 2 ? C.white : C.red), Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.03);
        b.rotation.set(0, 0.35, a - PI / 2, 'ZYX');
      }
      add(p, torus(0.52, 0.015, 24, 3), flat(C.iron), 0, 0, 0.03);
      add(p, torus(0.14, 0.015, 12, 3), flat(C.iron), 0, 0, 0.03);
    },
    (p, t) => {
      p.rotation.z = -t * 1.6;
    },
  );
}
const ROOF_RED = 0xa8323a;

// ---------------------------------------------------------------------------
// The Trophy Museum (Lantern Lane, s11; footprint x -1.2..2.4, z -2.15..0.95; max 9)
// A curio shed with an anchor and a cannon outside; then a stone museum with steps and columns; then the Grand
// Gallery: a dome with a gold anchor on its top.
// ---------------------------------------------------------------------------
function anchor(g, x, y, z, s = 1, mat = null, ry = 0) {
  const a = sub(g, x, y, z, ry);
  a.scale.setScalar(s);
  const m = mat || ink(C.iron);
  add(a, rbox(0.1, 1.1, 0.1, 0.03), m, 0, 0.55, 0);
  add(a, rbox(0.6, 0.08, 0.08, 0.03), m, 0, 0.92, 0);
  add(a, torus(0.1, 0.035, 12, 4), m, 0, 1.18, 0);
  add(a, torus(0.42, 0.05, 18, 5, PI), m, 0, 0.45, 0, 0, 0, PI);
  for (const sx of [-1, 1]) add(a, cone(0.11, 0.22, 4), m, sx * 0.42, 0.52, 0, 0, 0, sx * -0.4);
  return a;
}
function cannon(g, x, z, ry) {
  const c = sub(g, x, 0, z, ry);
  add(c, rbox(0.42, 0.18, 0.7, 0.04), ink(C.wood2), 0, 0.22, 0);
  for (const sx of [-1, 1]) for (const sz of [-0.22, 0.22]) add(c, cyl(0.12, 0.12, 0.06, 12), ink(C.woodDark), sx * 0.22, 0.12, sz, 0, 0, PI / 2);
  add(c, lathe('cannon4', [[0, -0.42], [0.13, -0.42], [0.15, -0.3], [0.12, 0.1], [0.1, 0.38], [0.12, 0.42], [0, 0.42]], 12), ink(C.iron), 0, 0.42, 0.05, PI / 2 - 0.2, 0, 0);
  for (let i = 0; i < 3; i++) add(c, sph(8), ink(C.iron), -0.1 + i * 0.1, 0.06, 0.48, 0, 0, 0, 0.06);
  return c;
}
function chest(g, x, z, ry) {
  const c = sub(g, x, 0, z, ry);
  add(c, rbox(0.5, 0.3, 0.32, 0.04), ink(0x8a5a2a), 0, 0.15, 0);
  add(c, cyl(0.16, 0.16, 0.5, 12, false), ink(0x8a5a2a), 0, 0.3, 0, 0, 0, PI / 2, [1, 0.7, 1]);
  for (const sx of [-0.18, 0.18]) add(c, rbox(0.05, 0.42, 0.34, 0.01), ink(C.gold), sx, 0.2, 0);
  add(c, rbox(0.08, 0.1, 0.04, 0.01), ink(C.gold), 0, 0.28, 0.17);
}
function museumArt(g, tier, R) {
  const STONE = 0xf1e6cf;
  if (tier === 1) {
    const sh = sub(g, 0.6, 0, -1.12);
    const W = 2.1;
    const D = 1.5;
    add(sh, rbox(W + 0.2, 0.14, D + 0.2, 0.04), ink(C.woodDark), 0, 0.07, 0);
    storey(sh, W, D, 1.75, 0.14, 0x7fbcd2, { clap: true, post: C.white, band: C.white });
    doorway(sh, -0.45, D / 2, C.red, 0.62, 1.3);
    porthole(sh, 0.48, 1.08, D / 2 + 0.02, 0.3, true);
    porthole(sub(sh, 0, 0, -D / 2, PI), 0, 1.08, 0.02, 0.22, true);
    // a ship in a bottle on the sill
    add(sh, rbox(0.7, 0.06, 0.18, 0.02), ink(C.wood2), 0.48, 0.72, D / 2 + 0.1);
    add(sh, cyl(0.07, 0.07, 0.36, 10), ink(0x9fd8a8), 0.48, 0.82, D / 2 + 0.12, 0, 0, PI / 2);
    add(sh, cyl(0.03, 0.03, 0.1, 8), ink(C.cork), 0.7, 0.82, D / 2 + 0.12, 0, 0, PI / 2);
    // the sign over the door: a board with a painted ship's wheel
    add(sh, rbox(0.7, 0.3, 0.05, 0.02), ink(C.woodDark), -0.45, 1.68, D / 2 + 0.08);
    add(sh, torus(0.09, 0.02, 12, 3), ink(C.gold), -0.45, 1.68, D / 2 + 0.12);
    for (let i = 0; i < 4; i++) add(sh, box(0.24, 0.02, 0.02), ink(C.gold), -0.45, 1.68, D / 2 + 0.12, 0, 0, (i * PI) / 4);
    wavyRoof(sh, W + 0.5, D + 0.32, 1.95, 0.85, 0x2b3866, C.white, R, { inset: 0.25 });
    anchor(g, -0.75, 0, -0.7, 0.85, null, 0.3);
    cannon(g, 1.65, 0.35, -0.5);
    chest(g, 0.1, 0.45, 0.2);
    barrel(g, 2.05, 0, -0.85, 0.5, C.barrel2);
    return;
  }
  // the museum (T2, T3): a stone hall on a plinth, a portico of four columns with steps, a pediment
  const hx = 0.6;
  const W = 3.0;
  const D = 1.7;
  const hz = -1.08;
  const H = 2.45;
  const hall = sub(g, hx, 0, hz);
  add(hall, rbox(W + 0.3, 0.29, D + 0.24, 0.04), ink(C.stone), 0, 0.145, 0);
  storey(hall, W, D, H, 0.3, STONE, { stone: true, post: false, band: false });
  add(hall, rbox(W + 0.3, 0.22, D + 0.3, 0.05), ink(STONE), 0, 0.3 + H + 0.1, 0);
  add(hall, rbox(W + 0.38, 0.1, D + 0.38, 0.03), ink(C.stone), 0, 0.3 + H + 0.25, 0);
  for (const s of [-1, 1]) {
    // tall arched windows on the sides and the front
    const sd = sub(hall, s * (W / 2), 0, 0, (s * PI) / 2);
    flushWin(sd, 0, 1.55, 0.02, 0.48, 0.9, true, C.stone);
    add(sd, cyl(0.24, 0.24, 0.06, 12), winGlow(), 0, 2.0, 0.025, PI / 2, 0, 0, [1, 1, 0.6]);
    flushWin(hall, s * 1.0, 1.55, D / 2 + 0.02, 0.48, 0.9, true, C.stone);
    add(hall, cyl(0.24, 0.24, 0.06, 12), winGlow(), s * 1.0, 2.0, D / 2 + 0.045, PI / 2, 0, 0, [1, 1, 0.6]);
  }
  const bk = sub(hall, 0, 0, -D / 2, PI);
  for (const x of [-0.75, 0.75]) {
    flushWin(bk, x, 1.55, 0.02, 0.48, 0.9, true, C.stone);
    add(bk, cyl(0.24, 0.24, 0.06, 12), winGlow(), x, 2.0, 0.045, PI / 2, 0, 0, [1, 1, 0.6]);
  }
  // the great door
  add(hall, rbox(0.9, 1.5, 0.08, 0.03), ink(C.stone), 0, 0.3 + 0.75, D / 2 + 0.03);
  add(hall, rbox(0.72, 1.36, 0.1, 0.03), ink(0x2e6b4f), 0, 0.3 + 0.7, D / 2 + 0.05);
  add(hall, box(0.02, 1.3, 0.12), thin(0x1d4a36), 0, 0.3 + 0.7, D / 2 + 0.06);
  for (const s of [-1, 1]) add(hall, sph(6), ink(C.brass), s * 0.08, 1.05, D / 2 + 0.12, 0, 0, 0, 0.045);
  // the portico: a floor, steps, four columns, an entablature and a pediment with the gold anchor
  const fz = hz + D / 2;
  add(g, rbox(2.6, 0.12, 0.84, 0.03), ink(C.stone), hx, 0.39, fz + 0.4);
  for (let k = 0; k < 3; k++) add(g, rbox(1.6 + (2 - k) * 0.0, 0.13, 0.28, 0.03), ink(k % 2 ? C.stone : 0xe0d6c0), hx, 0.065 + k * 0.13, fz + 0.86 - k * 0.12 - 0.0);
  const colX = [-0.95, -0.32, 0.32, 0.95];
  const cz = fz + 0.62;
  for (const x of colX) {
    add(g, cyl(0.12, 0.13, 2.2, 12), ink(C.white), hx + x, 0.45 + 1.1, cz);
    for (let i = 0; i < 4; i++) add(g, box(0.02, 2.1, 0.02), thin(0xd8d0c0), hx + x + Math.cos(i * 1.57) * 0.12, 1.55, cz + Math.sin(i * 1.57) * 0.12);
    add(g, rbox(0.32, 0.12, 0.32, 0.03), ink(tier >= 3 ? C.gold : C.white), hx + x, 2.68, cz);
    add(g, rbox(0.3, 0.1, 0.3, 0.03), ink(C.white), hx + x, 0.5, cz);
  }
  add(g, rbox(2.5, 0.24, 0.4, 0.04), ink(STONE), hx, 2.86, cz - 0.02);
  add(g, rbox(2.6, 0.08, 0.46, 0.02), ink(C.stone), hx, 3.0, cz - 0.02);
  add(g, rbox(2.5, 0.06, 1.0, 0.02), ink(STONE), hx, 2.96, fz + 0.22);
  const ped = slab('pediment', [[-1.28, 0], [1.28, 0], [0, 0.62]], 0.32, 0.03);
  add(g, ped, ink(STONE), hx, 3.04, cz - 0.04);
  add(g, slab('pedTrim', [[-1.36, -0.04], [1.36, -0.04], [0, 0.68]], 0.06, 0.02), ink(C.stone), hx, 3.04, cz - 0.24);
  anchor(g, hx, 3.1, cz + 0.13, 0.36, ink(C.gold));
  // the T1 treasures on show: the anchor on a plinth, the cannon, the chest
  add(g, rbox(0.5, 0.24, 0.44, 0.03), ink(C.stone), -0.88, 0.12, 0.62);
  anchor(g, -0.88, 0.24, 0.62, 0.6, null, 0.2);
  cannon(g, 1.98, 0.36, -0.35);
  if (tier === 2) {
    // red banners on the facade
    for (const s of [-1, 1]) {
      add(hall, rbox(0.34, 0.8, 0.03, 0.01), ink(C.red), s * 1.0, 2.35, D / 2 + 0.06 + 0.0, 0, 0, 0, [1, 1, 1]);
      add(hall, cyl(0.02, 0.02, 0.44, 6), ink(C.gold), s * 1.0, 2.77, D / 2 + 0.08, 0, 0, PI / 2);
    }
    return;
  }
  // T3: the Grand Gallery: a drum with round windows and a teal dome with gold ribs, the gold anchor on top; urns
  const dz = hz;
  const dy = 0.3 + H + 0.3;
  add(g, cyl(0.9, 0.92, 0.86, 22), ink(STONE), hx, dy + 0.43, dz);
  add(g, cyl(0.97, 0.97, 0.1, 22), ink(C.stone), hx, dy + 0.9, dz);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + PI / 8;
    const w = sub(g, hx + Math.sin(a) * 0.9, dy + 0.45, dz + Math.cos(a) * 0.9, a);
    porthole(w, 0, 0, 0, 0.14, true, C.gold);
  }
  add(g, domeGeo(20), ink(0x3fa8a0), hx, dy + 0.94, dz, 0, 0, 0, [0.92, 0.95, 0.92]);
  for (let i = 0; i < 8; i++) add(g, torus(1.0, 0.025, 18, 3, PI / 2), ink(C.gold), hx, dy + 0.94, dz, 0, (i / 8) * TAU, PI / 2, [0.925, 0.955, 1]);
  add(g, cyl(0.16, 0.2, 0.2, 10), ink(C.gold), hx, dy + 1.92, dz);
  anchor(g, hx, dy + 2.0, dz, 0.75, ink(C.gold));
  for (const s of [-1, 1]) {
    const ux = hx + s * (W / 2 - 0.05);
    add(g, lathe('urn', [[0, 0], [0.14, 0], [0.1, 0.06], [0.18, 0.24], [0.12, 0.4], [0.16, 0.46], [0, 0.46]], 12), ink(STONE), ux, 0.3 + H + 0.36, hz + D / 2 - 0.05);
    flagPole(g, ux, 0.3 + H + 0.36, 0.3 + H + 1.75, hz - 0.25, s > 0 ? C.red : C.blue, PI / 2 - 0.2, 0.5, 0.32);
  }
}

// ---------------------------------------------------------------------------
// The Aquarium (Lantern Lane, s12; footprint x -2.9..2.9, z -0.95..0.95; max 7)
// A tide pool in a ring of stones; then a long hall with a big glass tank front; then the Grand Aquarium: a glass
// dome on the roof and the tide pool made a turtle pool. The water in the tank shimmers (one mesh).
// ---------------------------------------------------------------------------
function starfish(g, x, y, z, col, s = 1, rx = -PI / 2, rz = 0) {
  const m = add(g, starGeo(0.13 * s, 0.04), ink(col), x, y, z, rx, 0, rz);
  return m;
}
function tidePool(g, cx, cz, a, b, R, turtle) {
  // a ring of stones round an oval of water, starfish, shells, an anemone and seaweed
  add(g, cyl(1, 1, 0.08, 24), flat(0x5fc8e0), cx, 0.3, cz, 0, 0, 0, [a, 1, b]);
  add(g, cyl(1, 1, 0.3, 24), ink(0xd8c9a8), cx, 0.15, cz, 0, 0, 0, [a + 0.02, 1, b + 0.02]);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const s = 0.18 + R() * 0.06;
    rock(g, cx + Math.cos(t) * a, 0.3 + R() * 0.04, cz + Math.sin(t) * b, s * 1.25, s * 0.85, s, i % 3 ? 0xb8b4ac : 0x9a968e, R);
  }
  starfish(g, cx + a * 0.62, 0.52, cz - b * 0.55, C.orange, 1.0, -PI / 2 + 0.3, 0.3);
  starfish(g, cx - a * 0.75, 0.5, cz + b * 0.35, C.pink, 0.9, -PI / 2 - 0.2, 1.1);
  for (let i = 0; i < 3; i++) K.rod(g, ink(C.leaf2), V(cx - a * 0.3 + i * 0.2, 0.2, cz - b * 0.2), V(cx - a * 0.3 + i * 0.22 + 0.05, 0.62 + (i % 2) * 0.12, cz - b * 0.25), 0.035, 5);
  for (let i = 0; i < 6; i++) add(g, cyl(0.014, 0.02, 0.16, 5), ink(C.pink), cx + a * 0.25 + Math.cos(i) * 0.08, 0.38, cz + b * 0.2 + Math.sin(i) * 0.08, Math.cos(i) * 0.4, 0, Math.sin(i) * 0.4);
  add(g, sph(8), ink(0xd04b6b), cx + a * 0.25, 0.33, cz + b * 0.2, 0, 0, 0, [0.08, 0.06, 0.08]);
  if (turtle) {
    // a little sand island with a palm sprout and a ramp into the water
    add(g, sph(12), ink(C.sand), cx + 0.1, 0.28, cz, 0, 0, 0, [a * 0.42, 0.18, b * 0.45]);
    K.rod(g, ink(C.trunk), V(cx + 0.1, 0.4, cz), V(cx + 0.18, 0.95, cz - 0.05), 0.04, 6);
    for (let i = 0; i < 5; i++) {
      const f = add(g, frondGeo(), ink(i % 2 ? C.leaf : C.leaf2), cx + 0.18, 0.95, cz - 0.05);
      f.rotation.set(-0.15, (i / 5) * TAU, 0, 'YXZ');
      f.scale.setScalar(0.17);
    }
    const rp = add(g, rbox(0.3, 0.04, 0.42, 0.01), ink(C.wood3), cx - a * 0.35, 0.36, cz + 0.05);
    rp.rotation.z = 0.35;
  }
}
function aquariumArt(g, tier, R) {
  tidePool(g, -1.75, 0.0, 0.75, 0.62, R, tier >= 3);
  if (tier === 1) {
    bench(g, 0.6, 0.35, 0, C.wood3, 1.2);
    // a painted sign of a fish on a post, buckets and a net
    add(g, rbox(0.08, 1.3, 0.08, 0.02), ink(C.woodDark), 1.6, 0.65, -0.3);
    add(g, rbox(0.7, 0.42, 0.05, 0.02), ink(C.teal), 1.6, 1.3, -0.26);
    fish(g, 1.6, 1.3, -0.22, 0.42, C.orange, 0, 0, true);
    for (const [x, c] of [[0.0, C.red], [2.3, C.yellow]]) {
      add(g, cyl(0.15, 0.12, 0.28, 12), ink(c), x, 0.14, -0.5);
      add(g, torus(0.15, 0.012, 12, 3, PI), thin(C.iron), x, 0.28, -0.5);
    }
    K.rod(g, ink(C.wood3), V(2.5, 0, 0.5), V(2.25, 1.3, 0.3), 0.025);
    add(g, torus(0.16, 0.015, 12, 3), ink(C.iron), 2.24, 1.36, 0.29, 0.4);
    for (let i = 0; i < 3; i++) K.rope(g, thin(C.net), [V(2.12 + i * 0.1, 1.38, 0.3), V(2.18 + i * 0.08, 1.12, 0.36), V(2.24 + i * 0.03, 1.38, 0.24)], 0.008, 3);
    return;
  }
  // the hall (T2, T3): white and blue, a big glass tank front with fish and bubbles, a door at the right end
  const hx = 1.25;
  const W = 3.05;
  const D = 1.4;
  const H = 2.25;
  const hall = sub(g, hx, 0, 0);
  add(hall, rbox(W + 0.16, 0.14, D + 0.16, 0.04), ink(C.stoneDark), 0, 0.07, 0);
  storey(hall, W, D, H, 0.14, 0xf4fbff, { plain: true, post: 0x3a6fd8, band: 0x3a6fd8 });
  for (let yy = 0.5; yy < H; yy += 0.5) add(hall, box(W + 0.02, 0.06, D + 0.02), thin(0xbfe4f5), 0, yy, 0);
  const fz = D / 2;
  // the tank: an aqua window in a blue frame, sand, seaweed, fish, bubbles
  const tx = -0.35;
  const TW = 2.0;
  const TH = 1.45;
  add(hall, rbox(TW + 0.2, TH + 0.2, 0.08, 0.03), ink(0x3a6fd8), tx, 1.18, fz + 0.02);
  add(hall, rbox(TW, TH, 0.06, 0.02), flat(0x5fd0e8), tx, 1.18, fz + 0.05);
  add(hall, rbox(TW, 0.22, 0.02, 0.01), flat(C.sand), tx, 0.57, fz + 0.085);
  for (let i = 0; i < 5; i++) {
    const x = tx - 0.85 + i * 0.42;
    K.rod(hall, flat(i % 2 ? 0x3f9a46 : 0x5fbf4a), V(x, 0.55, fz + 0.09), V(x + 0.05, 0.85 + (i % 3) * 0.15, fz + 0.09), 0.035, 4);
  }
  const fishCols = [C.orange, C.yellow, 0xff6f91, 0x9b6fd6, C.white];
  for (let i = 0; i < 5; i++) {
    const f = fish(hall, tx - 0.72 + i * 0.36, 1.0 + ((i * 3) % 4) * 0.17, fz + 0.1, 0.24 + (i % 2) * 0.06, fishCols[i], 0, i % 2 ? PI : 0, true);
    f.scale.z = 0.5;
  }
  for (let i = 0; i < 6; i++) add(hall, sph(6), flat(C.white), tx + 0.6 + (i % 2) * 0.06, 1.0 + i * 0.12, fz + 0.1, 0, 0, 0, 0.025 + (i % 3) * 0.01);
  // the door and a porthole by it, a fish emblem over the door
  doorway(hall, 1.13, fz, 0x3a6fd8, 0.56, 1.3, false);
  porthole(hall, 1.13, 1.82, fz + 0.03, 0.15, true, C.white);
  for (const s of [-1, 1]) {
    const sd = sub(hall, s * (W / 2), 0, 0, (s * PI) / 2);
    porthole(sd, -0.3, 1.3, 0.02, 0.17, true, 0x3a6fd8);
    porthole(sd, 0.3, 1.3, 0.02, 0.17, true, 0x3a6fd8);
  }
  const bk = sub(hall, 0, 0, -D / 2, PI);
  for (const x of [-1.0, 0.0, 1.0]) porthole(bk, x, 1.3, 0.02, 0.18, true, 0x3a6fd8);
  for (const [x, c] of [[-0.5, C.orange], [0.5, C.yellow]]) fish(bk, x, 0.75, 0.05, 0.42, c, 0, x > 0 ? PI : 0, true).scale.z = 0.4;
  // the roof: a flat teal roof with a wavy cornice
  add(hall, rbox(W + 0.2, 0.2, D + 0.22, 0.05), ink(C.teal), 0, 0.14 + H + 0.15, 0);
  for (const s of [-1, 1]) add(hall, wavyGeo(W + 0.2), ink(0x3a6fd8), 0, 0.14 + H + 0.03, s * (D / 2 + 0.12), 0, s > 0 ? 0 : PI, 0);
  // the water's shimmer on the tank: pale ripples drifting (one mesh, 0.12 Hz)
  anim(
    'shimmer',
    hx + tx,
    1.18,
    fz + 0.09,
    (p) => {
      for (let i = 0; i < 6; i++) add(p, sph(8), flat(0xd6f7ff), -0.75 + i * 0.3, 0.45 - (i % 3) * 0.3, 0, 0, 0, 0, [0.16, 0.025, 0.01]);
    },
    (p, t) => {
      p.position.x = Math.sin(t * TAU * 0.12) * 0.1;
      p.position.y = Math.sin(t * TAU * 0.09 + 1) * 0.05;
    },
  );
  if (tier === 2) {
    add(hall, rbox(0.9, 0.3, 0.05, 0.02), ink(0x3a6fd8), -0.35, 2.12, fz + 0.03);
    for (let i = 0; i < 3; i++) fish(hall, -0.65 + i * 0.3, 2.12, fz + 0.07, 0.2, [C.yellow, C.white, C.orange][i], 0, 0, false);
    return;
  }
  // T3: the glass dome on a drum, white ribs, a gold fish on top
  const dy = 0.14 + H + 0.25;
  add(hall, cyl(0.74, 0.78, 0.42, 20), ink(C.white), -0.1, dy + 0.21, 0);
  add(hall, torus(0.76, 0.05, 20, 4), ink(0x3a6fd8), -0.1, dy + 0.42, 0, PI / 2);
  add(hall, domeGeo(18), ink(0x9fe3f0), -0.1, dy + 0.42, 0, 0, 0, 0, [0.76, 0.9, 0.76]);
  for (let i = 0; i < 6; i++) add(hall, torus(0.77, 0.022, 16, 3, PI / 2), ink(C.white), -0.1, dy + 0.42, 0, 0, (i / 6) * TAU, PI / 2, [1, 1.17, 1]);
  for (let i = 0; i < 3; i++) add(hall, torus(0.7 - i * 0.2, 0.02, 18, 3), ink(C.white), -0.1, dy + 0.62 + i * 0.22, 0, PI / 2, 0, 0, [1, 1, 1]);
  add(hall, sph(8), ink(C.gold), -0.1, dy + 1.32, 0, 0, 0, 0, 0.08);
  const gf = fish(hall, -0.1, dy + 1.62, 0, 0.5, C.gold, PI / 2, 0, true);
  gf.rotation.set(0, 0.3, PI / 2.3);
}

// ---------------------------------------------------------------------------
// The Houseboat Moorings (Lighthouse Point, s17; footprint x -1.2..2.4, z -2.1..0.9; max 8)
// A rowboat turned keel-up over a little hut; then a houseboat moored alongside (a cabin on a barge) with its
// gangplank and lines to the posts on the deck; then the Floating Manor: two decks, flower boxes, a figurehead.
// ---------------------------------------------------------------------------
const hullGeo = () =>
  cached('rowboatHull', () => {
    const g = new T.SphereGeometry(1, 18, 8, 0, TAU, 0, PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setZ(i, z * (1 - 0.78 * x * x));
      p.setY(i, p.getY(i) * (1 - 0.25 * x * x));
    }
    g.computeVertexNormals();
    g.deleteAttribute('uv');
    return g;
  });
function lifebuoy(g, x, y, z, ry = 0, s = 1) {
  const b = sub(g, x, y, z, ry);
  for (let i = 0; i < 4; i++) add(b, torus(0.2 * s, 0.065 * s, 6, 6, PI / 2), ink(i % 2 ? C.white : C.red), 0, 0, 0, 0, 0, (i * PI) / 2);
}
function homeFArt(g, tier, R) {
  // the rowboat home: low walls under an upturned hull, a door, portholes, a stovepipe through the hull
  const bx = 0.62;
  const bz = -0.95;
  const h = sub(g, bx, 0, bz);
  add(h, rbox(2.7, 0.12, 1.36, 0.04), ink(C.woodDark), 0, 0.06, 0);
  storey(h, 2.5, 1.2, 1.24, 0.12, 0xfde29a, { clap: true, post: C.white, band: C.white });
  // (the hull keel-up: the dome's crown is its keel, its rim the gunwale on the walls)
  const hb = sub(h, 0, 1.46, 0);
  hb.rotation.z = 0.05;
  add(hb, hullGeo(), ink(0xd04b3a), 0, 0.02, 0, 0, 0, 0, [1.58, 0.58, 0.9]);
  add(hb, hullGeo(), ink(C.white), 0, -0.02, 0, 0, 0, 0, [1.6, 0.15, 0.92]);
  add(hb, hullGeo(), ink(0x2b3866), 0, -0.08, 0, 0, 0, 0, [1.61, 0.07, 0.93]);
  add(hb, rbox(2.3, 0.08, 0.1, 0.03), ink(C.woodDark), 0, 0.6, 0);
  for (const s of [-1, 1]) add(hb, rbox(0.1, 0.56, 0.1, 0.03), ink(C.woodDark), s * 1.47, 0.3, 0, 0, 0, s * 0.7);
  doorway(h, -0.5, 0.6, C.teal, 0.56, 0.95, true);
  porthole(h, 0.25, 0.75, 0.62, 0.15, true);
  porthole(h, 0.85, 0.75, 0.62, 0.15, true);
  for (const s of [-1, 1]) porthole(sub(h, s * 1.25, 0, 0, (s * PI) / 2), 0, 0.72, 0.0, 0.14, true);
  stovepipe(h, 0.7, 1.95, 2.6, -0.2, 0.45);
  for (const x of [-0.6, 0.6]) porthole(sub(h, 0, 0, -0.6, PI), x, 0.78, 0.02, 0.15, true);
  lifebuoy(h, 0.55, 1.22, 0.68, 0, 0.75);
  // oars crossed by the door, flower pots, a lobster pot
  for (const s of [-1, 1]) {
    const o = sub(h, -1.05, 0.62, 0.68);
    o.rotation.z = s * 0.5;
    add(o, rbox(0.04, 1.0, 0.04, 0.01), ink(C.wood3), 0, 0, 0);
    add(o, rbox(0.1, 0.26, 0.03, 0.01), ink(C.wood3), 0, 0.5, 0);
  }
  flowerPot(g, -0.62, 0, -0.05, C.pink, 1);
  flowerPot(g, 1.95, 0, -0.1, C.yellow, 0.9);
  flowerPot(g, 1.9, 0, -1.75, C.red, 0.9);
  if (tier === 1) {
    crate(g, 1.95, 0, 0.45, 0.42, 0.4);
    add(g, torus(0.16, 0.05, 14, 5), ink(C.rope), -0.75, 0.05, 0.45, PI / 2);
    return;
  }
  // T2, T3: two mooring posts at the deck's edge, and the houseboat moored alongside (its own group)
  for (const pz of [-1.75, 0.5]) {
    add(g, cyl(0.12, 0.14, 0.9, 10), ink(C.woodDark), 2.22, 0.45, pz);
    add(g, sph(8), ink(C.woodDark), 2.22, 0.9, pz, 0, 0, 0, [0.13, 0.08, 0.13]);
    add(g, torus(0.13, 0.04, 12, 4), thin(C.rope), 2.22, 0.62, pz, PI / 2);
  }
  if (tier >= 3) {
    // a flower arch at the gangplank's head
    const ar = sub(g, 2.12, 0, -0.62, PI / 2);
    for (const s of [-1, 1]) add(ar, rbox(0.08, 1.9, 0.08, 0.02), ink(C.white), s * 0.42, 0.95, 0);
    add(ar, torus(0.42, 0.045, 16, 4, PI), ink(C.white), 0, 1.9, 0);
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * PI;
      add(ar, sph(6), ink(FLOWERS[i % 5]), Math.cos(a) * 0.43, 1.9 + Math.sin(a) * 0.43, 0.05, 0, 0, 0, 0.08);
      add(ar, sph(6), ink(C.leaf), Math.cos(a + 0.15) * 0.44, 1.9 + Math.sin(a + 0.15) * 0.44, -0.04, 0, 0, 0, 0.07);
    }
  }
  const at = { x: 4.35, z: -0.62, ry: 0 };
  g.userData.moored = { group: houseboat(tier, R, at), ...at };
}
function houseboat(tier, R, at) {
  // in its own frame: the waterline at y = 0, its length along z (bow +z), the platform's deck 1.6 u up at x -1.35
  const hb = new T.Group();
  hb.name = 'plot4-houseboat';
  const smoke0 = SMOKE;
  SMOKE = [];
  const L = 4.4;
  const B = 2.0;
  add(hb, rbox(B, 0.7, L, 0.22, 2), ink(0x7a3b2e), 0, 0.12, 0);
  add(hb, rbox(B + 0.06, 0.12, L + 0.06, 0.05), ink(C.white), 0, 0.4, 0);
  add(hb, rbox(B - 0.12, 0.08, L - 0.12, 0.03), ink(C.wood3), 0, 0.5, 0);
  for (let i = 1; i < 6; i++) add(hb, box(0.03, 0.02, L - 0.2), thin(shade(C.wood3, -0.25)), -B / 2 + (B * i) / 6, 0.545, 0);
  // bow and stern rails, cleats, a lifebuoy, fenders over the side
  for (const sz of [-1, 1]) {
    for (let x = -0.85; x <= 0.86; x += 0.34) add(hb, box(0.04, 0.4, 0.04), thin(C.white), x, 0.74, sz * (L / 2 - 0.12));
    K.beam(hb, ink(C.white), V(-0.9, 0.95, sz * (L / 2 - 0.12)), V(0.9, 0.95, sz * (L / 2 - 0.12)), 0.06, 0.06, 0.02);
  }
  for (const z of [-1.2, 1.1]) add(hb, rbox(0.24, 0.06, 0.1, 0.02), ink(C.iron), -B / 2 + 0.12, 0.58, z);
  for (const z of [-1.4, 0, 1.4]) add(hb, cyl(0.1, 0.1, 0.36, 10), ink(C.white), -B / 2 - 0.06, 0.25, z);
  // the cabin: yellow-green clapboard, a wavy roof, lit windows, a door at the bow end, a smoking pipe
  const cab = sub(hb, 0, 0.55, -0.2);
  const CW = 1.55;
  const CD = 2.7;
  storey(cab, CW, CD, 1.45, 0, 0xc6e8a0, { clap: true, post: C.white, band: C.white });
  for (const s of [-1, 1]) {
    const sd = sub(cab, s * (CW / 2), 0, 0, (s * PI) / 2);
    pane(sd, -0.7, 0.85, 0.02, 0.48, 0.42, true, null, tier >= 3 && s < 0, 1);
    pane(sd, 0.6, 0.85, 0.02, 0.48, 0.42, true, null, tier >= 3 && s < 0, 3);
  }
  const fr = sub(cab, 0, 0, CD / 2);
  doorway(fr, 0.25, 0, C.blue, 0.5, 1.1, false);
  porthole(fr, -0.38, 0.95, 0.02, 0.14, true);
  // (gable()'s ridge runs along x: the roof is turned to run along the cabin)
  wavyRoof(sub(cab, 0, 0, 0, PI / 2), CD + 0.35, CW + 0.4, 1.5, 0.6, 0x2bb3a3, C.white, R, { inset: 0.18 });
  stovepipe(cab, -0.45, 1.9, 2.6, -0.85, 0.45);
  lifebuoy(hb, B / 2 - 0.02, 0.85, 1.55, PI / 2, 0.7);
  flowerPot(hb, 0.6, 0.55, 1.75, C.red, 0.9);
  flowerPot(hb, -0.6, 0.55, 1.78, C.yellow, 0.9);
  // the gangplank up to the platform's deck, and the lines to its posts
  const deckY = 1.6;
  const gp = V(-B / 2 - 0.05, 0.58, 0);
  const top = V(-at.x + 2.2, deckY + 0.04, 0.0);
  K.beam(hb, ink(C.wood3), gp, top, 0.55, 0.06, 0.02);
  const dir = V().subVectors(top, gp);
  for (let i = 1; i < 5; i++) {
    const p = V().copy(gp).addScaledVector(dir, i / 5);
    add(hb, box(0.55, 0.03, 0.05), thin(C.woodDark), p.x, p.y + 0.04, p.z);
  }
  for (const [pz, cz] of [[-1.75 - at.z, -1.2], [0.5 - at.z, 1.1]]) {
    const a = V(-B / 2 + 0.12, 0.62, cz);
    const b = V(-at.x + 2.22, deckY + 0.62, pz);
    K.rope(hb, thin(C.rope), K.sagCurve(a, b, 0.25, 10), 0.025, 4);
  }
  if (tier >= 3) {
    // the second deck: a smaller upper cabin, a roof deck with white rails, a mast and flag, the figurehead
    const up = sub(hb, 0, 0.55 + 1.62, -0.55);
    storey(up, 1.2, 1.5, 1.05, 0.1, 0xffcfa1, { clap: true, post: C.white, band: C.white });
    pane(up, 0, 0.65, 0.75, 0.5, 0.36, true, 0x2bb3a3, true, 2);
    gable(up, 1.5, 1.5, 1.25, 0.55, 0xe45c33, { rand: R, gable: 0xffcfa1, inset: 0.15 });
    const rd = sub(hb, 0, 0.55 + 1.62 + 0.1, 0.75);
    for (let x = -0.62; x <= 0.63; x += 0.25) add(rd, box(0.035, 0.38, 0.035), thin(C.white), x, 0.2, 0.5);
    K.beam(rd, ink(C.white), V(-0.66, 0.4, 0.5), V(0.66, 0.4, 0.5), 0.05, 0.05, 0.015);
    for (const s of [-1, 1]) K.beam(rd, ink(C.white), V(s * 0.66, 0.4, -0.5), V(s * 0.66, 0.4, 0.5), 0.05, 0.05, 0.015);
    flowerPot(rd, -0.5, 0.0, 0.35, C.pink, 0.8);
    flowerPot(rd, 0.5, 0.0, 0.35, C.red, 0.8);
    flagPole(hb, 0.0, 0.55 + 1.62 + 1.3, 0.55 + 1.62 + 2.6, -0.95, C.pink, -PI / 2, 0.55, 0.36);
    bunting(hb, V(0.0, 0.55 + 1.62 + 2.4, -0.95), V(0.0, 0.95, L / 2 - 0.1), 0.25, [C.pink, C.yellow, C.blue, C.white]);
    // the figurehead: a carved mermaid under the bow
    const fh = sub(hb, 0, 0.45, L / 2 + 0.05);
    fh.rotation.x = -0.5;
    add(fh, sph(10), ink(C.gold), 0, 0.15, 0.08, 0, 0, 0, [0.14, 0.2, 0.12]);
    add(fh, sph(10), ink(0xf2c7a5), 0, 0.42, 0.12, 0, 0, 0, 0.11);
    add(fh, sph(8), ink(0xe2383d), 0, 0.48, 0.06, 0, 0, 0, [0.13, 0.13, 0.12]);
    add(fh, cone(0.1, 0.32, 8), ink(0x2bb3a3), 0, -0.12, 0.02, PI, 0, 0);
    add(fh, slab('fhFin', [[-0.16, 0], [0.16, 0], [0, 0.12]], 0.04, 0.01), ink(0x2bb3a3), 0, -0.3, 0.02, PI, 0, 0);
  }
  hb.updateMatrixWorld(true);
  const smoke = SMOKE.map((s) => {
    const p = s.obj.localToWorld(s.local.clone());
    return { x: r3(p.x), y: r3(p.y), z: r3(p.z), s: s.s, colors: s.colors };
  });
  SMOKE = smoke0;
  hb.userData.smoke = smoke;
  return hb;
}

// ---------------------------------------------------------------------------
// The Treehouse (Sunset Beach, in a giant palm; footprint +-2.1; max 11)
// The giant palm (tier 0 too); then a hut on a deck in it with a rope swing; then a bigger treehouse, a rope ladder
// and a crow's nest with a flag; then the Treetop Lodge: a twin hut on stilts joined by a little rope bridge.
// ---------------------------------------------------------------------------
const PALM = (() => {
  // the giant palm's trunk centre line (base at the sand, leaning a little to the back left, the crown above)
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push([-0.42 * Math.sin(t * PI) * (1 - 0.35 * t), t * 9.2, 0.22 * Math.sin(t * PI * 1.4) * (1 - t)]);
  }
  return pts;
})();
const palmAt = (y) => {
  const t = Math.max(0, Math.min(1, y / 9.2));
  const i = Math.min(13, Math.floor(t * 14));
  const k = t * 14 - i;
  const a = PALM[i];
  const b = PALM[i + 1];
  return [a[0] + (b[0] - a[0]) * k, y, a[2] + (b[2] - a[2]) * k];
};
function giantPalm(g, R) {
  const pts = PALM.map(([x, y, z]) => V(x, y - (y === 0 ? 0.25 : 0), z));
  K.rope(g, ink(C.trunk), pts, (t) => (0.55 - 0.24 * t) * (1 + 0.1 * Math.max(0, Math.sin(t * PI * 13))), 9);
  for (let i = 1; i < 12; i++) {
    const [x, y, z] = palmAt(i * 0.72 + 0.3);
    const r = 0.56 - 0.24 * (y / 9.2);
    add(g, torus(r, 0.03, 16, 3), thin(C.trunkRing), x, y, z, PI / 2, 0, 0);
  }
  // roots flaring into the sand
  for (let i = 0; i < 5; i++) {
    const a = 0.5 + (i * TAU) / 5;
    K.rod(g, ink(C.trunk), V(PALM[0][0] + Math.cos(a) * 0.3, 0.45, PALM[0][2] + Math.sin(a) * 0.3), V(PALM[0][0] + Math.cos(a) * 0.9, -0.05, PALM[0][2] + Math.sin(a) * 0.9), 0.13, 6);
  }
  const top = PALM[14];
  const a0 = R() * TAU;
  // the long fronds drooping all round, then a shorter upper layer
  for (let i = 0; i < 10; i++) {
    const f = add(g, frondGeo(), ink(i % 2 ? C.leaf : C.leaf2), top[0], top[1] - 0.05, top[2]);
    f.rotation.order = 'YXZ';
    f.rotation.y = a0 + (i / 10) * TAU + (R() - 0.5) * 0.25;
    f.rotation.x = 0.3 + (i % 3) * 0.14;
    f.scale.set(1.25, 1.1, 0.64);
  }
  for (let i = 0; i < 7; i++) {
    const f = add(g, frondGeo(), ink(i % 2 ? C.leaf2 : C.leaf), top[0], top[1] + 0.12, top[2]);
    f.rotation.order = 'YXZ';
    f.rotation.y = a0 + 0.45 + (i / 7) * TAU;
    f.rotation.x = -0.45;
    f.scale.set(1.05, 1.0, 0.46);
  }
  add(g, sph(12), ink(C.leaf2), top[0], top[1] + 0.12, top[2], 0, 0, 0, [0.62, 0.42, 0.62]);
  for (let i = 0; i < 4; i++) {
    const a = a0 + i * 1.6;
    add(g, sph(10), ink(C.coconut), top[0] + Math.cos(a) * 0.36, top[1] - 0.3, top[2] + Math.sin(a) * 0.36, 0, 0, 0, 0.24);
  }
}
function thatchHut(g, x, y, z, ry, w, d, h, wall, R, o = {}) {
  const hut = sub(g, x, y, z, ry);
  storey(hut, w, d, h, 0, wall, { post: C.woodDark, band: C.woodDark });
  doorway(hut, o.doorX ?? -w * 0.2, d / 2, o.door ?? C.teal, Math.min(0.55, w * 0.38), Math.min(1.1, h * 0.78), false);
  if (o.win !== false) porthole(hut, w * 0.24, h * 0.62, d / 2 + 0.02, 0.15, true, C.woodDeep);
  for (const s of [-1, 1]) porthole(sub(hut, s * (w / 2), 0, 0, (s * PI) / 2), 0, h * 0.6, 0.02, 0.13, true, C.woodDeep);
  // a shaggy thatch: a straw gable with fringe tufts
  gable(hut, w + 0.36, d + 0.4, h + 0.08, o.rh ?? 0.75, 0xe0b45a, { gable: shade(wall, 0.2), inset: 0.12 });
  for (const s of [-1, 1]) for (let i = 0; i < Math.round((w + 0.3) / 0.16); i++) add(hut, cone(0.06, 0.2, 4), ink(0xc89a3a), -(w + 0.3) / 2 + 0.08 + i * 0.16, h + 0.06, s * ((d + 0.4) / 2 + 0.02), PI, 0, 0);
  return hut;
}
function homeEArt(g, tier, R) {
  giantPalm(g, R);
  if (tier === 0) return;
  // the deck round the trunk at 4 u, on braces; a rail and lanterns
  const dy = tier >= 2 ? 4.4 : 4.0;
  const [px, , pz] = palmAt(dy);
  const deck = sub(g, px, dy, pz);
  const DR = 1.42;
  add(deck, cyl(DR, DR, 0.16, 22), ink(C.wood2), 0, 0, 0);
  for (let i = 0; i < 6; i++) add(deck, box(DR * 2 - 0.1, 0.02, 0.04), thin(shade(C.wood2, -0.25)), 0, 0.085, -DR * 0.8 + i * DR * 0.32, 0, 0, 0, [Math.sqrt(Math.max(0.05, 1 - (-0.8 + i * 0.32) ** 2)), 1, 1]);
  add(deck, torus(DR, 0.05, 28, 4), ink(C.woodDark), 0, 0, 0, PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = 0.3 + (i * TAU) / 5;
    K.beam(g, ink(C.woodDark), V(px + Math.cos(a) * 1.15, dy - 0.05, pz + Math.sin(a) * 1.15), V(...palmAt(dy - 1.3)), 0.1, 0.1, 0.03);
  }
  // a rail round the back half
  for (let i = 0; i <= 8; i++) {
    const a = PI * 0.95 + (i / 8) * PI * 1.1;
    add(deck, rbox(0.06, 0.62, 0.06, 0.02), ink(C.woodDark), Math.cos(a) * (DR - 0.06), 0.36, Math.sin(a) * (DR - 0.06));
  }
  add(deck, torus(DR - 0.06, 0.03, 24, 3, PI * 1.1), thin(C.rope), 0, 0.62, 0, PI / 2, 0, PI * 0.95);
  // climbing pegs on the trunk below the deck
  for (let k = 0; k < 6; k++) {
    const [x, y, z] = palmAt(0.6 + k * ((dy - 0.8) / 6));
    add(g, rbox(0.42, 0.07, 0.08, 0.02), ink(C.wood3), x + 0.0, y, z + 0.5 - 0.02 * k);
  }
  // the hut on the deck's back-right
  const hutW = tier >= 2 ? 1.5 : 1.15;
  const hutD = tier >= 2 ? 1.1 : 0.95;
  const hutH = tier >= 2 ? 1.35 : 1.1;
  thatchHut(deck, -0.52, 0.08, 0.5, -0.8, hutW, hutD, hutH, tier >= 2 ? 0xf7a58f : 0xffcfa1, R, { door: tier >= 2 ? C.blue : C.teal, rh: 0.7 });
  K.lantern(deck, 0.95, 0.95, 0.75, lampGlow(), 0.7);
  add(deck, rbox(0.06, 1.1, 0.06, 0.02), ink(C.woodDark), 0.95, 0.55, 0.85);
  K.beam(deck, ink(C.woodDark), V(0.95, 1.08, 0.85), V(0.95, 1.08, 0.72), 0.05, 0.05, 0.02);
  // the rope swing from a beam out over the sand at the front left
  const sw = V(-1.55, dy - 0.05, 0.95);
  K.beam(g, ink(C.woodDark), V(px - 0.9, dy - 0.02, pz + 0.7), sw, 0.12, 0.12, 0.03);
  const seat = V(-1.55, 0.62, 1.05);
  for (const s of [-1, 1]) K.rope(g, thin(C.rope), [V(sw.x + s * 0.22, sw.y, sw.z), V(seat.x + s * 0.22, seat.y + 0.04, seat.z)], 0.022, 4);
  add(g, rbox(0.56, 0.06, 0.22, 0.02), ink(C.red), seat.x, seat.y, seat.z);
  if (tier >= 2) {
    // the rope ladder to the sand, a little flag on the hut, the crow's nest high in the crown with its flag
    const lt = V(px + 1.32, dy, pz - 0.35);
    const lb = V(px + 1.78, 0.05, pz - 0.7);
    for (const s of [-1, 1]) K.rope(g, thin(C.rope), [V(lt.x + s * 0.2, lt.y, lt.z), V(lb.x + s * 0.2, lb.y, lb.z)], 0.025, 4);
    for (let k = 1; k < 10; k++) {
      const p = V().lerpVectors(lt, lb, k / 10);
      add(g, rbox(0.46, 0.05, 0.08, 0.02), ink(C.wood3), p.x, p.y, p.z, 0.0, 0, 0);
    }
    const nest = palmAt(7.7);
    add(g, cyl(0.62, 0.55, 0.5, 18, true), ink(C.wood2), nest[0], nest[1] + 0.25, nest[2]);
    for (const yy of [0.04, 0.48]) add(g, torus(0.6, 0.04, 20, 4), ink(C.woodDark), nest[0], nest[1] + yy, nest[2], PI / 2);
    add(g, cyl(0.58, 0.58, 0.06, 18), ink(C.wood3), nest[0], nest[1] + 0.03, nest[2]);
    flagPole(g, nest[0] + 0.45, nest[1] + 0.3, 10.7, nest[2] + 0.2, C.red, 0.3, 0.7, 0.45);
    add(g, sph(6), flat(C.white), nest[0] + 0.72, 10.47, nest[2] + 0.13, 0, 0.3, 0, [0.09, 0.09, 0.03]);
  }
  if (tier >= 3) {
    // the twin hut on four stilts at the front right, joined to the deck by a little rope bridge
    const t2 = { x: 1.22, z: 1.22, y: 3.2 };
    for (const sx of [-0.4, 0.4]) for (const sz of [-0.4, 0.4]) add(g, cyl(0.07, 0.09, t2.y, 8), ink(C.woodDark), t2.x + sx, t2.y / 2, t2.z + sz);
    for (const [a, b] of [[[-0.4, -0.4], [0.4, 0.4]], [[0.4, -0.4], [-0.4, 0.4]]]) K.beam(g, thin(C.wood2), V(t2.x + a[0], 0.6, t2.z + a[1]), V(t2.x + b[0], t2.y - 0.4, t2.z + b[1]), 0.05, 0.05, 0.015);
    const d2 = sub(g, t2.x, t2.y, t2.z);
    add(d2, rbox(1.2, 0.14, 1.2, 0.04), ink(C.wood2), 0, 0, 0);
    thatchHut(d2, 0, 0.07, -0.08, 0.2, 0.92, 0.82, 1.0, 0xaee6c8, R, { door: C.red, doorX: -0.15, rh: 0.6 });
    const a = V(px + 0.95, dy + 0.05, pz + 0.95);
    const b = V(t2.x - 0.42, t2.y + 0.05, t2.z - 0.3);
    const walk = K.sagCurve(a, b, 0.2, 8);
    for (let i = 1; i < walk.length - 1; i++) {
      const m = add(g, rbox(0.5, 0.05, 0.14, 0.015), thin(C.wood3), walk[i].x, walk[i].y - 0.03, walk[i].z);
      m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    }
    const side = V(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(0.25);
    for (const s of [-1, 1]) K.rope(g, thin(C.rope), K.sagCurve(a.clone().addScaledVector(side, s).add(V(0, 0.55, 0)), b.clone().addScaledVector(side, s).add(V(0, 0.55, 0)), 0.15, 8), 0.02, 4);
    K.lantern(d2, 0.5, 0.75, 0.55, lampGlow(), 0.6);
    add(d2, rbox(0.05, 0.9, 0.05, 0.02), ink(C.woodDark), 0.5, 0.45, 0.62);
    // a second monkey swing: a tyre swing under the twin hut
    K.rope(g, thin(C.rope), [V(t2.x - 0.05, t2.y - 0.05, t2.z), V(t2.x - 0.05, 1.35, t2.z)], 0.02, 4);
    add(g, torus(0.2, 0.07, 14, 6), ink(C.black), t2.x - 0.05, 1.17, t2.z, 0, 0.6, 0);
  }
}

// ---------------------------------------------------------------------------
// The Hilltop Villa (Lookout Hill, the east shoulder; footprint x +-2.1, z +-1.9; max 9; a terrace 2.4 u deep)
// A grassy terrace on a stone plinth (tier 0); then a white cottage with blue shutters; then the villa: a second
// storey and a balcony; then the Domed Villa: a round room under a blue dome and a terrace garden with a pergola.
// ---------------------------------------------------------------------------
function terrace(g, w, d, depth, R) {
  add(g, rbox(w, depth, d, 0.08), ink(C.stone), 0, -depth / 2, 0);
  let row = 0;
  for (let yy = -0.35; yy > -depth + 0.1; yy -= 0.36, row++) {
    add(g, box(w + 0.01, 0.035, d + 0.01), thin(C.stoneDark), 0, yy, 0);
    for (let x = -w / 2 + (row % 2 ? 0.3 : 0.65); x < w / 2 - 0.1; x += 0.7) for (const s of [-1, 1]) add(g, box(0.035, 0.34, 0.03), thin(C.stoneDark), x, yy + 0.18, s * (d / 2 + 0.005));
    for (let z = -d / 2 + (row % 2 ? 0.3 : 0.65); z < d / 2 - 0.1; z += 0.7) for (const s of [-1, 1]) add(g, box(0.03, 0.34, 0.035), thin(C.stoneDark), s * (w / 2 + 0.005), yy + 0.18, z);
  }
  add(g, rbox(w - 0.04, 0.1, d - 0.04, 0.04), ink(C.grass), 0, 0.0, 0);
  add(g, rbox(w + 0.04, 0.08, d + 0.04, 0.03), ink(shade(C.stone, -0.08)), 0, -0.07, 0);
}
function homeGArt(g, tier, R) {
  const F = [-2.1, 2.1, -1.9, 1.9];
  terrace(g, 4.16, 3.76, 2.4, R);
  if (tier === 0) {
    stakeOutline(g, [-1.6, 1.4, -1.5, 0.6], 0.05);
    board(g, 1.05, 0.05, 1.45, 0);
    for (let i = 0; i < 5; i++) add(g, sph(8), ink(i % 2 ? C.bush : C.leaf2), -1.8 + i * 0.3, 0.2, 1.62, 0, 0, 0, [0.2, 0.17, 0.18]);
    return;
  }
  const WALL = 0xfaf6ee;
  const BLUE = 0x3a6fd8;
  const ROOF = 0xe2734a;
  const hx = -0.3;
  const hz = -0.45;
  const W = 2.8;
  const D = 2.0;
  const H1 = 2.0;
  const H2 = 1.7;
  const h = sub(g, hx, 0.05, hz);
  add(h, rbox(W + 0.3, 0.16, D + 0.3, 0.05), ink(C.stone), 0, 0.08, 0);
  storey(h, W, D, H1, 0.16, WALL, { plain: true, post: WALL, band: BLUE });
  const fz = D / 2;
  doorway(h, -0.6, fz, BLUE, 0.7, 1.45);
  pane(h, 0.65, 1.2, fz, 0.66, 0.66, true, BLUE, true, 0);
  for (const s of [-1, 1]) pane(sub(h, s * (W / 2), 0, 0, (s * PI) / 2), 0, 1.2, 0.02, 0.56, 0.56, true, BLUE, false);
  // bougainvillea climbing the left of the door
  for (let i = 0; i < 9; i++) add(h, sph(7), ink(i % 3 ? 0xe2387a : C.leaf2), -1.2 + (i % 3) * 0.12, 0.5 + i * 0.18, fz + 0.08, 0, 0, 0, 0.13);
  const vb = sub(h, 0, 0, -D / 2, PI);
  for (const x of [-0.7, 0.7]) pane(vb, x, 1.2, 0.0, 0.5, 0.5, true, BLUE, false);
  let top = H1 + 0.24;
  if (tier >= 2) {
    storey(h, W - 0.1, D - 0.1, H2, top, WALL, { plain: true, post: WALL, band: BLUE });
    const ub = sub(h, 0, 0, -(D - 0.1) / 2, PI);
    for (const x of [-0.7, 0.7]) pane(ub, x, top + 0.95, 0.0, 0.46, 0.46, true, BLUE, false);
    const uz = (D - 0.1) / 2;
    // a balcony on the front: a door, a deck on brackets, white balusters, pots
    add(h, rbox(0.66, 1.25, 0.1, 0.04), ink(C.woodDeep), -0.1, top + 0.72, uz + 0.03);
    add(h, rbox(0.52, 1.12, 0.12, 0.04), winGlow(), -0.1, top + 0.7, uz + 0.06);
    pane(h, 0.95, top + 0.95, uz, 0.5, 0.5, true, BLUE, false);
    pane(h, -1.0, top + 0.95, uz, 0.5, 0.5, true, BLUE, false);
    const bz = uz + 0.32;
    add(h, rbox(W - 0.5, 0.1, 0.62, 0.03), ink(C.white), 0, top + 0.06, bz - 0.06);
    for (const sx of [-1, 1]) K.beam(h, ink(WALL), V(sx * (W / 2 - 0.45), top - 0.45, uz), V(sx * (W / 2 - 0.45), top, bz + 0.16), 0.1, 0.1, 0.03);
    for (let x = -W / 2 + 0.32; x <= W / 2 - 0.28; x += 0.24) add(h, lathe('baluster', [[0, 0], [0.04, 0], [0.025, 0.12], [0.045, 0.28], [0.025, 0.44], [0.04, 0.5], [0, 0.5]], 6), ink(C.white), x, top + 0.1, bz + 0.2);
    K.beam(h, ink(C.white), V(-W / 2 + 0.25, top + 0.64, bz + 0.2), V(W / 2 - 0.25, top + 0.64, bz + 0.2), 0.1, 0.07, 0.02);
    flowerPot(h, -0.9, top + 0.1, bz, 0xe2383d, 0.9);
    flowerPot(h, 0.75, top + 0.1, bz, 0xe2383d, 0.9);
    top += H2 + 0.12;
  }
  wavyRoof(h, W + 0.5, D + 0.35, top, 1.0, ROOF, C.white, R, { inset: 0.24 });
  chimney(h, W / 2 - 0.55, top + 0.4, -D / 4, 1.1, true, 0.5, C.white);
  // a stepping-stone path and a bench under a little lemon tree
  for (let i = 0; i < 3; i++) add(g, cyl(0.18, 0.2, 0.06, 10), ink(C.stoneDark), hx - 0.6 + i * 0.12, 0.08, hz + fz + 0.4 + i * 0.32, 0, 0, 0, [1, 1, 0.8]);
  if (tier < 3) {
    bench(g, 1.4, 0.95, -PI / 2 + 0.2, BLUE, 1.0);
    flowerPot(g, 1.65, 0.05, 1.55, C.yellow, 1.2);
    flowerPot(g, -1.85, 0.05, 1.55, 0xe2383d, 1.2);
    return;
  }
  // T3: the round room under the blue dome at the front right, and the terrace garden with a pergola
  const rx = 1.4;
  const rz = 0.75;
  add(g, cyl(0.62, 0.66, 2.1, 20), ink(WALL), rx, 0.05 + 1.05, rz);
  add(g, torus(0.63, 0.045, 20, 4), ink(BLUE), rx, 2.18, rz, PI / 2);
  for (let i = 0; i < 3; i++) {
    const a = -0.6 + i * 0.75;
    const w = sub(g, rx + Math.sin(a) * 0.64, 0.05, rz + Math.cos(a) * 0.64, a);
    flushWin(w, 0, 1.3, 0, 0.3, 0.6, true, BLUE);
  }
  add(g, domeGeo(20), ink(0x2e63c9), rx, 2.2, rz, 0, 0, 0, [0.66, 0.8, 0.66]);
  add(g, cyl(0.06, 0.08, 0.3, 8), ink(C.white), rx, 3.08, rz);
  add(g, sph(8), ink(C.gold), rx, 3.3, rz, 0, 0, 0, 0.1);
  // the pergola over a table at the left front, with vines
  const pg = sub(g, -1.35, 0.05, 1.35);
  for (const x of [-0.55, 0.55]) for (const z of [-0.42, 0.42]) add(pg, cyl(0.05, 0.06, 2.0, 8), ink(C.white), x, 1.0, z);
  for (const z of [-0.42, 0.42]) K.beam(pg, ink(C.wood3), V(-0.65, 2.0, z), V(0.65, 2.0, z), 0.08, 0.1, 0.02);
  for (let x = -0.55; x <= 0.56; x += 0.22) add(pg, rbox(0.06, 0.06, 1.0, 0.02), thin(C.wood3), x, 2.09, 0);
  for (let i = 0; i < 10; i++) add(pg, sph(7), ink(i % 3 ? C.leaf : C.leaf2), -0.5 + (i % 5) * 0.25, 2.15, -0.25 + Math.floor(i / 5) * 0.5, 0, 0, 0, [0.17, 0.1, 0.17]);
  for (let i = 0; i < 4; i++) add(pg, sph(6), ink(0x7a3f9a), -0.4 + i * 0.28, 1.98, 0.1 * (i % 2), 0, 0, 0, [0.05, 0.09, 0.05]);
  add(pg, cyl(0.32, 0.32, 0.05, 14), ink(C.white), 0, 0.72, 0);
  add(pg, cyl(0.05, 0.07, 0.7, 8), ink(C.iron), 0, 0.36, 0);
  for (const s of [-1, 1]) add(pg, cyl(0.15, 0.15, 0.05, 10), ink(BLUE), s * 0.45, 0.42, 0);
  add(pg, sph(6), ink(C.yellow), 0.05, 0.8, 0.0, 0, 0, 0, 0.06);
  // lemon trees in pots along the front edge
  for (const x of [0.15, 0.55]) {
    add(g, cyl(0.17, 0.13, 0.3, 12), ink(C.cork), x, 0.2, 1.62);
    K.rod(g, ink(C.trunk), V(x, 0.35, 1.62), V(x, 0.8, 1.62), 0.03, 5);
    add(g, sph(10), ink(C.leaf), x, 0.95, 1.62, 0, 0, 0, 0.24);
    for (let i = 0; i < 4; i++) add(g, sph(6), ink(C.yellow), x + Math.cos(i * 1.6) * 0.18, 0.92 + (i % 2) * 0.1, 1.62 + Math.sin(i * 1.6) * 0.18, 0, 0, 0, 0.045);
  }
}

// ---------------------------------------------------------------------------
// The Observatory (Lookout Hill, the top; footprint +-2.1; max 11)
// A ring of stones on the grassy hilltop (tier 0); then a spyglass post on a round deck; then the Star Tower, a stone
// tower with a gallery and a starry cone; then the Great Dome: the dome turns (its slit and telescope, one mesh).
// ---------------------------------------------------------------------------
function spyglass(g, x, y, z, ry, s = 1) {
  const sp = sub(g, x, y, z, ry);
  sp.scale.setScalar(s);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    K.rod(sp, ink(C.woodDark), V(0, 1.0, 0), V(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42), 0.03, 5);
  }
  add(sp, sph(8), ink(C.brass), 0, 1.02, 0, 0, 0, 0, 0.07);
  const tb = sub(sp, 0, 1.1, 0);
  tb.rotation.x = -0.45;
  add(tb, cyl(0.09, 0.07, 1.3, 12), ink(C.brass), 0, 0, 0.0, PI / 2, 0, 0);
  add(tb, cyl(0.11, 0.11, 0.12, 12), ink(C.woodDeep), 0, 0, 0.62, PI / 2, 0, 0);
  add(tb, cyl(0.075, 0.075, 0.08, 10), ink(C.woodDeep), 0, 0, -0.1, PI / 2, 0, 0);
  add(tb, cyl(0.05, 0.05, 0.2, 10), ink(C.brass), 0, 0, -0.72, PI / 2, 0, 0);
  return sp;
}
function starChart(g, x, z, ry) {
  const e = sub(g, x, 0, z, ry);
  for (const s of [-1, 1]) K.rod(e, ink(C.woodDark), V(s * 0.28, 0, 0.12), V(s * 0.2, 1.35, 0), 0.03, 5);
  K.rod(e, ink(C.woodDark), V(0, 0, -0.35), V(0, 1.3, -0.02), 0.03, 5);
  const bd = sub(e, 0, 1.0, 0.04);
  bd.rotation.x = -0.15;
  add(bd, rbox(0.72, 0.56, 0.04, 0.02), ink(C.navy), 0, 0, 0);
  for (const [sx, sy, r] of [[-0.22, 0.12, 0.05], [0.0, 0.18, 0.04], [0.18, 0.05, 0.05], [0.1, -0.15, 0.04], [-0.15, -0.12, 0.035]]) add(bd, starGeo(r, 0.02), flat(C.yellow), sx, sy, 0.03);
  K.rope(bd, thin(C.white), [V(-0.22, 0.12, 0.035), V(0.0, 0.18, 0.035), V(0.18, 0.05, 0.035), V(0.1, -0.15, 0.035)], 0.006, 3);
  add(bd, rbox(0.8, 0.04, 0.08, 0.01), ink(C.wood3), 0, -0.3, 0.02);
}
function observatoryArt(g, tier, R) {
  if (tier === 0) {
    for (let i = 0; i < 7; i++) {
      const a = 0.4 + (i / 7) * TAU;
      rock(g, Math.cos(a) * 1.55, 0.1, Math.sin(a) * 1.55, 0.2, 0.16, 0.17, i % 2 ? C.stone : 0xb8b4ac, R);
    }
    stakeOutline(g, [-1.3, 1.3, -1.3, 1.3]);
    board(g, 0.0, 0, 1.75, 0);
    return;
  }
  const GR = 0xc9c2b4;
  if (tier === 1) {
    // a round deck on stubby posts, a rail, the spyglass, a star chart, a bench, a lantern
    add(g, cyl(1.5, 1.5, 0.14, 24), ink(C.wood2), 0, 0.36, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      add(g, cyl(0.08, 0.08, 0.32, 8), ink(C.woodDark), Math.cos(a) * 1.3, 0.16, Math.sin(a) * 1.3);
    }
    for (let i = 0; i < 9; i++) add(g, box(2.9 * Math.sqrt(Math.max(0.05, 1 - ((i - 4) / 4.6) ** 2)), 0.02, 0.04), thin(shade(C.wood2, -0.25)), 0, 0.435, (i - 4) * 0.32);
    add(g, torus(1.5, 0.05, 30, 4), ink(C.woodDark), 0, 0.36, 0, PI / 2);
    for (let i = 0; i < 12; i++) {
      const a = 0.9 + (i / 12) * TAU * 0.84;
      add(g, rbox(0.06, 0.62, 0.06, 0.02), ink(C.woodDark), Math.cos(a) * 1.42, 0.74, Math.sin(a) * 1.42);
    }
    add(g, torus(1.42, 0.035, 30, 3, TAU * 0.84), ink(C.wood3), 0, 1.04, 0, PI / 2, 0, 0.9);
    spyglass(g, 0.15, 0.43, -0.3, PI * 0.85, 1.0);
    starChart(g, -0.85, 0.35, 0.5);
    bench(sub(g, 0, 0.43, 0), 0.75, 0.55, -0.6, C.wood3, 0.9);
    lampPost(g, 1.2, -0.75, PI * 1.2, 1.9, 0.4);
    for (let k = 0; k < 2; k++) add(g, rbox(0.7, 0.14, 0.3, 0.03), ink(C.stone), 0.85, 0.07 + k * 0.14, 1.55 - k * 0.22, 0, -0.55, 0, [1 - k * 0.15, 1, 1]);
    return;
  }
  // the Star Tower (T2, T3): a round stone tower with a door, lit slit windows and a gallery at the top
  const TH = 4.7;
  add(g, cyl(1.9, 1.95, 0.12, 26), ink(C.stone), 0, 0.06, 0);
  add(g, lathe('starTower', [[0, 0], [1.22, 0], [1.2, 0.2], [1.08, TH - 0.3], [1.14, TH - 0.2], [1.14, TH], [0, TH]], 22), ink(GR), 0, 0.12, 0);
  for (let k = 0; k < 9; k++) add(g, torus(1.21 - (0.12 * (k * 0.5 + 0.3)) / TH, 0.018, 26, 3), thin(shade(GR, -0.2)), 0, 0.55 + k * 0.48, 0, PI / 2);
  const fr = sub(g, 0, 0.12, 1.2);
  doorway(fr, 0, -0.04, C.navy, 0.62, 1.35, true);
  for (const [a, y] of [[1.2, 1.7], [-1.0, 2.6], [2.6, 3.2], [0.15, 3.4], [-2.4, 2.0]]) {
    const w = sub(g, Math.sin(a) * 1.12, 0, Math.cos(a) * 1.12, a);
    add(w, rbox(0.24, 0.62, 0.08, 0.03), ink(C.woodDeep), 0, y, 0.02);
    add(w, rbox(0.15, 0.5, 0.06, 0.02), winGlow(), 0, y, 0.05);
  }
  // the gallery: a round deck on corbels with a rail
  const gy = TH + 0.12;
  add(g, cyl(1.62, 1.55, 0.16, 26), ink(C.stone), 0, gy, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    add(g, rbox(0.14, 0.3, 0.3, 0.03), ink(C.stoneDark), Math.sin(a) * 1.22, gy - 0.22, Math.cos(a) * 1.22, 0, a, 0);
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    add(g, box(0.05, 0.5, 0.05), thin(C.white), Math.sin(a) * 1.52, gy + 0.33, Math.cos(a) * 1.52);
  }
  add(g, torus(1.52, 0.04, 30, 4), ink(C.white), 0, gy + 0.58, 0, PI / 2);
  // keep the tier-1 bits at the foot: the star chart and the bench
  starChart(g, -1.45, 1.1, 0.7);
  bench(g, 1.25, 1.3, -0.75, C.wood3, 0.85);
  if (tier === 2) {
    // a lantern room with a starry cone roof; the spyglass on the gallery
    add(g, cyl(0.8, 0.8, 1.2, 18), ink(0xe9e0cf), 0, gy + 0.68, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      const w = sub(g, Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8, a);
      add(w, rbox(0.28, 0.5, 0.05, 0.02), winGlow(), 0, gy + 0.72, 0.01);
    }
    add(g, cone(1.05, 1.55, 18), ink(C.navy), 0, gy + 1.28 + 0.77, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const yy = gy + 1.55 + (i % 3) * 0.3;
      const rr = 1.05 * (1 - (yy - gy - 1.28) / 1.55) + 0.02;
      const st = add(g, starGeo(0.07, 0.02), flat(C.yellow), Math.sin(a) * rr, yy, Math.cos(a) * rr);
      st.rotation.y = a;
      st.rotation.x = -0.5;
    }
    add(g, torus(1.05, 0.05, 20, 4), ink(C.gold), 0, gy + 1.3, 0, PI / 2);
    K.rod(g, ink(C.iron), V(0, gy + 2.8, 0), V(0, gy + 3.6, 0), 0.03);
    add(g, starGeo(0.2, 0.05), ink(C.gold), 0, gy + 3.7, 0);
    spyglass(g, 1.0, gy + 0.08, 0.6, 0.6, 0.75);
    return;
  }
  // T3: the Great Dome on a drum: white, a blue band; its slit, ribs and telescope turn (one mesh, 0.05 rad/s)
  add(g, cyl(1.42, 1.42, 0.62, 26), ink(0xe9e0cf), 0, gy + 0.39, 0);
  add(g, torus(1.43, 0.05, 26, 4), ink(C.blue), 0, gy + 0.68, 0, PI / 2);
  add(g, domeGeo(24), ink(0xf4f6fa), 0, gy + 0.7, 0, 0, 0, 0, 1.46);
  add(g, torus(1.47, 0.06, 28, 4), ink(C.blue), 0, gy + 0.72, 0, PI / 2);
  add(g, cyl(0.12, 0.16, 0.22, 10), ink(C.gold), 0, gy + 0.7 + 1.5, 0);
  add(g, starGeo(0.22, 0.05), ink(C.gold), 0, gy + 0.7 + 1.82, 0);
  K.rod(g, ink(C.iron), V(0, gy + 0.7 + 1.55, 0), V(0, gy + 0.7 + 1.62, 0), 0.03);
  anim(
    'dome',
    0,
    gy + 0.7,
    0,
    (p) => {
      const dark = flat(0x2b3866);
      // the slit: dark panels down the dome's front meridian
      for (let i = 0; i < 8; i++) {
        const a = 0.12 + (i / 8) * 1.32;
        const m = add(p, box(0.42, 0.2, 0.03), dark, 0, Math.sin(a) * 1.475, Math.cos(a) * 1.475);
        m.rotation.x = -(PI / 2 - a);
      }
      // the shutter's rails either side, and two ribs round the back (so the turning shows)
      for (const ox of [-0.24, 0.24]) for (let i = 0; i < 8; i++) {
        const a = 0.12 + (i / 8) * 1.32;
        const m = add(p, box(0.05, 0.2, 0.04), flat(C.blue), ox, Math.sin(a) * 1.48, Math.cos(a) * 1.48);
        m.rotation.x = -(PI / 2 - a);
      }
      for (const ry of [2.1, -2.1]) {
        const r = sub(p, 0, 0, 0, ry);
        for (let i = 0; i < 7; i++) {
          const a = 0.1 + (i / 7) * 1.3;
          const m = add(r, box(0.05, 0.2, 0.03), flat(0xc9ccd6), 0, Math.sin(a) * 1.475, Math.cos(a) * 1.475);
          m.rotation.x = -(PI / 2 - a);
        }
      }
      // the telescope poking out of the slit
      const tb = sub(p, 0, 0.3, 0.2);
      tb.rotation.x = 0.82;
      add(tb, cyl(0.15, 0.13, 1.6, 12), flat(C.brass), 0, 0.6, 0);
      add(tb, cyl(0.17, 0.17, 0.12, 12), flat(C.woodDeep), 0, 1.38, 0);
    },
    (p, t) => {
      p.rotation.y = t * 0.05;
    },
  );
}

// ---------------------------------------------------------------------------
// The Mermaid Grotto (Sunset Beach, the shore; footprint x +-1.8, z +-1.6; max 6; its front rocks reach into the sea)
// A sandy shore marked out (tier 0); then a rock pool; then the grotto: a cave of rocks and a big shell arch; then the
// Coral Palace: coral towers topped with pearls.
// ---------------------------------------------------------------------------
function coralTower(g, x, z, h, col, R, pearl = 0.2) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(V(x + Math.sin(t * 5 + x * 3) * 0.08 * (1 - t), -0.2 + t * h, z + Math.cos(t * 4 + z * 2) * 0.08 * (1 - t)));
  }
  K.rope(g, ink(col), pts, (t) => (0.36 - 0.25 * t) * (1 + 0.12 * Math.max(0, Math.sin(t * PI * 9))), 9);
  // knobbly bumps and little branches
  for (let i = 0; i < 6; i++) {
    const t = 0.2 + i * 0.12;
    const a = i * 2.3 + x;
    const r = 0.36 - 0.25 * t;
    add(g, sph(6), ink(shade(col, 0.15)), x + Math.cos(a) * r, -0.2 + t * h, z + Math.sin(a) * r, 0, 0, 0, 0.09);
  }
  for (let i = 0; i < 3; i++) {
    const t = 0.35 + i * 0.18;
    const a = i * 2.1 + 0.5 + z;
    const r = 0.36 - 0.25 * t;
    const b0 = V(x + Math.cos(a) * r * 0.8, -0.2 + t * h, z + Math.sin(a) * r * 0.8);
    const b1 = V(b0.x + Math.cos(a) * 0.2, b0.y + 0.4, b0.z + Math.sin(a) * 0.2);
    K.rod(g, ink(col), b0, b1, 0.06, 6);
    add(g, sph(6), ink(shade(col, 0.2)), b1.x, b1.y, b1.z, 0, 0, 0, 0.08);
  }
  const tp = pts[10];
  add(g, cyl(0.2, 0.14, 0.12, 12), ink(C.gold), tp.x, tp.y, tp.z);
  add(g, sph(14), pearlGlow(), tp.x, tp.y + 0.06 + pearl, tp.z, 0, 0, 0, pearl);
}
function grottoArt(g, tier, R) {
  // the sand bank under every tier, sloping down into the sea at the front
  add(g, sph(16), ink(C.sand), 0, -0.55, -0.15, 0, 0, 0, [1.75, 0.6, 1.4]);
  if (tier === 0) {
    stakeOutline(g, [-1.6, 1.6, -1.4, 0.9], 0.02);
    board(g, -0.9, 0, 1.15, 0.2);
    starfish(g, 0.6, 0.05, 1.0, C.orange, 1.0);
    for (let i = 0; i < 4; i++) add(g, sph(8), ink(i % 2 ? C.pink : C.white), 1.0 + i * 0.12, 0.04, 0.7 - i * 0.1, 0, 0, 0, [0.08, 0.04, 0.07]);
    rock(g, 1.35, -0.1, 1.25, 0.35, 0.28, 0.3, 0x9a968e, R);
    rock(g, -1.45, -0.05, -1.1, 0.4, 0.3, 0.35, 0xb8b4ac, R);
    return;
  }
  // the rock pool: a ring of rocks round an oval of sea water, lower at the front where the sea comes in
  const pa = 1.05;
  const pb = 0.82;
  const pz = 0.15;
  add(g, cyl(1, 1, 0.06, 24), flat(0x4fbfe0), 0, -0.12, pz, 0, 0, 0, [pa, 1, pb]);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const front = Math.sin(t) > 0.55;
    const s = front ? 0.24 : 0.32 + R() * 0.12;
    rock(g, Math.cos(t) * (pa + 0.12), front ? -0.35 : 0.0 + R() * 0.08, pz + Math.sin(t) * (pb + 0.1), s * 1.2, front ? s * 0.8 : s, s, i % 3 ? 0x8e9aa6 : 0x7a8794, R);
  }
  // rocks going down into the sea at the front
  for (let i = 0; i < 4; i++) rock(g, -1.2 + i * 0.8, -0.9, 1.25, 0.4, 0.55, 0.32, 0x7a8794, R);
  // the merfolk's sitting rock at the back left, starfish, shells, seaweed
  rock(g, -1.05, 0.05, -0.75, 0.5, 0.42, 0.42, 0x9aa6b2, R);
  add(g, cyl(0.38, 0.4, 0.08, 12), ink(0xa8b4c0), -1.05, 0.42, -0.75);
  starfish(g, 0.85, 0.32, -0.55, C.orange, 1.0, -PI / 2 + 0.4, 0.2);
  starfish(g, -0.35, 0.18, 0.95, C.pink, 0.8, -PI / 2 - 0.5, 1.0);
  for (let i = 0; i < 4; i++) K.rod(g, ink(i % 2 ? C.leaf2 : 0x2f8f6a), V(0.3 + i * 0.15, -0.15, -0.25), V(0.35 + i * 0.16, 0.35 + (i % 2) * 0.15, -0.3), 0.035, 5);
  const sh = sub(g, 1.25, 0.25, 0.75, -0.6);
  sh.rotation.x = -1.0;
  shellFan(sh, 0.22, 0.22, 5, [C.pink, C.white], 0.03, 0.05 * PI, 0.95 * PI);
  if (tier === 1) {
    // a little shell sign on a driftwood post
    add(g, rbox(0.08, 1.0, 0.08, 0.02), ink(0xb9a07e), 1.35, 0.5, -0.9);
    const sg = sub(g, 1.35, 1.0, -0.86);
    shellFan(sg, 0.32, 0.32, 5, [0xffd2b8, 0xff9a6c], 0.04);
    return;
  }
  // the grotto (T2, T3): a cave of big rocks at the back with a blue glow inside, a shell arch on two pillars
  for (const [x, y, z, sx, sy, sz] of [[-1.15, 0.5, -1.15, 0.6, 0.9, 0.42], [1.15, 0.5, -1.15, 0.6, 0.95, 0.42], [-0.55, 1.3, -1.25, 0.6, 0.55, 0.3], [0.55, 1.35, -1.25, 0.6, 0.5, 0.3], [0, 1.65, -1.2, 0.6, 0.4, 0.35], [-1.35, 1.25, -1.0, 0.42, 0.5, 0.42], [1.35, 1.3, -1.0, 0.42, 0.5, 0.42]]) rock(g, x, y, z, sx, sy, sz, 0x8e9aa6, null, 10);
  add(g, sph(12), flat(0x1f3a5a), 0, 0.55, -1.12, 0, 0, 0, [0.55, 0.65, 0.2]);
  for (const [x, y] of [[-0.18, 0.3], [0.2, 0.45], [0.0, 0.75], [-0.25, 0.7]]) add(g, cone(0.06, 0.2, 5), blueGlow(), x, y, -1.0, 0, 0, x * 1.5);
  for (const s of [-1, 1]) {
    rock(g, s * 1.35, 0.35, 0.2, 0.32, 0.6, 0.3, 0x9aa6b2, R);
    add(g, cyl(0.2, 0.24, 1.8, 10), ink(0xb8c4d0), s * 1.35, 1.0, 0.2);
    for (let k = 0; k < 4; k++) add(g, torus(0.21, 0.03, 12, 3), thin(0x8e9aa6), s * 1.35, 0.4 + k * 0.4, 0.2, PI / 2);
    add(g, sph(12), pearlGlow(), s * 1.35, 2.05, 0.2, 0, 0, 0, 0.17);
  }
  const arch = sub(g, 0, 1.9, 0.2);
  shellFan(arch, 1.45, 1.3, 9, [0xffd2b8, 0xffa7c4], 0.08);
  add(arch, sph(12), pearlGlow(), 0, 0.25, 0.1, 0, 0, 0, 0.15);
  if (tier === 2) return;
  // T3: the Coral Palace: three coral towers on the cave's rocks, topped with pearls, sea fans between
  coralTower(g, 0, -1.05, 5.3, 0xff8a80, R, 0.24);
  coralTower(g, -1.25, -1.05, 3.9, 0xffa64d, R, 0.2);
  coralTower(g, 1.25, -1.05, 4.1, 0xb58ae6, R, 0.2);
  for (const s of [-1, 1]) {
    const f = sub(g, s * 0.62, 1.95, -1.25, s * 0.25);
    shellFan(f, 0.42, 0.62, 6, [0xff6f91, 0xffb3c8], 0.03, 0.15 * PI, 0.85 * PI);
  }
  for (let i = 0; i < 5; i++) add(g, sph(8), pearlGlow(), -0.6 + i * 0.3, 2.95 + (i % 2) * 0.12, -1.05 + 0.0, 0, 0, 0, 0.07);
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------
const ART = { forge: forgeArt, music: musicArt, fishing: fishingArt, farm: farmArt, museum: museumArt, aquarium: aquariumArt, homeF: homeFArt, homeE: homeEArt, homeG: homeGArt, observatory: observatoryArt, grotto: grottoArt };
function seedOf(id, tier) {
  let h = 0xb417;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return (h * 7 + tier * 7919 + 0x5ea4) >>> 0;
}

/** The art of plot `id` at `tier` (0..3), built in the plot's frame with sparrow's kit (see the header). */
export function kit(id, tier, kitHelpers) {
  if (!kitHelpers || !kitHelpers.THREE) return null;
  const Tk = kitHelpers.THREE;
  const g = new Tk.Group();
  g.name = `plot4:${id}:${tier}`;
  g.userData.anim = [];
  g.userData.smoke = [];
  const art = ART[id];
  const t = Math.round(Number(tier));
  if (!art || !(t >= 0 && t <= 3) || (t === 0 && !ISLET[id])) return g;
  const prev = [K, T, C, SMOKE, ANIM, ROOT];
  K = kitHelpers;
  T = Tk;
  C = kitHelpers.COL;
  SMOKE = [];
  ANIM = g.userData.anim;
  ROOT = g;
  try {
    const R = kitHelpers.stream ? kitHelpers.stream(seedOf(id, t)) : () => 0.5;
    if (t === 0 && id !== 'homeG' && id !== 'observatory' && id !== 'grotto') {
      // the Treehouse's tier 0: its giant palm, the plot marked out, the board
      art(g, 0, R);
      stakeOutline(g, [-2.0, 2.0, -1.0, 2.0]);
      board(g, 1.15, 0, 1.55, -0.2);
    } else art(g, t, R);
    g.updateMatrixWorld(true);
    g.userData.smoke = SMOKE.map((s) => {
      const p = s.obj.localToWorld(s.local.clone());
      return { x: r3(p.x), y: r3(p.y), z: r3(p.z), s: s.s, colors: s.colors || null };
    });
    const m = g.userData.moored;
    if (m) m.smoke = m.group.userData.smoke || [];
  } finally {
    [K, T, C, SMOKE, ANIM, ROOT] = prev;
  }
  return g;
}

// What each tier stands on and where its door is (the plot frame, the deck at y = 0; measured from the kits in the
// harness, .dock-harness/v4/1O): footprint = the bounds of every vertex above 0.3 (x0, x1, z0, z1), eave = the top of
// its walls (where the construction scene's roof stage starts), top = its highest point, door = { x, z, ry, w, h }
// (its foot at y; its middle at the wall's face, or where the inhabitants step out of an open building; ry the way it
// faces), porch = { x, z, ry } a spot in front of the pad on the porch for its board and its plot place (outside
// the pad, on the deck; on the islets, on the ground in front of the pad). The Treehouse's door is its ladder's foot
// (tier 1: the pegs on the trunk); the Grotto's front (+z) faces the beach, its back reaches into the sea.
const INFO = {
  forge: { porch: { x: 0, z: 1.65, ry: 0 }, doors: [null, { x: 0.2, y: 0, z: 0.62, ry: 0, w: 1.6, h: 2.2 }, { x: 0.2, y: 0, z: 0.62, ry: 0, w: 1.6, h: 1.9 }, { x: -0.2, y: 0, z: 0.6, ry: 0, w: 1.2, h: 1.9 }], tiers: [null, { f: [-1, 0.98, -1.87, 0.68], eave: 2.04, top: 2.56 }, { f: [-1, 0.98, -1.9, 0.7], eave: 2.1, top: 4.51 }, { f: [-1, 0.99, -1.9, 0.7], eave: 3.1, top: 5.61 }] },
  music: { porch: { x: -0.6, z: 1.75, ry: 0 }, doors: [null, { x: -0.75, y: 0, z: 0.78, ry: 0, w: 2.4, h: 2 }, { x: -0.9, y: 0.5, z: 0.78, ry: 0, w: 3, h: 2 }, { x: -0.9, y: 0.5, z: 0.78, ry: 0, w: 3, h: 2 }], tiers: [null, { f: [-2.45, 1.13, -0.6, 0.61], eave: 2, top: 2.34 }, { f: [-2.59, 1.29, -0.77, 0.79], eave: 2.6, top: 3.16 }, { f: [-2.59, 1.29, -0.76, 0.79], eave: 2.6, top: 4.65 }] },
  fishing: { porch: { x: 0.6, z: 1.65, ry: 0 }, doors: [null, { x: 1.2, y: 0, z: 0.6, ry: 0, w: 1, h: 1.8 }, { x: -0.27, y: 0, z: 0.48, ry: 0, w: 0.48, h: 1.05 }, { x: -0.27, y: 0, z: 0.48, ry: 0, w: 0.48, h: 1.05 }], tiers: [null, { f: [-0.62, 1.9, -0.66, 0.59], eave: 1.8, top: 1.87 }, { f: [-0.7, 1.88, -0.63, 0.7], eave: 1.54, top: 2.62 }, { f: [-0.7, 1.88, -0.63, 0.7], eave: 1.54, top: 3.84 }] },
  farm: { porch: { x: -0.6, z: 1.9, ry: 0 }, doors: [null, { x: -0.55, y: 0, z: 0.88, ry: 0, w: 0.8, h: 0.8 }, { x: -1.3, y: 0, z: -0.45, ry: 0, w: 1.16, h: 1.3 }, { x: -1.3, y: 0, z: -0.45, ry: 0, w: 1.16, h: 1.3 }], tiers: [null, { f: [-2.38, 1.18, -2.14, 0.94], eave: 1.2, top: 1.55 }, { f: [-2.39, 1.18, -2.14, 0.94], eave: 1.82, top: 2.98 }, { f: [-2.39, 1.18, -2.14, 0.94], eave: 1.82, top: 4.44 }] },
  museum: { porch: { x: 0.6, z: 1.9, ry: 0 }, doors: [null, { x: 0.15, y: 0, z: -0.37, ry: 0, w: 0.62, h: 1.3 }, { x: 0.6, y: 0.3, z: -0.23, ry: 0, w: 0.72, h: 1.4 }, { x: 0.6, y: 0.3, z: -0.23, ry: 0, w: 0.72, h: 1.4 }], tiers: [null, { f: [-1.14, 2.3, -2.13, 0.82], eave: 1.9, top: 3.15 }, { f: [-1.17, 2.3, -2.13, 0.85], eave: 2.75, top: 3.75 }, { f: [-1.17, 2.3, -2.13, 0.85], eave: 2.75, top: 6.04 }] },
  aquarium: { porch: { x: 0, z: 1.9, ry: 0 }, doors: [null, { x: -1.75, y: 0, z: 0.7, ry: 0, w: 1.4, h: 1 }, { x: 2.38, y: 0, z: 0.7, ry: 0, w: 0.56, h: 1.3 }, { x: 2.38, y: 0, z: 0.7, ry: 0, w: 0.56, h: 1.3 }], tiers: [null, { f: [-2.71, 2.46, -0.88, 0.85], eave: 0.5, top: 1.53 }, { f: [-2.75, 2.9, -0.86, 0.92], eave: 2.4, top: 2.65 }, { f: [-2.75, 2.9, -0.87, 0.92], eave: 2.4, top: 4.53 }] },
  homeF: { porch: { x: 0.6, z: 1.85, ry: 0 }, doors: [null, { x: 0.12, y: 0, z: -0.35, ry: 0, w: 0.56, h: 0.95 }, { x: 0.12, y: 0, z: -0.35, ry: 0, w: 0.56, h: 0.95 }, { x: 0.12, y: 0, z: -0.35, ry: 0, w: 0.56, h: 0.95 }], tiers: [null, { f: [-1.07, 2.29, -1.87, 0.68], eave: 1.34, top: 2.82 }, { f: [-1.07, 2.4, -1.93, 0.68], eave: 1.34, top: 2.82 }, { f: [-1.07, 2.4, -1.93, 0.68], eave: 1.34, top: 2.82 }] },
  homeE: { porch: { x: 0, z: 2.9, ry: 0 }, doors: [null, { x: -0.09, y: 0, z: 0.75, ry: 0, w: 0.5, h: 1 }, { x: 1.43, y: 0, z: -0.6, ry: 0, w: 0.5, h: 1 }, { x: 1.43, y: 0, z: -0.6, ry: 0, w: 0.5, h: 1 }], tiers: [{ f: [-1.99, 1.99, -1.56, 2], eave: 0, top: 10.01 }, { f: [-1.91, 1.66, -1.74, 1.66], eave: 5.2, top: 10.01 }, { f: [-2.08, 1.62, -1.69, 1.81], eave: 5.9, top: 10.83 }, { f: [-2.08, 1.99, -1.71, 1.93], eave: 5.9, top: 10.83 }] },
  homeG: { porch: { x: 0, z: 2.7, ry: 0 }, doors: [null, { x: -0.9, y: 0.05, z: 0.55, ry: 0, w: 0.7, h: 1.45 }, { x: -0.9, y: 0.05, z: 0.55, ry: 0, w: 0.7, h: 1.45 }, { x: -0.9, y: 0.05, z: 0.55, ry: 0, w: 0.7, h: 1.45 }], tiers: [{ f: [-1.91, 1.62, -1.5, 1.72], eave: 0.1, top: 1.37 }, { f: [-2.04, 1.84, -1.74, 1.74], eave: 2.3, top: 3.88 }, { f: [-2.04, 1.84, -1.74, 1.74], eave: 4.1, top: 5.7 }, { f: [-2.02, 2.08, -1.74, 1.86], eave: 4.1, top: 5.7 }] },
  observatory: { porch: { x: 0, z: 2.9, ry: 0 }, doors: [null, { x: 0, y: 0.43, z: 1.5, ry: 0, w: 1, h: 1 }, { x: 0, y: 0.12, z: 1.16, ry: 0, w: 0.62, h: 1.35 }, { x: 0, y: 0.12, z: 1.16, ry: 0, w: 0.62, h: 1.35 }], tiers: [{ f: [-1.29, 1.29, -1.3, 1.84], eave: 0.1, top: 1.32 }, { f: [-1.56, 1.56, -1.55, 1.55], eave: 1, top: 1.93 }, { f: [-1.74, 1.69, -1.63, 1.71], eave: 4.8, top: 8.74 }, { f: [-1.74, 1.69, -1.63, 1.71], eave: 5.5, top: 7.58 }] },
  grotto: { porch: { x: 0, z: 2.4, ry: 0 }, doors: [null, { x: 0, y: 0, z: 1, ry: 0, w: 1.4, h: 1 }, { x: 0, y: 0, z: -0.9, ry: 0, w: 1, h: 1.2 }, { x: 0, y: 0, z: -0.9, ry: 0, w: 1, h: 1.2 }], tiers: [{ f: [-1.59, 1.59, -1.4, 1.33], eave: 0.1, top: 1.32 }, { f: [-1.46, 1.69, -1.16, 0.81], eave: 0.4, top: 1.36 }, { f: [-1.76, 1.76, -1.54, 0.81], eave: 1.9, top: 3.31 }, { f: [-1.76, 1.76, -1.54, 0.81], eave: 1.9, top: 5.65 }] },
};

/** Where plot `id`'s tier stands: { footprint: { x0, x1, z0, z1 } | null, eave, top, door, porch } (the plot frame). */
export function info(id, tier) {
  const d = INFO[id];
  const t = Math.round(Number(tier));
  if (!d || !(t >= 0 && t <= 3)) return { footprint: null, eave: 0, top: 0, door: null, porch: null };
  const ti = d.tiers[t];
  return {
    footprint: ti ? { x0: ti.f[0], x1: ti.f[1], z0: ti.f[2], z1: ti.f[3] } : null,
    eave: ti ? ti.eave : 0,
    top: ti ? ti.top : 0,
    door: d.doors[t] ? { ...d.doors[t] } : null,
    porch: { ...d.porch },
  };
}
