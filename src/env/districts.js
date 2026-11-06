// The island's six districts' art (SPEC4 §6): the seventeen platforms' porches (planks on stilts outside their edges,
// and the two behind the tavern and the yard), the sixteen boardwalks and the stone steps, the four new rope bridges,
// Sunset Beach, Lookout Hill and Fisher's Pier, the signposts, the named arches and the High Walk's lanterns, built
// from islandPlan.js's data with the town's own art helpers (sparrow's frozen `kit`) and one random stream of its own
// (kit.stream(0x5EA4)), so the town's rand() draws never change. sparrow.js bakes `statics` into the town's meshes
// (with v4 only): every part is a plain toon mesh made with the kit's materials (ink / thin / flat, the lanterns'
// glow), but the signs' and arches' painted words, one textured mesh of their own (one draw call).
//
// buildDistricts(kit, plan) -> { statics: Group (baked by sparrow into the town's meshes), anim: { lanterns },
//   signs: [{ id, words, x, y, z }], triangles, dispose() }
// kit: sparrow's kit (THREE, add, rbox, cyl, sphere, rope, rod, ink, thin, flat, COL, lantern, glow, deck, sagCurve,
// stream); plan: islandPlan's exports.

const TAU = Math.PI * 2;
// the districts' colours (islandPlan's), the words' board colours
const WORD_BG = 0xfff1d0;

/** Where a porch piece lies in its deck's frame: [side, from, to, depth] -> { x0, x1, z0, z1 }. */
function pieceRect(w, d, [side, a, b, depth]) {
  if (side === 'f') return { x0: a, x1: b, z0: d / 2, z1: d / 2 + depth };
  if (side === 'b') return { x0: a, x1: b, z0: -d / 2 - depth, z1: -d / 2 };
  if (side === 'l') return { x0: -w / 2 - depth, x1: -w / 2, z0: a, z1: b };
  return { x0: w / 2, x1: w / 2 + depth, z0: a, z1: b };
}
/** Rects (axis-aligned in one frame) as non-overlapping strips, less the platform itself. */
function strips(rects, plat) {
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]).concat([plat.x0, plat.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap((r) => [r.z0, r.z1]).concat([plat.z0, plat.z1]))].sort((a, b) => a - b);
  const inR = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const out = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    const zm = (zs[j] + zs[j + 1]) / 2;
    let cur = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2;
      const on = rects.some((r) => inR(r, xm, zm)) && !inR(plat, xm, zm);
      if (on && cur) cur.x1 = xs[i + 1];
      else if (on) cur = { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] };
      else if (cur) {
        out.push(cur);
        cur = null;
      }
    }
    if (cur) out.push(cur);
  }
  return out.filter((r) => r.x1 - r.x0 > 0.05 && r.z1 - r.z0 > 0.05);
}
const segDist = (x, z, pts) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, , az] = pts[i - 1];
    const [bx, , bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};

export function buildDistricts(kit, plan) {
  const T = kit && kit.THREE;
  const statics = T ? new T.Group() : null;
  const empty = { statics, anim: { lanterns: null }, signs: [], triangles: 0, dispose() {} };
  if (!T || !plan || !plan.PLATFORMS || !Array.isArray(plan.PORCHES)) return empty;
  statics.name = 'sparrow-districts';
  const { add, rbox, cyl, sphere, rope, rod, ink, thin, flat, COL } = kit;
  const R = kit.stream ? kit.stream(0x5ea4) : Math.random;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const own = [];
  const DCOL = {};
  const dist = {};
  for (const D of plan.DECKS || []) dist[D.id] = D.district;
  const shapes = plan.walkData4 ? plan.walkData4({}, []) : { links: [], districts: [] };
  for (const d of shapes.districts || []) DCOL[d.id] = d.colour;
  const linkPts = {};
  for (const l of shapes.links || []) linkPts[l.id] = l.pts;
  const scenery = (plan.LINKS || []).filter((l) => l.scenery).map((l) => linkPts[l.id]).filter(Boolean);
  const group = (x, y, z, ry = 0, parent = statics) => {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    parent.add(g);
    return g;
  };
  // (a stilt, its top under the planks and its foot in the sea, is open-ended: 14 triangles, not 28)
  const post = (parent, x, y0, y1, z, r = 0.1, col = COL.woodDark, open = true) => add(parent, cyl(r * 0.9, r, y1 - y0, 7, open), ink(col), x, (y0 + y1) / 2, z);
  const SEA = -0.7;
  // a plank: one shared unit box (12 triangles; no uv, as the town's parts), scaled
  const BOX = new T.BoxGeometry(1, 1, 1);
  BOX.deleteAttribute('uv');
  own.push(BOX);
  const TONES = [COL.wood, COL.wood3, COL.plank, COL.wood, COL.wood2];
  const plank = (parent, x, y, z, w, h, d, tone, ry = 0) => add(parent, BOX, thin(tone), x, y, z, 0, ry, 0, [w, h, d]);
  /** A deck of planks w x d with its top at y (in parent's frame, centred), laid across its long side. */
  const planks = (parent, w, d, y) => {
    const across = w >= d;
    const span = across ? w : d;
    const len = across ? d : w;
    const n = Math.max(1, Math.round(span / 0.5));
    const step = span / n;
    for (let i = 0; i < n; i++) {
      const c = -span / 2 + step * (i + 0.5);
      const tone = TONES[Math.floor(R() * TONES.length)];
      const yy = y - 0.07 + (R() - 0.5) * 0.02;
      if (across) plank(parent, c, yy, 0, step - 0.05, 0.14, len - 0.04, tone, (R() - 0.5) * 0.012);
      else plank(parent, 0, yy, c, len - 0.04, 0.14, step - 0.05, tone, (R() - 0.5) * 0.012);
    }
  };
  const triCount = () => {
    let n = 0;
    statics.traverse((o) => {
      if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return Math.round(n);
  };
  const parts = {};
  let lastTri = 0;
  const mark = (name) => {
    const n = triCount();
    parts[name] = n - lastTri;
    lastTri = n;
  };

  // ---------------------------------------------------------------- the porches (planks on stilts)
  const porchesBy = {};
  for (const p of plan.PORCHES) (porchesBy[p.deck] ||= []).push(p);
  for (const [deck, list] of Object.entries(porchesBy)) {
    const f = plan.PLATFORMS[deck];
    if (!f) continue;
    const [px, pz, w, d, ry, y] = f;
    const g = group(px, 0, pz, ry);
    const plat = { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 };
    for (const q of strips(list.map((p) => pieceRect(w, d, [p.side, p.from, p.to, p.depth])), plat)) {
      const cx = (q.x0 + q.x1) / 2;
      const cz = (q.z0 + q.z1) / 2;
      const sw = q.x1 - q.x0;
      const sd = q.z1 - q.z0;
      // (a strip a scenery bridge comes in over sits a little lower, its planks under the bridge's)
      const wc = Math.cos(ry);
      const ws = Math.sin(ry);
      const wx = px + cx * wc + cz * ws;
      const wz = pz - cx * ws + cz * wc;
      const low = scenery.some((pts) => segDist(wx, wz, pts) < Math.hypot(sw, sd) / 2 + 0.6) ? 0.06 : 0;
      const sg = group(cx, 0, cz, 0, g);
      planks(sg, sw, sd, y - low);
      // a fascia beam along its outer edges, and stilts down into the sea
      const outer = [];
      if (q.z1 > plat.z1 + 1e-6) outer.push(['z', q.z1]);
      if (q.z0 < plat.z0 - 1e-6) outer.push(['z', q.z0]);
      if (q.x1 > plat.x1 + 1e-6) outer.push(['x', q.x1]);
      if (q.x0 < plat.x0 - 1e-6) outer.push(['x', q.x0]);
      for (const [axis, v] of outer) {
        // (a plain beam: the town's rounded box costs 108 triangles, its rounding unseen under the planks' edge)
        if (axis === 'z') add(g, BOX, ink(COL.woodDark), cx, y - low - 0.27, v - Math.sign(v) * 0.08, 0, 0, 0, [sw + 0.06, 0.24, 0.18]);
        else add(g, BOX, ink(COL.woodDark), v - Math.sign(v) * 0.08, y - low - 0.27, cz, 0, 0, 0, [0.18, 0.24, sd + 0.06]);
        const L = axis === 'z' ? sw : sd;
        const n = Math.max(1, Math.round(L / 1.6));
        for (let i = 0; i <= n; i++) {
          const s = (axis === 'z' ? q.x0 : q.z0) + (L * i) / n;
          const xx = axis === 'z' ? s : v - Math.sign(v) * 0.12;
          const zz = axis === 'z' ? v - Math.sign(v) * 0.12 : s;
          post(g, xx, SEA, y - low - 0.2, zz, 0.11);
        }
      }
    }
  }

  mark('porches');
  // ---------------------------------------------------------------- the links: rope bridges, boardwalks, the steps
  const lanterns = [];
  const HIGH = new Set((plan.LINKS || []).filter((l) => l.name === 'the High Walk').map((l) => l.id));
  const yawOf = (dx, dz) => Math.atan2(dx, dz);
  for (const L of plan.LINKS || []) {
    if (L.today || L.scenery) continue;
    const pts = linkPts[L.id];
    if (!pts || pts.length < 4) continue;
    const a = V(...pts[1]);
    const b = V(...pts[pts.length - 2]);
    const dir = new T.Vector3().subVectors(b, a);
    const len = Math.hypot(dir.x, dir.z);
    const side = V(-dir.z, 0, dir.x).normalize();
    const colA = DCOL[dist[L.from]] ?? COL.red;
    const colB = DCOL[dist[L.to]] ?? colA;
    if (L.kind === 'rope') {
      // sparrow's rope bridge, drawn the same way (its planks, foot and hand ropes, posts and suspenders)
      const sag = Math.min(0.9, a.distanceTo(b) * 0.09);
      const walk = kit.sagCurve(a, b, sag, Math.max(6, Math.round(a.distanceTo(b) / 0.5)));
      const curve = new T.CatmullRomCurve3(walk);
      const n = Math.max(3, Math.round(a.distanceTo(b) / 0.38));
      const yaw = yawOf(dir.x, dir.z);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const p = curve.getPointAt(u);
        const t = curve.getTangentAt(u);
        const m = add(statics, BOX, thin(i % 3 ? COL.wood3 : COL.plank), p.x, p.y - 0.05, p.z, 0, 0, 0, [1.05, 0.08, 0.26]);
        m.rotation.set(-Math.atan2(t.y, Math.hypot(t.x, t.z)), yaw, (R() - 0.5) * 0.06, 'YXZ');
      }
      const hw = 0.55;
      for (const s of [-1, 1]) {
        const off = side.clone().multiplyScalar(s * hw);
        const hand = kit.sagCurve(a.clone().add(off).add(V(0, 0.75, 0)), b.clone().add(off).add(V(0, 0.75, 0)), sag * 0.8, 14);
        rope(statics, thin(COL.rope), hand, 0.04, 5);
        rope(statics, thin(COL.rope), walk.map((p) => p.clone().add(off).add(V(0, -0.06, 0))), 0.035, 4);
        for (const [e, c] of [[a, colA], [b, colB]]) {
          // (the plan's end post on this side, where it stands at the deck's edge; none where a band runs past)
          const P = (plan.LINK_POSTS && plan.LINK_POSTS[L.id]) || [];
          let pp = null;
          for (const q of P) {
            const sd = (q.x - e.x) * side.x + (q.z - e.z) * side.z;
            if (Math.sign(sd) === s && Math.hypot(q.x - e.x, q.z - e.z) < 2.6 && (!pp || Math.hypot(q.x - e.x, q.z - e.z) < Math.hypot(pp.x - e.x, pp.z - e.z))) pp = V(q.x, e.y, q.z);
          }
          if (!pp) continue;
          add(statics, cyl(0.09, 0.11, 1.1, 8), ink(COL.woodDark), pp.x, pp.y + 0.45, pp.z);
          add(statics, sphere(8), ink(c), pp.x, pp.y + 1.02, pp.z, 0, 0, 0, 0.12);
        }
        const m = Math.max(2, Math.round(len / 0.8));
        const hc = new T.CatmullRomCurve3(hand);
        for (let i = 1; i < m; i++) {
          const u = i / m;
          rod(statics, thin(COL.rope), hc.getPointAt(u), curve.getPointAt(u).add(off), 0.02, 4);
        }
      }
      continue;
    }
    // a boardwalk (2.0 wide planks on stringers, rail posts every ~1.6 u with rope rails, the district's colour on the
    // posts' caps) or the stone steps up Lookout Hill (pale slabs with white edges)
    const steps = L.kind === 'steps';
    const yaw = yawOf(dir.x, dir.z);
    const pitch = -Math.atan2(b.y - a.y, len);
    const n = Math.max(2, Math.round(len / (steps ? 0.42 : 0.4)));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const p = a.clone().lerp(b, u);
      const g = group(p.x, p.y, p.z, yaw);
      g.rotation.set(pitch, yaw, 0, 'YXZ');
      if (steps) {
        add(g, BOX, ink(i % 2 ? COL.stone : 0xd6cdbd), 0, -0.07, 0, 0, 0, 0, [2.0, 0.14, len / n - 0.03]);
        add(g, BOX, flat(COL.white), 0, 0.0, len / n / 2 - 0.05, 0, 0, 0, [2.02, 0.05, 0.07]);
      } else {
        const tone = [COL.wood, COL.wood3, COL.plank, COL.wood2][Math.floor(R() * 4)];
        plank(g, 0, -0.07 + (R() - 0.5) * 0.02, 0, 2.0, 0.12, len / n - 0.04, tone, (R() - 0.5) * 0.02);
      }
    }
    if (!steps) {
      // the stringers under the planks
      for (const s of [-0.75, 0.75]) {
        const o = side.clone().multiplyScalar(s);
        const m = add(statics, BOX, ink(COL.woodDark), (a.x + b.x) / 2 + o.x, (a.y + b.y) / 2 - 0.22, (a.z + b.z) / 2 + o.z, 0, 0, 0, [0.16, 0.2, Math.hypot(len, b.y - a.y) + 0.2]);
        m.rotation.set(pitch, yaw, 0, 'YXZ');
      }
    }
    // the rail posts (at its ends where the plan stands them, at the decks' edges: LINK_POSTS, the walk's obstacles;
    // between them every ~1.6 u), the rope rails between them, the stilts under the walk
    const np = Math.max(1, Math.round(len / 1.6));
    const ends = (plan.LINK_POSTS && plan.LINK_POSTS[L.id]) || [];
    const endPost = (e, s) => {
      // (the plan's post nearest this end on this side, if it stands)
      let best = null;
      for (const q of ends) {
        const sd = (q.x - e.x) * side.x + (q.z - e.z) * side.z;
        if (Math.sign(sd) !== s || Math.hypot(q.x - e.x, q.z - e.z) > 2.6) continue;
        if (!best || Math.hypot(q.x - e.x, q.z - e.z) < Math.hypot(best.x - e.x, best.z - e.z)) best = q;
      }
      return best ? V(best.x, e.y, best.z) : null;
    };
    for (const s of [-1, 1]) {
      const off = side.clone().multiplyScalar(s * 1.0);
      const tops = [];
      for (let i = 0; i <= np; i++) {
        const u = i / np;
        let p = a.clone().lerp(b, u).add(off);
        if (i === 0 || i === np) {
          const q = endPost(i === 0 ? a : b, s);
          if (!q) continue;
          p = q;
        }
        const c = u < 0.5 ? colA : colB;
        add(statics, cyl(0.07, 0.09, steps ? 1.05 : 1.95, 7), ink(COL.woodDark), p.x, steps ? p.y + 0.45 : p.y - 0.05, p.z);
        add(statics, sphere(7), ink(c), p.x, p.y + 0.98, p.z, 0, 0, 0, 0.1);
        if (!steps && i > 0 && i < np) post(statics, p.x - off.x * 0.25, SEA, p.y - 0.3, p.z - off.z * 0.25, 0.1);
        tops.push(V(p.x, p.y + 0.9, p.z));
      }
      for (let i = 1; i < tops.length; i++) rope(statics, thin(COL.rope), kit.sagCurve(tops[i - 1], tops[i], 0.08, 6), 0.035, 4);
      // the High Walk's lanterns, on every other post, glowing even at noon (§6.4)
      if (HIGH.has(L.id)) {
        for (let i = 0; i <= np; i += 2) {
          const p = a.clone().lerp(b, i / np).add(off.clone().multiplyScalar(1.12));
          add(statics, cyl(0.04, 0.05, 0.5, 6), ink(COL.woodDark), p.x, p.y + 1.15, p.z);
          if (kit.lantern && kit.glow) kit.lantern(statics, p.x, p.y + 1.25, p.z, kit.glow, 0.7);
          lanterns.push([p.x, p.y + 1.25, p.z]);
        }
      }
    }
  }

  mark('links');
  // ---------------------------------------------------------------- the islets
  const lathe = (prof, col, segs = 40) => {
    // (from the outside in: three's lathe faces then look out and up)
    const pts = prof.map(([r, y]) => new T.Vector2(Math.max(0.001, r), y)).reverse();
    const geo = new T.LatheGeometry(pts, segs);
    own.push(geo);
    return geo;
  };
  const ISL = plan.ISLETS || {};
  if (ISL.beach) {
    const B = ISL.beach;
    const g = group(B.x, 0, B.z);
    const P = B.profile;
    add(g, lathe([[0, P[0][1]], ...P.slice(1), [B.r + 0.6, 0.55], [B.r + 1.0, -0.4], [B.r + 1.2, SEA - 0.4]]), ink(COL.sand), 0, 0, 0);
    add(g, lathe([[B.r - 0.3, 1.36], [B.r + 0.15, 1.18], [B.r + 0.75, 0.45]]), flat(COL.sand2), 0, 0.01, 0);
    // rocks and shells round the shore, a driftwood log, a beach towel
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * TAU + R() * 0.4;
      const r = B.r + 0.15 + R() * 0.3;
      const s = 0.25 + R() * 0.3;
      add(g, sphere(7), ink(i % 2 ? 0x8e9aa6 : 0x7a8794), Math.cos(t) * r, 1.0 - s * 0.2, Math.sin(t) * r, R(), R(), 0, [s * 1.3, s * 0.8, s]);
    }
    for (let i = 0; i < 14; i++) {
      const t = R() * TAU;
      const r = 1.5 + R() * 4.8;
      const yy = (() => {
        for (let k = 1; k < P.length; k++) if (r <= P[k][0]) return P[k - 1][1] + ((P[k][1] - P[k - 1][1]) * (r - P[k - 1][0])) / (P[k][0] - P[k - 1][0]);
        return P[P.length - 1][1];
      })();
      add(g, sphere(6), flat([COL.pink, COL.cream, COL.orange, COL.white][i % 4]), Math.cos(t) * r, yy + 0.02, Math.sin(t) * r, 0, R() * TAU, 0, [0.09, 0.04, 0.07]);
    }
  }
  if (ISL.hill) {
    const H = ISL.hill;
    const g = group(H.x, 0, H.z);
    const P = H.profile;
    add(g, lathe([[0, P[0][1]], ...P.slice(1, -1), [H.r - 0.4, P[P.length - 1][1] + 0.05]], COL.grass, 48), ink(COL.grass), 0, 0, 0);
    add(g, lathe([[H.r - 0.45, P[P.length - 1][1] + 0.06], [H.r, P[P.length - 1][1] - 0.05], [H.r + 0.7, 0.5], [H.r + 1.1, -0.4], [H.r + 1.3, SEA - 0.4]], COL.sand, 48), ink(COL.sand), 0, 0, 0);
    // a darker band of grass on the shoulder, flowers and bushes round the rim (outside the walk)
    add(g, lathe([[3.7, P[1][1] + 0.012], [7.5, 2.37]], 0, 48), flat(0x6cbf4a), 0, 0.01, 0);
    // a path of pale flagstones from the steps up the shoulder to the summit, and on to the Villa's plot
    const pathPts = [[0, H.r - 0.9], [0, 3.9], [3.2, 2.0], [5.0, 1.6]];
    const yAt = (r) => {
      for (let k = 1; k < P.length; k++) if (r <= P[k][0]) return P[k - 1][1] + ((P[k][1] - P[k - 1][1]) * (r - P[k - 1][0])) / (P[k][0] - P[k - 1][0]);
      return P[P.length - 1][1];
    };
    for (let k = 1; k < pathPts.length; k++) {
      const [ax, az] = pathPts[k - 1];
      const [bx, bz] = pathPts[k];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / 0.62));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const x = ax + (bx - ax) * u + (R() - 0.5) * 0.12;
        const z = az + (bz - az) * u + (R() - 0.5) * 0.12;
        const r = Math.hypot(x, z);
        const y0 = yAt(r);
        // (laid on the slope: tilted up the way it climbs)
        const ux = (bx - ax) / L;
        const uz = (bz - az) / L;
        const rise = yAt(Math.hypot(x + ux * 0.3, z + uz * 0.3)) - yAt(Math.hypot(x - ux * 0.3, z - uz * 0.3));
        const st = add(g, rbox(1.25 + (R() - 0.5) * 0.2, 0.08, 0.5, 0.04), flat(i % 2 ? 0xe9dcb4 : 0xdccfa5), x, y0 + 0.04, z);
        st.rotation.set(-Math.atan2(rise, 0.6), Math.atan2(ux, uz) + (R() - 0.5) * 0.25, 0, 'YXZ');
      }
    }
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * TAU + R() * 0.2;
      const r = H.r - 0.3 + R() * 0.25;
      const big = i % 3 === 0;
      if (big) add(g, sphere(7), ink(COL.bush), Math.cos(t) * r, P[P.length - 1][1] + 0.2, Math.sin(t) * r, 0, 0, 0, [0.45, 0.35, 0.45]);
      else add(g, sphere(6), flat([COL.yellow, COL.pink, COL.white, COL.purple][i % 4]), Math.cos(t) * r, P[P.length - 1][1] + 0.08, Math.sin(t) * r, 0, 0, 0, 0.09);
    }
  }
  // Fisher's Pier: planks on piles from s18's back porch out to its end, a bollard and a lamp at the end
  if (plan.FISHER_PIER) {
    const F = plan.FISHER_PIER;
    const L = F.x1 - F.x0;
    const g = group((F.x0 + F.x1) / 2, 0, F.z);
    planks(g, L, F.w, F.y);
    for (const s of [-1, 1]) add(g, BOX, ink(COL.woodDark), 0, F.y - 0.27, s * (F.w / 2 - 0.08), 0, 0, 0, [L + 0.06, 0.24, 0.18]);
    const n = Math.round(L / 1.7);
    for (let i = 0; i <= n; i++) for (const s of [-1, 1]) post(g, -L / 2 + 0.15 + ((L - 0.3) * i) / n, SEA, F.y + (i === n ? 0.5 : -0.2), s * (F.w / 2 - 0.12), 0.13, COL.woodDark, i !== n);
    add(g, cyl(0.16, 0.2, 0.42, 9), ink(COL.iron), L / 2 - 0.45, F.y + 0.21, 0.75);
    add(g, cyl(0.07, 0.09, 2.5, 7), ink(COL.woodDark), L / 2 - 0.25, F.y + 1.25, -0.95);
    if (kit.lantern && kit.glow) kit.lantern(g, L / 2 - 0.25, F.y + 2.55, -0.95, kit.glow, 0.8);
  }

  mark('islets+pier');
  // ---------------------------------------------------------------- the painted words (signposts, arches)
  const words = [];
  for (const S of plan.SIGNPOSTS || []) for (const bd of S.boards) for (const w of bd.words) if (!words.includes(w)) words.push(w);
  for (const A of plan.ARCHES || []) if (!words.includes(A.words)) words.push(A.words);
  let wordMat = null;
  let tex = null;
  const cell = {};
  if (typeof document !== 'undefined' && words.length) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 64 * Math.ceil(words.length / 2);
    const x = c.getContext('2d');
    if (x) {
      words.forEach((wd, i) => {
        const cx = (i % 2) * 512;
        const cy = Math.floor(i / 2) * 64;
        x.fillStyle = '#fff1d0';
        x.fillRect(cx, cy, 512, 64);
        x.fillStyle = '#3a2412';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.font = `bold ${wd.length > 12 ? 34 : 42}px "Trebuchet MS", "Arial Rounded MT Bold", sans-serif`;
        x.fillText(wd, cx + 256, cy + 34, 492);
        cell[wd] = [cx / 1024, 1 - (cy + 64) / c.height, 512 / 1024, 64 / c.height];
      });
      tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = 4;
      wordMat = new T.MeshBasicMaterial({ map: tex, color: 0xf2efe8 });
      wordMat.name = 'sparrow-districts:words';
      wordMat.userData.outlineParameters = { visible: false };
    }
  }
  const wordGeos = [];
  const wordPlane = (wd, w, h, m4) => {
    const uv = cell[wd];
    if (!uv) return;
    const g = new T.PlaneGeometry(w, h);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * uv[2], uv[1] + a.getY(i) * uv[3]);
    g.applyMatrix4(m4);
    wordGeos.push(g);
  };
  const tmpO = new T.Object3D();
  const matOf = (parent, x, y, z, ry = 0) => {
    tmpO.position.set(x, y, z);
    tmpO.rotation.set(0, ry, 0);
    tmpO.updateMatrix();
    parent.updateWorldMatrix(true, false); // (its parents' too: a signpost's board hangs off its post)
    return new T.Matrix4().multiplyMatrices(parent.matrixWorld, tmpO.matrix);
  };

  // ---------------------------------------------------------------- the signposts
  const signs = [];
  for (const S of plan.SIGNPOSTS || []) {
    const g = group(S.x, S.y, S.z);
    const nb = S.boards.length;
    const top = 1.75 + 0.36 * Math.max(0, nb - 2);
    add(g, cyl(0.07, 0.09, top + 0.25, 7), ink(COL.woodDark), 0, (top + 0.25) / 2, 0);
    add(g, sphere(7), ink(DCOL[S.district] ?? COL.gold), 0, top + 0.3, 0, 0, 0, 0, 0.11);
    S.boards.forEach((bd, k) => {
      const yy = top - 0.36 * k;
      const ry = bd.h - Math.PI / 2; // the board's +x along its way
      const bg = group(0, yy, 0, ry, g);
      const txt = bd.words.join(' · ');
      add(bg, rbox(1.4, 0.34, 0.06, 0.03), ink(COL.wood3), 0.74, 0, 0);
      add(bg, rbox(0.32, 0.25, 0.07, 0.03), ink(bd.colour ?? COL.red), 1.45, 0, 0, 0, 0, Math.PI / 4);
      wordPlane(bd.words[0], 1.15, 0.25, matOf(bg, 0.68, 0, 0.036));
      wordPlane(bd.words[0], 1.15, 0.25, matOf(bg, 0.68, 0, -0.036, Math.PI));
      if (bd.words[1]) add(bg, rbox(0.1, 0.1, 0.075, 0.02), flat(DCOL[bd.districts[1]] ?? COL.white), 0.12, 0, 0);
      signs.push({ id: `${S.id}:${k}`, words: txt, x: S.x, y: S.y + yy, z: S.z });
    });
  }

  // ---------------------------------------------------------------- the named arches
  for (const A of plan.ARCHES || []) {
    const g = group(A.x, A.y, A.z, A.ry);
    const half = A.w / 2;
    const col = A.colour ?? COL.red;
    for (const s of [-1, 1]) {
      add(g, cyl(0.1, 0.13, A.h, 8), ink(COL.woodDark), s * half, A.h / 2, 0);
      add(g, rbox(0.34, 0.16, 0.34, 0.04), ink(COL.woodDark), s * half, 0.08, 0);
    }
    // the curved top: a rope-wrapped beam in the district's colour, the name board under it, lanterns or shells
    const arc = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      arc.push(V(-half + 2 * half * u, A.h + 0.35 * Math.sin(u * Math.PI), 0));
    }
    rope(g, ink(col), arc, 0.11, 7);
    add(g, rbox(Math.min(2 * half - 0.3, 2.6), 0.42, 0.1, 0.04), ink(COL.woodDark), 0, A.h - 0.35, 0);
    wordPlane(A.words, Math.min(2 * half - 0.45, 2.45), 0.32, matOf(g, 0, A.h - 0.35, 0.056));
    wordPlane(A.words, Math.min(2 * half - 0.45, 2.45), 0.32, matOf(g, 0, A.h - 0.35, -0.056, Math.PI));
    for (const s of [-1, 1]) {
      if (A.district === 'lantern' && kit.lantern && kit.glow) kit.lantern(g, s * (half - 0.45), A.h - 0.55, 0, kit.glow, 0.75);
      else add(g, sphere(8), ink(A.district === 'beach' ? COL.pink : COL.gold), s * (half - 0.4), A.h + 0.12, 0, 0, 0, 0, 0.16);
    }
  }
  mark('signs+arches');
  let words3 = null;
  if (wordMat && wordGeos.length) {
    // (one mesh: the words of every sign and arch)
    const merged = mergeAll(T, wordGeos);
    for (const g of wordGeos) g.dispose();
    words3 = new T.Mesh(merged, wordMat);
    words3.name = 'sparrow-districts-words';
    words3.userData.keep = true; // (not baked: it carries a texture of its own)
    words3.matrixAutoUpdate = false;
    statics.add(words3);
    own.push(merged);
  }

  let triangles = 0;
  statics.updateMatrixWorld(true);
  statics.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return {
    statics,
    anim: { lanterns },
    signs,
    triangles: Math.round(triangles),
    parts,
    dispose() {
      for (const g of own) g.dispose();
      if (tex) tex.dispose();
      if (wordMat) wordMat.dispose();
    },
  };
}

/** Join plain (non-indexed or indexed) geometries with position, normal and uv into one. */
function mergeAll(T, geos) {
  let verts = 0;
  let idx = 0;
  for (const g of geos) {
    verts += g.attributes.position.count;
    idx += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const index = new Uint32Array(idx);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.array[i] + vo;
    else for (let i = 0; i < n; i++) index[io++] = vo + i;
    vo += n;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  out.setIndex(new T.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
