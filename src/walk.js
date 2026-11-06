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
//
// The path graph (SPEC4 §6.6) is built once, on the first path() or the first read of `graph` (the town reads
// it at dock open, behind the "Rowing to…" toast). Its nodes dedupe through a grid map and its edges are only
// tried between nodes in neighbouring cells, which gives exactly the nodes (in order) and the edges (sorted
// [i, j], i < j) of trying every node against every node; path() hooks its ends on through the same grid, A*
// reuses arrays sized once per graph and string pulling remembers its node-to-node answers. clear() answers
// as the step-by-step test always did, in one cell lookup a step. tests/walkgraph.test.cjs compares all of it
// with the brute force.

const CLIMB = 0.35; // the most the feet may rise or drop in one step
const SUB = 0.1; // move() and the path checks advance in steps no longer than this
const SLIDE = [15, 30, 45, 60].map((d) => (d * Math.PI) / 180); // a blocked step tries these turns, either way
const EPS = 1e-9;
const CELL = 2; // spatial hash cell for obstacles and surfaces
const DUP = 0.2; // two graph nodes closer than this on both axes are one (and the dedupe grid's cell)
const LINK = 1.75; // graph edges join nodes at most this far apart
const NEAR = 2.5; // path() hooks its two ends onto the nodes this near
const NODE_CELL = 2; // the node grid's cell for edges and near() (>= LINK, so neighbouring cells hold every pair)
const MEMO_MAX = 1 << 16; // node-to-node clear() answers kept for string pulling, then forgotten and started again
const PROBE = 24; // a straight walk of this many steps or more looks at three of them first (clearXZ)
const TAME = 1e4; // walk data within this many u of the origin takes the grid shortcuts; beyond it, today's code
// a grid cell's key: 15 bits of each index (unique for every cell within TAME of the origin; a point further
// out may share a cell's key, which only adds candidates that the exact tests then drop)
const gridKey = (i, j) => ((i & 0x7fff) << 15) | (j & 0x7fff);
// the cells [i0..i1] x [j0..j1] that hold every point within rad of (x, z) on both axes (with a margin
// for rounding, so no candidate is ever missed); null a billion u out, where the callers look at every node
const FAR = 1e9;
function cellSpan(x, z, rad, cell) {
  if (!(Math.abs(x) <= FAR && Math.abs(z) <= FAR)) return null;
  const mx = rad + 1e-9 + 1e-15 * Math.abs(x);
  const mz = rad + 1e-9 + 1e-15 * Math.abs(z);
  return [Math.floor((x - mx) / cell), Math.floor((x + mx) / cell), Math.floor((z - mz) / cell), Math.floor((z + mz) / cell)];
}

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

  // Is every number of the walk within TAME? Then no sum or product in the tests below can overflow (so none
  // is ever NaN) and every grid cell has its own key, so the shortcuts give exactly what today's tests give; a
  // walk that isn't takes today's code throughout.
  const small = (...v) => v.every((q) => Math.abs(q) <= TAME);
  const tame =
    small(R0) &&
    areas.every((a) => small(a.x, a.z, a.y, a.kind === 'circle' ? a.r : Math.hypot(a.hw, a.hd)) && (!a.prof || a.prof.every((p) => small(p[0], p[1])))) &&
    segs.every((s) => small(s.ax, s.ay, s.az, s.bx, s.by, s.bz, s.hw)) &&
    obstacles.every((o) => small(o.x, o.z, o.r !== undefined ? o.r : Math.hypot(o.hw, o.hd)));

  // ---- spatial hash (obstacles by their reach, surfaces by their bounds) ----
  const hash = new Map();
  // (small integers when tame, so a lookup allocates nothing; today's key otherwise)
  const key = tame ? gridKey : (i, j) => i * 73856093 + j * 19349663;
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

  // r - obsDist(o, x, z) > EPS (o blocks a walker of radius r at x, z), turning the far ones away before the
  // square root: an obstacle's signed distance is never less than its outline's on one axis alone (give or
  // take a rounding far below EPS on a tame walk), so one that is further than r on an axis can't block
  const hits = (o, x, z, r) => {
    const dx = x - o.x;
    const dz = z - o.z;
    if (o.r !== undefined) {
      if (Math.abs(dx) - o.r > r || Math.abs(dz) - o.r > r) return false;
      return r - (Math.hypot(dx, dz) - o.r) > EPS;
    }
    const lx = Math.abs(dx * o.c - dz * o.s) - o.hw;
    const lz = Math.abs(dx * o.s + dz * o.c) - o.hd;
    if (lx > r || lz > r) return false;
    return r - (Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0)) > EPS;
  };
  // inside(x, z) && !blocked(x, z, r) in one cell lookup (the same tests as theirs)
  function freeAt(x, z, r) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (!tame) return inside(x, z) && !blocked(x, z, r);
    const c = cellAt(x, z);
    const A = c.areas;
    let on = false;
    for (let k = 0; k < A.length; k++) {
      if (inArea(A[k], x, z)) {
        on = true;
        break;
      }
    }
    if (!on) {
      const S = c.segs;
      for (let k = 0; k < S.length; k++) {
        const s = S[k];
        let t = s.l2 > EPS ? ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(x - (s.ax + s.dx * t), z - (s.az + s.dz * t)) <= s.hw + EPS) {
          on = true;
          break;
        }
      }
    }
    if (!on) return false;
    const O = c.obs;
    for (let k = 0; k < O.length; k++) if (hits(O[k], x, z, r)) return false;
    return true;
  }
  // One step of a straight walk on a tame walk: inside(x, z), !blocked(x, z, r) and heightAt(x, z, y), with
  // the same tests in the same order as theirs, in one cell lookup; the height there, or NaN when the step
  // can't stand there. (On a tame walk every height is finite, as y is.)
  function stepAt(x, z, y, r) {
    const c = cellAt(x, z);
    const A = c.areas;
    let best = NaN;
    for (let k = 0; k < A.length; k++) {
      const a = A[k];
      const dx = x - a.x;
      const dz = z - a.z;
      let h;
      if (a.kind === 'circle') {
        if (!(dx * dx + dz * dz <= a.r * a.r + EPS)) continue;
        h = a.prof ? areaY(a, x, z) : a.y;
      } else {
        if (!(Math.abs(dx * a.c - dz * a.s) <= a.hw + EPS && Math.abs(dx * a.s + dz * a.c) <= a.hd + EPS)) continue;
        h = a.y;
      }
      if (best !== best || Math.abs(h - y) < Math.abs(best - y)) best = h;
    }
    const S = c.segs;
    for (let k = 0; k < S.length; k++) {
      const s = S[k];
      let t = s.l2 > EPS ? ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (!(Math.hypot(x - (s.ax + s.dx * t), z - (s.az + s.dz * t)) <= s.hw + EPS)) continue;
      const h = s.ay + (s.by - s.ay) * t;
      if (best !== best || Math.abs(h - y) < Math.abs(best - y)) best = h;
    }
    if (best !== best) return NaN;
    const O = c.obs;
    for (let k = 0; k < O.length; k++) if (hits(O[k], x, z, r)) return NaN;
    return best;
  }
  // clear() from (ax, az), whose height is y0 (heightAt(ax, az): null off the walk), to (bx, bz)
  function clearXZ(ax, az, bx, bz, r, y0 = heightAt(ax, az)) {
    if (!tame) return clearAsToday(ax, az, bx, bz, r, y0);
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / SUB));
    let y = y0;
    if (y === null) return false;
    // A long walk first looks at three of its steps (the same points), only at where they stand: one off the
    // walk or blocked fails it whichever step comes first, as most of string pulling's long looks do.
    if (n >= PROBE && n < 1e9) {
      for (let q = 0; q < 3; q++) {
        const t = Math.floor((n * (q === 0 ? 2 : q === 1 ? 1 : 3)) / 4) / n; // (steps n/2, n/4, 3n/4)
        if (!freeAt(ax + (bx - ax) * t, az + (bz - az) * t, r)) return false;
      }
    }
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      const ny = stepAt(x, z, y, r);
      if (ny !== ny || Math.abs(ny - y) > CLIMB) return false;
      y = ny;
    }
    return true;
  }
  // (the step-by-step test as it always was, for a walk that isn't tame)
  function clearAsToday(ax, az, bx, bz, r, y0) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / SUB));
    let y = y0;
    if (y === null) return false;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (!inside(x, z) || blocked(x, z, r)) return false;
      const ny = heightAt(x, z, y);
      if (ny === null || Math.abs(ny - y) > CLIMB) return false;
      y = ny;
    }
    return true;
  }

  const free = (x, z) => freeAt(x, z, R0);
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
    return clearXZ(a.x, a.z, b.x, b.z, num(r, R0));
  }

  // ---- the graph: area centres and a grid over each area, portal centres, link ends and every 1.5
  // along the links, places and the spawn; edges between nearby nodes with a clear straight walk ----
  let G = null;
  function graph() {
    if (G) return G;
    const nodes = [];
    // a node within DUP of an earlier one on both axes is that node: only the earlier nodes in the
    // dedupe grid's cells round it can be
    const dups = new Map();
    const addNode = (x, z) => {
      const span = tame ? cellSpan(x, z, DUP, DUP) : null;
      if (!span) {
        for (const n of nodes) if (Math.abs(n.x - x) < DUP && Math.abs(n.z - z) < DUP) return;
      } else {
        const [i0, i1, j0, j1] = span;
        for (let i = i0; i <= i1; i++) {
          for (let j = j0; j <= j1; j++) {
            const e = dups.get(gridKey(i, j));
            if (e) for (const n of e) if (Math.abs(n.x - x) < DUP && Math.abs(n.z - z) < DUP) return;
          }
        }
      }
      if (!free(x, z)) return;
      const n = { x, z };
      nodes.push(n);
      if (!tame) return;
      const k = gridKey(Math.floor(x / DUP), Math.floor(z / DUP));
      const e = dups.get(k);
      if (e) e.push(n);
      else dups.set(k, [n]);
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
    const N = nodes.length;
    // the node grid (for the edges and near()): each cell's node indices, ascending
    const cells = new Map();
    if (tame) {
      for (let i = 0; i < N; i++) {
        const k = gridKey(Math.floor(nodes[i].x / NODE_CELL), Math.floor(nodes[i].z / NODE_CELL));
        const e = cells.get(k);
        if (e) e.push(i);
        else cells.set(k, [i]);
      }
    }
    const nodeY = nodes.map((n) => heightAt(n.x, n.z)); // each node's height, as clear() from it starts
    const edges = [];
    const lens = [];
    const deg = new Int32Array(N);
    const buf = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      // the nodes after i in the cells round it, in index order: the pairs the every-pair loop would try
      let m = 0;
      const span = tame ? cellSpan(nodes[i].x, nodes[i].z, LINK, NODE_CELL) : null;
      if (!span) for (let j = i + 1; j < N; j++) buf[m++] = j;
      else {
        const [i0, i1, j0, j1] = span;
        for (let ci = i0; ci <= i1; ci++) {
          for (let cj = j0; cj <= j1; cj++) {
            const e = cells.get(gridKey(ci, cj));
            if (e) for (let q = 0; q < e.length; q++) if (e[q] > i) buf[m++] = e[q];
          }
        }
      }
      const cand = buf.subarray(0, m).sort(); // (a typed array sorts by value)
      for (let q = 0; q < m; q++) {
        const j = cand[q];
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (d > LINK || !clearXZ(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z, R0, nodeY[i])) continue;
        edges.push([i, j]);
        lens.push(d);
        deg[i]++;
        deg[j]++;
      }
    }
    // each node's neighbours in typed arrays (node k's are at [first[k], first[k + 1])), in the order its edges
    // were found, as A* has always looked at them
    const first = new Int32Array(N + 1);
    for (let k = 0; k < N; k++) first[k + 1] = first[k] + deg[k];
    const nbr = new Int32Array(first[N]);
    const len = new Float64Array(first[N]);
    const at = first.slice(0, N);
    for (let e = 0; e < edges.length; e++) {
      const [i, j] = edges[e];
      nbr[at[i]] = j;
      len[at[i]++] = lens[e];
      nbr[at[j]] = i;
      len[at[j]++] = lens[e];
    }
    const nx = new Float64Array(N);
    const nz = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      nx[k] = nodes[k].x;
      nz[k] = nodes[k].z;
    }
    // A*'s arrays, sized once: an entry counts only when its stamp is this search's
    const heapCap = Math.max(16, 2 * N);
    G = {
      nodes,
      edges,
      first,
      nbr,
      len,
      nx,
      nz,
      cells,
      nodeY,
      memo: new Map(),
      g: new Float64Array(N),
      prev: new Int32Array(N),
      seen: new Uint32Array(N),
      shut: new Uint32Array(N),
      goalD: new Float64Array(N),
      goalS: new Uint32Array(N),
      stamp: 0,
      heapF: new Float64Array(heapCap),
      heapI: new Int32Array(heapCap),
    };
    return G;
  }

  // clear() from node i to node j, remembered (string pulling asks the same pairs again)
  function clearNodes(i, j) {
    const k = i * G.nodes.length + j;
    let v = G.memo.get(k);
    if (v === undefined) {
      const { nodes } = G;
      v = clearXZ(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z, R0, G.nodeY[i]);
      if (G.memo.size >= MEMO_MAX) G.memo.clear();
      G.memo.set(k, v);
    }
    return v;
  }

  function path(from, to) {
    if (!from || !to) return [];
    const a = free(from.x, from.z) ? { x: from.x, z: from.z } : snap(from.x, from.z, 1);
    const b = snap(to.x, to.z, 3);
    if (!a || !b) return [];
    if (clear(a, b)) return [a, b];
    const { nodes, cells } = graph();
    // hook the two ends onto the graph: the nodes within NEAR, nearest first (ties in index order), that
    // can be walked to straight, at most 8
    const near = (p) => {
      const out = [];
      const take = (i) => {
        const d = Math.hypot(nodes[i].x - p.x, nodes[i].z - p.z);
        if (d <= NEAR) out.push([i, d]);
      };
      const span = tame ? cellSpan(p.x, p.z, NEAR, NODE_CELL) : null;
      if (!span) for (let i = 0; i < nodes.length; i++) take(i);
      else {
        const [i0, i1, j0, j1] = span;
        for (let ci = i0; ci <= i1; ci++) {
          for (let cj = j0; cj <= j1; cj++) {
            const e = cells.get(gridKey(ci, cj));
            if (e) for (const i of e) take(i);
          }
        }
      }
      out.sort((u, v) => u[1] - v[1] || u[0] - v[0]);
      const ok = [];
      for (const q of out) {
        if (clearXZ(p.x, p.z, nodes[q[0]].x, nodes[q[0]].z, R0)) ok.push(q);
        if (ok.length === 8) break;
      }
      return ok;
    };
    const starts = near(a);
    const goals = near(b);
    if (!starts.length || !goals.length) return [];
    // A* (the goal edges are the last hop); g and prev count only where seen holds this search's stamp, a
    // node is done when shut does and a goal when goalS does, so nothing is cleared or allocated per search
    if (G.stamp >= 0xfffffffe) {
      G.seen.fill(0);
      G.shut.fill(0);
      G.goalS.fill(0);
      G.stamp = 0;
    }
    const S = ++G.stamp;
    const { g, prev, seen, shut, goalD, goalS, first, nbr, len, nx, nz } = G;
    for (const [i, d] of goals) {
      goalS[i] = S;
      goalD[i] = d;
    }
    const bx = b.x;
    const bz = b.z;
    // a binary heap of (f, node) in two typed arrays, sifted exactly as an array of pairs would be
    let hf = G.heapF;
    let hi = G.heapI;
    let size = 0;
    const push = (i, f) => {
      if (size === hf.length) {
        const nf = new Float64Array(hf.length * 2);
        const ni = new Int32Array(hi.length * 2);
        nf.set(hf);
        ni.set(hi);
        G.heapF = hf = nf;
        G.heapI = hi = ni;
      }
      let k = size++;
      hf[k] = f;
      hi[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= hf[k]) break;
        const tf = hf[p];
        const ti = hi[p];
        hf[p] = hf[k];
        hi[p] = hi[k];
        hf[k] = tf;
        hi[k] = ti;
        k = p;
      }
    };
    for (const [i, d] of starts) {
      seen[i] = S;
      g[i] = d;
      prev[i] = -1;
      push(i, d + Math.hypot(nx[i] - bx, nz[i] - bz));
    }
    let best = -1;
    let bestCost = Infinity;
    while (size) {
      // pop the least f
      const f = hf[0];
      const i = hi[0];
      size--;
      if (size) {
        hf[0] = hf[size];
        hi[0] = hi[size];
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < size && hf[l] < hf[m]) m = l;
          if (r < size && hf[r] < hf[m]) m = r;
          if (m === k) break;
          const tf = hf[m];
          const ti = hi[m];
          hf[m] = hf[k];
          hi[m] = hi[k];
          hf[k] = tf;
          hi[k] = ti;
          k = m;
        }
      }
      if (shut[i] === S) continue;
      if (f >= bestCost) break;
      shut[i] = S;
      if (goalS[i] === S && g[i] + goalD[i] < bestCost) {
        bestCost = g[i] + goalD[i];
        best = i;
      }
      const gi = g[i];
      for (let e = first[i]; e < first[i + 1]; e++) {
        const j = nbr[e];
        const gj = gi + len[e];
        if (shut[j] === S || (seen[j] === S && gj >= g[j])) continue;
        seen[j] = S;
        g[j] = gj;
        prev[j] = i;
        push(j, gj + Math.hypot(nx[j] - bx, nz[j] - bz));
      }
    }
    if (best < 0) return [];
    const chain = [];
    for (let i = best; i >= 0; i = prev[i]) chain.push(i);
    chain.reverse();
    // string pulling over [a, ...chain, b]: from each corner, go straight to the furthest point still in
    // clear view (a to b is known not clear, from above)
    const last = chain.length + 1;
    const at = (k) => (k === 0 ? a : k === last ? b : nodes[chain[k - 1]]);
    const see = (k, m) => {
      if (k > 0 && m < last) return clearNodes(chain[k - 1], chain[m - 1]);
      if (k === 0 && m === last) return false;
      return clear(at(k), at(m));
    };
    const out = [a];
    let i = 0;
    while (i < last) {
      let j = last;
      while (j > i + 1 && !see(i, j)) j--;
      const p = at(j);
      out.push({ x: p.x, z: p.z });
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
