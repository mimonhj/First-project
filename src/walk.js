// Walking rules for the town on Sparrow's Floating Island (pure: imports nothing, so Node tests
// load it as a data: URL).
//
// createWalk(data) takes the plain walk data that sparrow.build() exports as env.walk:
//   areas:    where the captain's CENTRE may stand. { id, kind: 'rect', x, z, w, d, ry, y } (ry turns the
//             rect like THREE's rotation.y: local (lx, lz) -> (x + lx cos ry + lz sin ry, z - lx sin ry +
//             lz cos ry)) or { id, kind: 'circle', x, z, r, y, profile?: [[radius, y], ...] } (a mound:
//             the height follows the profile, linearly, from the centre out).
//   links:    rope bridges { id, pts: [[x, y, z], ...], hw }: the centre may stray hw from the polyline;
//             the height is interpolated along it.
//   blockers: static obstacles { x, z, r, h } | { x, z, w, d, ry, h } (inflated by the walker's radius).
//   places:   { id, name, x, z, r, face, ... }; spawn: { x, z, h }; radius (optional, default 0.3).
// Everything here works on the ground plan (x, z) plus the surface height; nothing is ever mutated.

const CLIMB = 0.35; // the most the feet may rise or drop in one step
const SUB = 0.1; // move() and the path checks advance in steps no longer than this
const SLIDE = [15, 30, 45, 60].map((d) => (d * Math.PI) / 180); // a blocked step tries these turns, either way
const EPS = 1e-9;
const CELL = 2; // spatial hash cell for obstacles and surfaces

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function createWalk(data = {}) {
  if (!data || typeof data !== 'object') data = {};
  const R0 = num(data.radius, 0.3);

  // ---- surfaces ----
  const areas = [];
  for (const a of Array.isArray(data.areas) ? data.areas : []) {
    if (!a) continue;
    if (a.kind === 'circle') {
      const prof = Array.isArray(a.profile) && a.profile.length ? a.profile.map((p) => [num(p[0]), num(p[1])]).sort((p, q) => p[0] - q[0]) : null;
      areas.push({ id: a.id, kind: 'circle', x: num(a.x), z: num(a.z), r: Math.max(0, num(a.r)), y: num(a.y), prof });
    } else {
      const ry = num(a.ry);
      areas.push({ id: a.id, kind: 'rect', x: num(a.x), z: num(a.z), hw: Math.max(0, num(a.w)) / 2, hd: Math.max(0, num(a.d)) / 2, y: num(a.y), c: Math.cos(ry), s: Math.sin(ry) });
    }
  }
  const segs = []; // link segments
  const links = [];
  for (const l of Array.isArray(data.links) ? data.links : []) {
    if (!l || !Array.isArray(l.pts) || l.pts.length < 2) continue;
    const hw = Math.max(0, num(l.hw, 0.25));
    const pts = l.pts.map((p) => [num(p[0]), num(p[1]), num(p[2])]);
    const link = { id: l.id, pts, hw, segs: [] };
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay, az] = pts[i];
      const [bx, by, bz] = pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const s = { ax, ay, az, bx, by, bz, dx, dz, l2: dx * dx + dz * dz, hw, link };
      link.segs.push(s);
      segs.push(s);
    }
    links.push(link);
  }
  const obstacles = [];
  for (const b of Array.isArray(data.blockers) ? data.blockers : []) {
    if (!b) continue;
    if (b.r !== undefined) obstacles.push({ x: num(b.x), z: num(b.z), r: Math.max(0, num(b.r)) });
    else {
      const ry = num(b.ry);
      obstacles.push({ x: num(b.x), z: num(b.z), hw: Math.max(0, num(b.w)) / 2, hd: Math.max(0, num(b.d)) / 2, c: Math.cos(ry), s: Math.sin(ry) });
    }
  }
  const places = (Array.isArray(data.places) ? data.places : []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const spawn = data.spawn && Number.isFinite(data.spawn.x) ? { x: data.spawn.x, z: data.spawn.z, h: num(data.spawn.h) } : null;

  // ---- spatial hash (obstacles by their reach, surfaces by their bounds) ----
  const hash = new Map();
  const key = (i, j) => i * 73856093 + j * 19349663;
  const put = (minX, minZ, maxX, maxZ, kind, item) => {
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) {
      for (let j = Math.floor(minZ / CELL); j <= Math.floor(maxZ / CELL); j++) {
        const k = key(i, j);
        let e = hash.get(k);
        if (!e) hash.set(k, (e = { obs: [], areas: [], segs: [] }));
        e[kind].push(item);
      }
    }
  };
  const REACH = 1.5; // obstacles are found for walkers up to this radius
  for (const o of obstacles) {
    const ext = o.r !== undefined ? o.r : Math.hypot(o.hw, o.hd);
    put(o.x - ext - REACH, o.z - ext - REACH, o.x + ext + REACH, o.z + ext + REACH, 'obs', o);
  }
  for (const a of areas) {
    const ext = a.kind === 'circle' ? a.r : Math.hypot(a.hw, a.hd);
    put(a.x - ext, a.z - ext, a.x + ext, a.z + ext, 'areas', a);
  }
  for (const s of segs) put(Math.min(s.ax, s.bx) - s.hw, Math.min(s.az, s.bz) - s.hw, Math.max(s.ax, s.bx) + s.hw, Math.max(s.az, s.bz) + s.hw, 'segs', s);
  const NONE = { obs: [], areas: [], segs: [] };
  const cellAt = (x, z) => hash.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || NONE;

  // ---- geometry ----
  const inArea = (a, x, z) => {
    const dx = x - a.x;
    const dz = z - a.z;
    if (a.kind === 'circle') return dx * dx + dz * dz <= a.r * a.r + EPS;
    const lx = dx * a.c - dz * a.s;
    const lz = dx * a.s + dz * a.c;
    return Math.abs(lx) <= a.hw + EPS && Math.abs(lz) <= a.hd + EPS;
  };
  const areaY = (a, x, z) => {
    if (a.kind !== 'circle' || !a.prof) return a.y;
    const r = Math.hypot(x - a.x, z - a.z);
    const P = a.prof;
    if (r <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) {
      if (r <= P[i][0]) {
        const k = (r - P[i - 1][0]) / Math.max(EPS, P[i][0] - P[i - 1][0]);
        return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k;
      }
    }
    return P[P.length - 1][1];
  };
  // closest point of a link segment to (x, z): [distance, height there]
  const segNear = (s, x, z) => {
    let t = s.l2 > EPS ? ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.ax + s.dx * t;
    const pz = s.az + s.dz * t;
    return [Math.hypot(x - px, z - pz), s.ay + (s.by - s.ay) * t];
  };
  // signed distance from (x, z) to an obstacle's outline (negative inside)
  const obsDist = (o, x, z) => {
    const dx = x - o.x;
    const dz = z - o.z;
    if (o.r !== undefined) return Math.hypot(dx, dz) - o.r;
    const lx = Math.abs(dx * o.c - dz * o.s) - o.hw;
    const lz = Math.abs(dx * o.s + dz * o.c) - o.hd;
    const ox = Math.max(lx, 0);
    const oz = Math.max(lz, 0);
    return Math.hypot(ox, oz) + Math.min(Math.max(lx, lz), 0);
  };

  /** Every surface height under (x, z). */
  function heights(x, z) {
    const c = cellAt(x, z);
    const out = [];
    for (const a of c.areas) if (inArea(a, x, z)) out.push(areaY(a, x, z));
    for (const s of c.segs) {
      const [d, y] = segNear(s, x, z);
      if (d <= s.hw + EPS) out.push(y);
    }
    return out;
  }
  function inside(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const c = cellAt(x, z);
    for (const a of c.areas) if (inArea(a, x, z)) return true;
    for (const s of c.segs) if (segNear(s, x, z)[0] <= s.hw + EPS) return true;
    return false;
  }
  function heightAt(x, z, yHint = null) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const hs = heights(x, z);
    if (!hs.length) return null;
    let best = hs[0];
    for (const h of hs) {
      if (yHint === null || yHint === undefined || !Number.isFinite(yHint)) best = Math.max(best, h);
      else if (Math.abs(h - yHint) < Math.abs(best - yHint)) best = h;
    }
    return best;
  }
  // how far (x, z) with radius r reaches into each obstacle: the deepest overlap (<= 0 when free)
  function overlap(x, z, r, dynamic) {
    let worst = -Infinity;
    for (const o of cellAt(x, z).obs) worst = Math.max(worst, r - obsDist(o, x, z));
    if (dynamic) for (const d of dynamic) if (d && Number.isFinite(d.x)) worst = Math.max(worst, r + num(d.r) - Math.hypot(x - d.x, z - d.z));
    return worst;
  }
  function blocked(x, z, r = R0, dynamic = []) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return true;
    return overlap(x, z, num(r, R0), dynamic) > EPS;
  }
  // A step from (x0, z0) to (x1, z1) never pushes deeper into anything it already touches
  // (so a walker that a moving townsperson bumped into can still step away).
  function stepFree(x0, z0, x1, z1, r, dynamic) {
    const c1 = cellAt(x1, z1);
    for (const o of c1.obs) {
      const p1 = r - obsDist(o, x1, z1);
      if (p1 > EPS && p1 > r - obsDist(o, x0, z0) + EPS) return false;
    }
    if (dynamic) {
      for (const d of dynamic) {
        if (!d || !Number.isFinite(d.x)) continue;
        const rr = r + num(d.r);
        const p1 = rr - Math.hypot(x1 - d.x, z1 - d.z);
        if (p1 > EPS && p1 > rr - Math.hypot(x0 - d.x, z0 - d.z) + EPS) return false;
      }
    }
    return true;
  }

  function move(from, dx, dz, r = R0, dynamic = []) {
    let x = num(from && from.x, NaN);
    let z = num(from && from.z, NaN);
    let y = from && Number.isFinite(from.y) ? from.y : heightAt(x, z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || y === null) return { x, z, y, moved: false };
    dx = num(dx);
    dz = num(dz);
    r = num(r, R0);
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SUB));
    const sx = dx / n;
    const sz = dz / n;
    let moved = false;
    const tryTo = (nx, nz) => {
      if (!inside(nx, nz)) return false;
      const ny = heightAt(nx, nz, y);
      if (ny === null || Math.abs(ny - y) > CLIMB) return false;
      if (!stepFree(x, z, nx, nz, r, dynamic)) return false;
      x = nx;
      z = nz;
      y = ny;
      return true;
    };
    // A blocked step slides: it tries the step along each axis alone and the step turned up to 60° either
    // way (shortened by the cosine), the one that gets furthest the intended way first. So a walker slides
    // along a slanting edge (a rope bridge's side), and round a round post, instead of stopping dead.
    const alt = [];
    if (sx || sz) {
      const s2 = sx * sx + sz * sz;
      if (sx && sz) alt.push([sx, 0, (sx * sx) / s2], [0, sz, (sz * sz) / s2]);
      for (const a of SLIDE) {
        const c = Math.cos(a);
        const sn = Math.sin(a);
        for (const sg of [1, -1]) alt.push([(sx * c - sg * sz * sn) * c, (sg * sx * sn + sz * c) * c, c * c]);
      }
      alt.sort((p, q) => q[2] - p[2]);
    }
    for (let i = 0; i < n; i++) {
      if (!(sx || sz)) break;
      if (tryTo(x + sx, z + sz)) {
        moved = true;
        continue;
      }
      let ok = false;
      for (const [ax, az] of alt) {
        if (tryTo(x + ax, z + az)) {
          ok = true;
          break;
        }
      }
      if (!ok) break;
      moved = true;
    }
    return { x, z, y, moved };
  }

  function nearestPlace(x, z) {
    let best = null;
    for (const p of places) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d <= num(p.r, 1.5) && (!best || d < best.dist)) best = { place: p, dist: d };
    }
    return best;
  }

  const free = (x, z) => inside(x, z) && !blocked(x, z, R0);
  function snap(x, z, maxDist = 3) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (free(x, z)) return { x, z };
    for (let rr = 0.05; rr <= maxDist + EPS; rr += 0.05) {
      const n = Math.max(12, Math.ceil((2 * Math.PI * rr) / 0.05));
      let best = null;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI;
        const px = x + Math.cos(a) * rr;
        const pz = z + Math.sin(a) * rr;
        if (free(px, pz)) {
          best = { x: px, z: pz };
          break;
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Can a walker go straight from a to b? (every SUB along it inside, free and within a step's climb)
  function clear(a, b, r = R0) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / SUB));
    let y = heightAt(a.x, a.z);
    if (y === null) return false;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (!inside(x, z) || blocked(x, z, r)) return false;
      const ny = heightAt(x, z, y);
      if (ny === null || Math.abs(ny - y) > CLIMB) return false;
      y = ny;
    }
    return true;
  }

  // ---- the graph: area centres and a grid over each area, portal centres, link ends and every 1.5
  // along the links, places and the spawn; edges between nearby nodes with a clear straight walk ----
  let G = null;
  function graph() {
    if (G) return G;
    const nodes = [];
    const addNode = (x, z) => {
      if (!free(x, z)) return;
      for (const n of nodes) if (Math.abs(n.x - x) < 0.2 && Math.abs(n.z - z) < 0.2) return;
      nodes.push({ x, z });
    };
    const GRID = 0.8;
    for (const a of areas) {
      addNode(a.x, a.z);
      if (a.kind === 'circle') {
        for (let rr = GRID; rr <= a.r; rr += GRID) {
          const n = Math.max(6, Math.round((2 * Math.PI * rr) / GRID));
          for (let k = 0; k < n; k++) addNode(a.x + Math.cos((k / n) * 2 * Math.PI) * rr, a.z + Math.sin((k / n) * 2 * Math.PI) * rr);
        }
      } else {
        const nx = Math.max(1, Math.ceil((2 * a.hw) / GRID));
        const nz = Math.max(1, Math.ceil((2 * a.hd) / GRID));
        for (let i = 0; i <= nx; i++) {
          for (let j = 0; j <= nz; j++) {
            const lx = nx ? -a.hw + (2 * a.hw * i) / nx : 0;
            const lz = nz ? -a.hd + (2 * a.hd * j) / nz : 0;
            addNode(a.x + lx * a.c + lz * a.s, a.z - lx * a.s + lz * a.c);
          }
        }
      }
    }
    for (const l of links) {
      const P = l.pts;
      let acc = 0;
      addNode(P[0][0], P[0][2]);
      for (let i = 1; i < P.length; i++) {
        const sl = Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]);
        let s = 1.5 - acc;
        while (s <= sl) {
          const t = s / Math.max(EPS, sl);
          addNode(P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][2] + (P[i][2] - P[i - 1][2]) * t);
          s += 1.5;
        }
        acc = (acc + sl) % 1.5;
      }
      addNode(P[P.length - 1][0], P[P.length - 1][2]);
    }
    for (const p of places) {
      const s = snap(p.x, p.z, 1);
      if (s) addNode(s.x, s.z);
    }
    if (spawn) addNode(spawn.x, spawn.z);
    const edges = [];
    const adj = nodes.map(() => []);
    const LINK = 1.75;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (d > LINK || !clear(nodes[i], nodes[j])) continue;
        edges.push([i, j]);
        adj[i].push([j, d]);
        adj[j].push([i, d]);
      }
    }
    G = { nodes, edges, adj };
    return G;
  }

  function path(from, to) {
    if (!from || !to) return [];
    const a = free(from.x, from.z) ? { x: from.x, z: from.z } : snap(from.x, from.z, 1);
    const b = snap(to.x, to.z, 3);
    if (!a || !b) return [];
    if (clear(a, b)) return [a, b];
    const { nodes, adj } = graph();
    // hook the two ends onto the graph
    const near = (p) => {
      const out = [];
      for (let i = 0; i < nodes.length; i++) {
        const d = Math.hypot(nodes[i].x - p.x, nodes[i].z - p.z);
        if (d <= 2.5) out.push([i, d]);
      }
      out.sort((u, v) => u[1] - v[1]);
      return out.filter(([i]) => clear(p, nodes[i])).slice(0, 8);
    };
    const starts = near(a);
    const goals = new Map(near(b).map(([i, d]) => [i, d]));
    if (!starts.length || !goals.size) return [];
    // A* (the goal edges are the last hop)
    const N = nodes.length;
    const g = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    const h = (i) => Math.hypot(nodes[i].x - b.x, nodes[i].z - b.z);
    const open = [];
    const push = (i, f) => {
      open.push([f, i]);
      let k = open.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (open[p][0] <= open[k][0]) break;
        [open[p], open[k]] = [open[k], open[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop();
      if (open.length) {
        open[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === k) break;
          [open[m], open[k]] = [open[k], open[m]];
          k = m;
        }
      }
      return top;
    };
    for (const [i, d] of starts) {
      g[i] = d;
      push(i, d + h(i));
    }
    let best = -1;
    let bestCost = Infinity;
    while (open.length) {
      const [f, i] = pop();
      if (done[i]) continue;
      if (f >= bestCost) break;
      done[i] = 1;
      if (goals.has(i) && g[i] + goals.get(i) < bestCost) {
        bestCost = g[i] + goals.get(i);
        best = i;
      }
      for (const [j, d] of adj[i]) {
        if (done[j] || g[i] + d >= g[j]) continue;
        g[j] = g[i] + d;
        prev[j] = i;
        push(j, g[j] + h(j));
      }
    }
    if (best < 0) return [];
    const chain = [];
    for (let i = best; i >= 0; i = prev[i]) chain.push(nodes[i]);
    chain.reverse();
    const pts = [a, ...chain, b];
    // string pulling: from each corner, go straight to the furthest point still in clear view
    const out = [a];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !clear(pts[i], pts[j])) j--;
      out.push({ x: pts[j].x, z: pts[j].z });
      i = j;
    }
    return out;
  }

  function pick(origin, dir) {
    if (!Array.isArray(origin) || !Array.isArray(dir)) return null;
    const [ox, oy, oz] = origin.map((v) => num(v, NaN));
    const [dx, dy, dz] = dir.map((v) => num(v, NaN));
    if (![ox, oy, oz, dx, dy, dz].every(Number.isFinite) || Math.abs(dy) < 1e-9) return null;
    let bestT = Infinity;
    let hit = null;
    const at = (y) => (y - oy) / dy;
    const take = (t, test) => {
      if (!(t > 0) || t >= bestT) return;
      const x = ox + dx * t;
      const z = oz + dz * t;
      if (test(x, z)) {
        bestT = t;
        hit = { x, z };
      }
    };
    for (const a of areas) {
      let t = at(a.y);
      if (a.kind === 'circle' && a.prof) {
        // a mound: settle on its height under the hit (a few fixed-point steps)
        for (let k = 0; k < 4; k++) t = at(areaY(a, ox + dx * t, oz + dz * t));
      }
      take(t, (x, z) => inArea(a, x, z));
    }
    for (const s of segs) take(at((s.ay + s.by) / 2), (x, z) => segNear(s, x, z)[0] <= s.hw + EPS);
    return hit;
  }

  return {
    inside,
    heightAt,
    blocked,
    move,
    nearestPlace,
    path,
    snap,
    pick,
    clear,
    get graph() {
      const { nodes, edges } = graph();
      return { nodes: nodes.map((n) => ({ x: n.x, z: n.z })), edges: edges.map((e) => [...e]) };
    },
    get radius() {
      return R0;
    },
    get places() {
      return places;
    },
    get spawn() {
      return spawn;
    },
  };
}
