// Voyage IV (SPEC4 §6.6, §13.1): src/walk.js's path graph, built through a spatial hash, against the brute force
// (plain Node, no browser):
// - the brute force is today's (eedb108) graph() and path() written out again here on walk.js's unchanged
//   public tests (inside, blocked, heightAt, snap): every node against every node for the dedupe, every pair
//   for the edges, near() over every node, A* with fresh arrays, string pulling without a memo
// - on today's town (tests/fixtures/sparrow-walk.json), on the v4 town (tests/fixtures/sparrow-walk-v4.json, once
//   1N has dumped it in Stage 1b), on Stage 0's v4-sized synthetic island (today's walk three times, 300 u
//   apart: [[0, 1], [300, 1], [600, 0.2]]) and on a connected plan island (today's town and §6.2's decks,
//   islets, Fisher's Pier and links, built here): the same nodes in the same order (bit for bit), the same
//   edges ([i, j], i < j, sorted), and path() the same points between every two places, from the spawn and
//   between seeded random points (on and off the walk); clear() the same answers as the step-by-step
//   test on seeded random segments; the small made-up towns of walk.test, a mirrored town and 30 seeded random
//   towns the same graphs and paths
// - the budgets (§6.6): the graph builds in <= 300 ms (cold: the first build in a fresh Node process, the best
//   of three, or of six on a busy machine) and
//   path() takes <= 20 ms between any two places (the worst pair asked in order on one walk, and the five
//   longest asked on fresh walks with nothing remembered) on the v4 town (the fixture when it exists, and the
//   synthetic islands until then), each printed beside Stage 0's baseline (today's walk.js) and the brute
//   force timed here
// - a path() asked again gives the same answer (the remembered clear() answers change nothing), and junk
//   never throws
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.env.WALK_ROOT || path.join(__dirname, '..');
const SRC = process.env.WALK_SRC || 'src/walk.js';
let failures = 0;
let passes = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}

// walk.js imports nothing, so it is loaded from its source as a data: URL (as walk.test.cjs does).
async function load(rel) {
  const src = fs.readFileSync(path.resolve(ROOT, rel), "utf8");
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ms = (v) => `${v.toFixed(1)} ms`;

// ---- the brute force: today's graph() and path(), on the walk's public tests ----
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const EPS = 1e-9;
function brute(W, data) {
  const R0 = W.radius;
  const areas = [];
  for (const a of Array.isArray(data.areas) ? data.areas : []) {
    if (!a) continue;
    if (a.kind === 'circle') areas.push({ kind: 'circle', x: num(a.x), z: num(a.z), r: Math.max(0, num(a.r)) });
    else {
      const ry = num(a.ry);
      areas.push({ kind: 'rect', x: num(a.x), z: num(a.z), hw: Math.max(0, num(a.w)) / 2, hd: Math.max(0, num(a.d)) / 2, c: Math.cos(ry), s: Math.sin(ry) });
    }
  }
  const links = [];
  for (const l of Array.isArray(data.links) ? data.links : []) {
    if (!l || !Array.isArray(l.pts) || l.pts.length < 2) continue;
    links.push({ pts: l.pts.map((p) => [num(p[0]), num(p[1]), num(p[2])]) });
  }
  const places = (Array.isArray(data.places) ? data.places : []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const spawn = data.spawn && Number.isFinite(data.spawn.x) ? { x: data.spawn.x, z: data.spawn.z } : null;
  const SUB = 0.1;
  const CLIMB = 0.35;
  let clears = 0;
  const clear = (a, b, r = R0) => {
    clears++;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / SUB));
    let y = W.heightAt(a.x, a.z);
    if (y === null) return false;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (!W.inside(x, z) || W.blocked(x, z, r)) return false;
      const ny = W.heightAt(x, z, y);
      if (ny === null || Math.abs(ny - y) > CLIMB) return false;
      y = ny;
    }
    return true;
  };
  const free = (x, z) => W.inside(x, z) && !W.blocked(x, z, R0);
  const snap = (x, z, maxDist = 3) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (free(x, z)) return { x, z };
    for (let rr = 0.05; rr <= maxDist + EPS; rr += 0.05) {
      const n = Math.max(12, Math.ceil((2 * Math.PI * rr) / 0.05));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI;
        const px = x + Math.cos(a) * rr;
        const pz = z + Math.sin(a) * rr;
        if (free(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  };
  let G = null;
  const graph = () => {
    if (G) return G;
    const t0 = performance.now();
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
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (d > 1.75 || !clear(nodes[i], nodes[j])) continue;
        edges.push([i, j]);
        adj[i].push([j, d]);
        adj[j].push([i, d]);
      }
    }
    G = { nodes, edges, adj, ms: performance.now() - t0 };
    return G;
  };
  const pathTo = (from, to) => {
    if (!from || !to) return [];
    const a = free(from.x, from.z) ? { x: from.x, z: from.z } : snap(from.x, from.z, 1);
    const b = snap(to.x, to.z, 3);
    if (!a || !b) return [];
    if (clear(a, b)) return [a, b];
    const { nodes, adj } = graph();
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
    const out = [a];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !clear(pts[i], pts[j])) j--;
      out.push({ x: pts[j].x, z: pts[j].z });
      i = j;
    }
    return out;
  };
  return { graph, path: pathTo, clear, snap, get clears() { return clears; } };
}

// ---- the islands ----
// Stage 0's v4-sized synthetic island (stage0-report (g), its walktime.mjs): today's walk twice and 20 % of its
// areas, links and places a third time, 300 u apart (so no edge joins two copies), every blocker copied: 1,179
// nodes and 6,156 edges
function stage0Synthetic(data) {
  const out = { radius: data.radius, areas: [], links: [], blockers: [], camBlockers: [], places: [], spawn: data.spawn };
  for (const [dx, part] of [[0, 1], [300, 1], [600, 0.2]]) {
    const take = (arr) => arr.slice(0, Math.ceil(arr.length * part));
    const mv = (o) => ({ ...o, x: o.x + dx, id: o.id === undefined ? o.id : o.id + '@' + dx });
    out.areas.push(...take(data.areas).map(mv));
    out.links.push(...take(data.links).map((l) => ({ ...l, id: l.id + '@' + dx, pts: l.pts.map((p) => [p[0] + dx, p[1], p[2]]) })));
    out.blockers.push(...data.blockers.map((b) => ({ ...b, x: b.x + dx })));
    out.places.push(...take(data.places).map((p) => ({ ...p, x: p.x + dx, id: p.id + '@' + dx })));
  }
  return out;
}

// A connected island of the v4 plan's shape: today's town, the seventeen shack platforms as sparrow.js places
// them (walk rects 0.3 inside their edges, each with a pad blocker of half its building's footprint at its centre
// in place of today's box round the shack, so a porch rings it, and a plot place on its porch), Sunset Beach and Lookout Hill (§6.2's profiles, two pads each),
// Fisher's Pier, and §6.2's 28 new and scenery links as straight bands (rope 0.25, board and steps 0.6) running
// 0.9 u into each deck, with posts beside their mouths. Not the real v4 walk (1N's fixture is): a stand-in of its
// size and reach for the budgets.
const PLATFORMS = [
  // id, x, z, w, d, ry, deck y (sparrow.js's platform() calls), its building's footprint w, d (SHACKS; PADS' limits)
  ['s2', 13.4, -23.2, 5.4, 5, 0.12, 1.3, 3.4, 3.0],
  ['s3', -0.5, -29.5, 6, 5.4, 0.05, 1.6, 4.2, 3.4],
  ['s4', -7.6, -33.6, 5.6, 5, -0.1, 1.5, 2.4, 3.0],
  ['s5', 9.2, -31.5, 6.4, 5.2, -0.05, 1.8, 4.4, 2.0],
  ['s6', -26.0, -26.0, 5.6, 5.2, 0.3, 1.3, 3.8, 3.2],
  ['s7', 21.5, -22.5, 5.4, 5, -0.25, 1.3, 3.6, 3.0],
  ['s8', -24, -9, 5.4, 5, 0.45, 1.3, 3.4, 3.0],
  ['s9', 25, -6, 5, 5, -0.5, 1.3, 3.0, 1.8],
  ['s10', -17.5, -38, 6, 5.5, 0.1, 1.6, 4.0, 3.5],
  ['s11', 18, -36, 6, 5.5, -0.2, 1.6, 4.0, 3.5],
  ['s12', 2, -40, 7, 5.5, 0, 1.6, 6.2, 2.3],
  ['s13', -21.5, 2.0, 5.4, 5, 0.55, 1.3, 3.6, 3.0],
  ['s14', -29, -4.5, 5.2, 5, 0.25, 1.3, 3.6, 3.0],
  ['s15', -31, -16, 5.6, 5.2, 0.1, 1.3, 4.0, 3.2],
  ['s16', -17.6, -17.4, 5.4, 5, -0.08, 1.3, 3.8, 3.0],
  ['s17', 29.5, -25, 6, 5.4, -0.35, 1.6, 4.0, 3.4],
  ['s18', 35, -12.5, 5.2, 5, -0.7, 1.3, 3.0, 3.2],
];
const PLAN_LINKS = [
  // §6.2: [from, to, kind, mouth on from, mouth on to] (today's four are in the town's walk already); a mouth is
  // a point in its deck's frame (the scenery bridges' ends as sparrow.js draws them; the tower raft's two by its
  // free strips); a link without mouths runs along the line between the decks' centres
  ['s1', 's2', 'rope', [3.5, 0.8], [-2.7, 1.0]], ['tavern', 's16', 'rope', [-5.9, 1.5], [2.7, 0.4]], ['yard', 's7', 'rope', [2.5, -4.5], [-1.2, 2.5]],
  ['tavern', 's3', 'rope', [2.15, -4.5], [-1.0, 2.7]], ['garden', 's13', 'rope', [-2.05, 2.75], [2.7, -1.1]], ['s13', 's14', 'rope', [-2.7, -0.8], [2.6, 1.2]],
  ['s7', 's17', 'rope', [2.7, 0.4], [-3.0, 0.9]],
  ['s8', 's14', 'rope'], ['tower', 's6', 'rope', [-2.0, 3.5], [2.8, 0]], ['s4', 's3', 'rope'], ['s2', 's7', 'rope'], ['yard', 's9', 'rope'],
  ['garden', 's8', 'board'], ['s14', 's15', 'board'], ['s15', 's16', 'board'], ['s15', 's6', 'board'], ['s10', 's4', 'board'], ['s3', 's12', 'board'],
  ['s12', 's5', 'board'], ['s5', 's11', 'board'], ['s10', 'tower', 'board', [0, 2.75], [3.5, -2.0]], ['s5', 's2', 'board'], ['s9', 's18', 'board'],
  ['s17', 's18', 'board'], ['s7', 's11', 'board'], ['s6', 'beach', 'board'], ['s15', 'beach', 'board'], ['s12', 'hill', 'steps'],
];
function planIsland(today, createWalk) {
  const data = JSON.parse(JSON.stringify(today));
  const deck = new Map(data.areas.map((a) => [a.id, a]));
  const pads = [];
  for (const [id, x, z, w, d, ry, y, bw, bd] of PLATFORMS) {
    const a = { id, kind: 'rect', x, z, w: w - 0.6, d: d - 0.6, ry, y };
    data.areas.push(a);
    deck.set(id, a);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    pads.push({ x, z, w: bw * 0.5, d: bd * 0.5, ry, h: 4 });
    const [qx, qz] = at(0, d / 2 - 0.8);
    data.places.push({ id: `plot:${id}`, name: id, x: qx, z: qz, r: 1.0 });
  }
  const beach = { id: 'beach', kind: 'circle', x: -37, z: -31, r: 6, y: 1.3, profile: [[0, 1.9], [3, 1.7], [6, 1.3]] };
  const hill = { id: 'hill', kind: 'circle', x: 2, z: -54, r: 9, y: 1.6, profile: [[0, 4.4], [2.5, 4.2], [6, 2.6], [9, 1.6]] };
  const pier = { id: 'fishersPier', kind: 'rect', x: 41.6, z: -13.5, w: 10.8, d: 1.6, ry: 0, y: 1.3 };
  for (const a of [beach, hill, pier]) {
    data.areas.push(a);
    deck.set(a.id, a);
  }
  pads.push({ x: -39.4, z: -33.6, w: 3.4, d: 3.4, ry: 0, h: 5 }, { x: -35.6, z: -27.4, w: 3.0, d: 2.6, ry: 0, h: 4 });
  pads.push({ x: 2, z: -54, w: 3.6, d: 3.6, ry: 0, h: 6 }, { x: 7.0, z: -54, w: 2.2, d: 3.2, ry: 0, h: 4 });
  data.places.push({ id: 'plot:beach', name: 'beach', x: -35.6, z: -32, r: 1.0 }, { id: 'plot:hill', name: 'hill', x: 2, z: -50.6, r: 1.0 });
  data.places.push({ id: 'pier-end', name: 'pier end', x: 46.5, z: -13.5, r: 1.0 }, { id: 'lookout', name: 'lookout', x: -15.98, z: -26.75, r: 1.0 });
  // (today's boxes round the shacks on those platforms make way for the pads)
  const onDeck = createWalk({ areas: data.areas.slice(today.areas.length) });
  data.blockers = data.blockers.filter((b) => !onDeck.inside(b.x, b.z));
  data.blockers.push(...pads);
  const surf = createWalk({ areas: data.areas });
  // where the line from a deck's centre towards a point leaves the deck, then `back` u inside it
  const exitPt = (a, tx, tz, back) => {
    const L = Math.hypot(tx - a.x, tz - a.z);
    const ux = (tx - a.x) / L;
    const uz = (tz - a.z) / L;
    let t;
    if (a.kind === 'circle') t = a.r;
    else {
      const c = Math.cos(a.ry || 0);
      const s = Math.sin(a.ry || 0);
      const lx = ux * c - uz * s;
      const lz = ux * s + uz * c;
      t = Math.min(Math.abs(lx) > 1e-9 ? a.w / 2 / Math.abs(lx) : Infinity, Math.abs(lz) > 1e-9 ? a.d / 2 / Math.abs(lz) : Infinity);
    }
    t = Math.max(0, t - back);
    return [a.x + ux * t, a.z + uz * t];
  };
  const local = (a, [lx, lz]) => {
    const c = Math.cos(a.ry || 0);
    const s = Math.sin(a.ry || 0);
    return [a.x + lx * c + lz * s, a.z - lx * s + lz * c];
  };
  for (const [from, to, kind, ma, mb] of PLAN_LINKS) {
    const A = deck.get(from);
    const B = deck.get(to);
    // the two mouths, then 0.9 u on into each deck
    const [ex, ez] = ma ? local(A, ma) : exitPt(A, B.x, B.z, 0);
    const [fx, fz] = mb ? local(B, mb) : exitPt(B, A.x, A.z, 0);
    const L = Math.hypot(fx - ex, fz - ez);
    const ux = (fx - ex) / L;
    const uz = (fz - ez) / L;
    const [ax, az] = [ex - ux * 0.9, ez - uz * 0.9];
    const [bx, bz] = [fx + ux * 0.9, fz + uz * 0.9];
    const ya = surf.heightAt(ax, az) ?? A.y;
    const yb = surf.heightAt(bx, bz) ?? B.y;
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.6));
    const pts = [];
    for (let k = 0; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, ya + ((yb - ya) * k) / n, az + ((bz - az) * k) / n]);
    const hw = kind === 'rope' ? 0.25 : 0.6;
    data.links.push({ id: `${from}-${to}`, pts, hw, kind });
    // posts beside both mouths, just outside the band
    for (const [px, pz] of [[ex, ez], [fx, fz]]) for (const sg of [1, -1]) data.blockers.push({ x: px - uz * sg * (hw + 0.45), z: pz + ux * sg * (hw + 0.45), r: 0.1, h: 1.2 });
  }
  return data;
}

// The small made-up towns of walk.test.cjs (an L of two rects with a post, a turned rect, a mound, a sagging
// bridge, two islands), a junk one and a mirrored one
const SMALL = {
  L: { areas: [{ id: 'a', kind: 'rect', x: 0, z: 0, w: 10, d: 2, ry: 0, y: 1 }, { id: 'b', kind: 'rect', x: 4, z: 4, w: 2, d: 10, ry: 0, y: 1 }], blockers: [{ x: 4, z: 0, r: 0.3, h: 1 }] },
  turned: { areas: [{ id: 'r', kind: 'rect', x: 10, z: -5, w: 4, d: 2, ry: Math.PI / 4, y: 2 }] },
  mound: { areas: [{ id: 'm', kind: 'circle', x: 0, z: 0, r: 3, y: 1.4, profile: [[0, 1.6], [2, 1.5], [3, 1.3]] }] },
  bridge: {
    areas: [{ id: 'w', kind: 'rect', x: -2, z: 0, w: 4, d: 4, ry: 0, y: 1 }, { id: 'e', kind: 'rect', x: 12, z: 0, w: 4, d: 4, ry: 0, y: 1.2 }],
    links: [{ id: 'br', hw: 0.3, pts: [[0, 1, 0], [2, 0.9, 0], [5, 0.8, 0.3], [8, 0.9, 0], [10, 1.2, 0]] }],
    blockers: [{ x: 0, z: 0.7, r: 0.12, h: 1 }, { x: 0, z: -0.7, r: 0.12, h: 1 }],
  },
  islands: { areas: [{ id: 'a', kind: 'rect', x: 0, z: 0, w: 3, d: 3, ry: 0, y: 1 }, { id: 'b', kind: 'rect', x: 10, z: 0, w: 3, d: 3, ry: 0, y: 1 }] },
  junk: { areas: [null, 7, { kind: 'circle' }, { kind: 'rect', w: 'x' }], links: [{ pts: [[1, 2, 3]] }, { pts: 'no' }, null], blockers: [null, { x: 1 }], places: [{ x: NaN }], spawn: 'here' },
  // a town mirrored about x = 0 (its right half first): from a start on the mirror line, nodes in different
  // cells lie at exactly the same distance, and which of them path() hooks on first changes the path
  mirror: {
    radius: 0.3,
    areas: [{ id: 'r0', kind: 'rect', x: 2.5, z: -1, w: 3, d: 2, ry: 0, y: 1 }, { id: 'l0', kind: 'rect', x: -2.5, z: -1, w: 3, d: 2, ry: 0, y: 1 }, { id: 'mid', kind: 'rect', x: 0, z: 1, w: 4, d: 2.5, ry: 0, y: 1 }],
    blockers: [{ x: 0.5, z: -1, r: 0.1 * 3 }, { x: -0.5, z: -1, r: 0.1 * 3 }, { x: 1, z: -4, r: 0.5 }, { x: -1, z: -4, r: 0.5 }, { x: 1, z: -2, r: 0.2 }, { x: -1, z: -2, r: 0.2 }],
    places: [],
    probe: [[{ x: 0, z: 0.25 }, { x: 3, z: -2.25 }]],
  },
};

// A seeded random town: 2-7 rects (some turned) and circles (some mounds), sagging links between them, posts
// and boxes, places, and now and then another walker radius
const RANDOM_TOWNS = 30;
function randomTown(seed) {
  const R = mulberry32(seed);
  const n = 2 + Math.floor(R() * 6);
  const areas = [];
  for (let k = 0; k < n; k++) {
    const x = R() * 30 - 15;
    const z = R() * 30 - 15;
    const y = 1 + Math.round(R() * 6) * 0.1;
    if (R() < 0.3) areas.push({ id: 'c' + k, kind: 'circle', x, z, r: 1 + R() * 5, y, ...(R() < 0.5 ? { profile: [[0, y + 0.6], [2, y + 0.3], [5, y]] } : {}) });
    else areas.push({ id: 'r' + k, kind: 'rect', x, z, w: 1 + R() * 12, d: 1 + R() * 9, ry: R() < 0.4 ? 0 : R() * Math.PI, y });
  }
  const links = [];
  for (let k = 0; k + 1 < n; k++) {
    if (R() < 0.25) continue;
    const A = areas[k];
    const B = areas[k + 1];
    const m = 2 + Math.floor(R() * 4);
    const pts = [];
    for (let q = 0; q <= m; q++) {
      const t = q / m;
      pts.push([A.x + (B.x - A.x) * t + (q && q < m ? (R() - 0.5) * 2 : 0), A.y + (B.y - A.y) * t - (q && q < m ? R() * 0.2 : 0), A.z + (B.z - A.z) * t]);
    }
    links.push({ id: 'l' + k, pts, hw: R() < 0.5 ? 0.25 : 0.6 });
  }
  const blockers = [];
  const nb = Math.floor(R() * 25);
  for (let k = 0; k < nb; k++) {
    const A = areas[Math.floor(R() * n)];
    const x = A.x + (R() * 2 - 1) * 5;
    const z = A.z + (R() * 2 - 1) * 5;
    if (R() < 0.6) blockers.push({ x, z, r: 0.05 + R() * 0.8, h: 1 });
    else blockers.push({ x, z, w: 0.2 + R() * 3, d: 0.2 + R() * 3, ry: R() * Math.PI, h: 2 });
  }
  const places = [];
  for (let k = 0; k < 4 + Math.floor(R() * 3); k++) {
    const A = areas[Math.floor(R() * n)];
    places.push({ id: 'p' + k, name: 'p' + k, x: A.x + (R() * 2 - 1) * 3, z: A.z + (R() * 2 - 1) * 3, r: 1 + R() });
  }
  return { radius: R() < 0.8 ? 0.3 : 0.1 + R() * 0.6, areas, links, blockers, places, spawn: { x: areas[0].x, z: areas[0].z, h: 0 } };
}

const sameGraph = (G, B) => {
  if (G.nodes.length !== B.nodes.length) return `${G.nodes.length} nodes, the brute force ${B.nodes.length}`;
  for (let i = 0; i < B.nodes.length; i++) {
    if (!Object.is(G.nodes[i].x, B.nodes[i].x) || !Object.is(G.nodes[i].z, B.nodes[i].z)) return `node ${i} at ${G.nodes[i].x},${G.nodes[i].z}, the brute force's at ${B.nodes[i].x},${B.nodes[i].z}`;
  }
  if (G.edges.length !== B.edges.length) return `${G.edges.length} edges, the brute force ${B.edges.length}`;
  for (let k = 0; k < B.edges.length; k++) {
    if (G.edges[k][0] !== B.edges[k][0] || G.edges[k][1] !== B.edges[k][1]) return `edge ${k} is [${G.edges[k]}], the brute force's [${B.edges[k]}]`;
  }
  return '';
};
const sortedEdges = (E) => E.every(([i, j], k) => i < j && (k === 0 || E[k - 1][0] < i || (E[k - 1][0] === i && E[k - 1][1] < j)));
const samePts = (p, q) => p.length === q.length && p.every((v, k) => Object.is(v.x, q[k].x) && Object.is(v.z, q[k].z));

// the first graph build of a fresh Node process: three processes (three more when none was within the budget,
// so a busy machine's hiccup is not the walk's), the wall time and the process's CPU time of each
function coldGraphMs(dataFile) {
  const script = `
    const fs = require('fs');
    const src = fs.readFileSync(${JSON.stringify(path.resolve(ROOT, SRC))}, 'utf8');
    import('data:text/javascript;base64,' + Buffer.from(src).toString('base64')).then(({ createWalk }) => {
      const data = JSON.parse(fs.readFileSync(${JSON.stringify(dataFile)}, 'utf8'));
      const W = createWalk(data);
      const c0 = process.cpuUsage();
      const t0 = performance.now();
      const G = W.graph;
      const ms = performance.now() - t0;
      const c = process.cpuUsage(c0);
      console.log(JSON.stringify({ ms, cpu: (c.user + c.system) / 1000, nodes: G.nodes.length, edges: G.edges.length }));
    });`;
  const runs = [];
  const cpu = [];
  for (let k = 0; k < 6 && (k < 3 || Math.min(...runs) > 300); k++) {
    const r = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
    runs.push(r.ms);
    cpu.push(r.cpu);
  }
  const sorted = [...runs].sort((p, q) => p - q);
  return { best: sorted[0], median: sorted[sorted.length >> 1], all: runs, cpu };
}

module.exports = { brute, stage0Synthetic, planIsland, randomTown, SMALL, sameGraph, samePts };
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

async function main() {
  const { createWalk } = await load(SRC);
  const fixture = (name) => {
    const f = path.join(ROOT, 'tests', 'fixtures', name);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  };
  const today = fixture('sparrow-walk.json');
  const v4 = fixture('sparrow-walk-v4.json');
  const towns = [
    ['today\'s town (sparrow-walk.json)', today],
    ...(v4 ? [['the v4 town (sparrow-walk-v4.json)', v4]] : []),
    ["Stage 0's synthetic island (2.48x today)", stage0Synthetic(today)],
    ['the connected plan island', planIsland(today, createWalk)],
  ];
  if (!v4) console.log('NOTE  tests/fixtures/sparrow-walk-v4.json is not there yet (1N dumps it in Stage 1b): the v4 checks run on the two synthetic islands');
  const timed = {};

  // ---- the same graph and the same paths as the brute force ----
  for (const [name, data] of towns) {
    const W = createWalk(data);
    const B = brute(createWalk(data), data);
    const t0 = performance.now();
    const G = W.graph;
    const fast = performance.now() - t0;
    const BG = B.graph();
    const why = sameGraph(G, BG);
    check(why === '' && sortedEdges(G.edges), `${name}: the same ${G.nodes.length} nodes (in order, bit for bit) and ${G.edges.length} edges ([i, j], i < j, sorted) as the brute force${why ? ': ' + why : ''} (built in ${ms(fast)}, the brute force ${ms(BG.ms)}, both warm)`);
    // every two places, the spawn to each place, and seeded random points (half of them off the walk)
    const ends = [...data.places.map((p) => ({ x: p.x, z: p.z, id: p.id })), ...(data.spawn ? [{ x: data.spawn.x, z: data.spawn.z, id: 'spawn' }] : [])];
    const pairs = [];
    for (const a of ends) for (const b of ends) if (a !== b) pairs.push([a, b]);
    const rnd = mulberry32(0x6e6a + data.areas.length);
    // (a seeded node with up to 4 u either way: on the walk, by its edges, in the water just off it)
    const pick = () => {
      const n = G.nodes[Math.floor(rnd() * G.nodes.length)];
      return { x: n.x + (rnd() * 2 - 1) * 4, z: n.z + (rnd() * 2 - 1) * 4 };
    };
    for (let k = 0; k < 150; k++) pairs.push([pick(), pick()]);
    // (and from node to node exactly, where A*'s ties are likeliest)
    const node = () => ({ ...G.nodes[Math.floor(rnd() * G.nodes.length)] });
    for (let k = 0; k < 100; k++) pairs.push([node(), node()]);
    let diff = null;
    let found = 0;
    for (const [a, b] of pairs) {
      const p = W.path(a, b);
      const q = B.path(a, b);
      if (p.length) found++;
      if (!samePts(p, q) && !diff) diff = `${a.id || `${a.x.toFixed(2)},${a.z.toFixed(2)}`} → ${b.id || `${b.x.toFixed(2)},${b.z.toFixed(2)}`}: ${p.length} points, the brute force ${q.length}`;
    }
    check(diff === null, `${name}: path() gives the brute force's points exactly on all ${pairs.length} paths (${found} found: every two places, the spawn, 150 seeded random pairs, 100 from node to node)${diff ? ': ' + diff : ''}`);
    // asked again (with the remembered clear() answers), every path is the same
    let again = null;
    for (const [a, b] of pairs.slice(0, 60)) if (!samePts(W.path(a, b), B.path(a, b)) && !again) again = `${a.id || 'a point'} → ${b.id || 'a point'}`;
    check(again === null, `${name}: the same paths asked again${again ? ': ' + again : ''}`);
    // clear() against the step-by-step test on seeded segments (short and long, on and off the walk)
    let cdiff = null;
    let yes = 0;
    for (let k = 0; k < 3000; k++) {
      const a = k % 3 ? G.nodes[Math.floor(rnd() * G.nodes.length)] : pick();
      const L = k % 2 ? 0.5 + rnd() * 2 : 2 + rnd() * 25;
      const t = rnd() * 2 * Math.PI;
      const b = { x: a.x + Math.cos(t) * L, z: a.z + Math.sin(t) * L };
      const r = k % 5 === 0 ? 0.45 : undefined;
      const u = W.clear(a, b, r);
      if (u) yes++;
      if (u !== B.clear(a, b, r) && !cdiff) cdiff = `${a.x.toFixed(2)},${a.z.toFixed(2)} → ${b.x.toFixed(2)},${b.z.toFixed(2)}`;
    }
    check(cdiff === null, `${name}: clear() answers as the step-by-step test on 3,000 seeded segments (${yes} clear)${cdiff ? ': not at ' + cdiff : ''}`);
    timed[name] = { data, nodes: G.nodes.length, edges: G.edges.length, bruteMs: BG.ms };
  }
  {
    let bad = [];
    for (const [id, data] of Object.entries(SMALL)) {
      const W = createWalk(data);
      const B = brute(createWalk(data), data);
      const why = sameGraph(W.graph, B.graph());
      if (why) bad.push(`${id}: ${why}`);
      for (const [a, b] of data.probe || []) if (!samePts(W.path(a, b), B.path(a, b))) bad.push(`${id}: the path ${a.x},${a.z} → ${b.x},${b.z}`);
      const R = mulberry32(7);
      for (let k = 0; k < 40; k++) {
        const a = { x: -6 + R() * 22, z: -6 + R() * 16 };
        const b = { x: -6 + R() * 22, z: -6 + R() * 16 };
        if (!samePts(W.path(a, b), B.path(a, b))) {
          bad.push(`${id}: a path`);
          break;
        }
      }
    }
    check(bad.length === 0, `the small towns (an L with a post, a turned rect, a mound, a sagging bridge, two islands, junk, a mirrored town with equal distances): the brute force's graphs and paths${bad.length ? ': ' + bad.join('; ') : ''}`);
  }
  {
    // seeded random towns (turned rects, mounds, sagging links, posts and boxes, other radii): the graph, and
    // the paths between every two places and between seeded points (on nodes, by them, anywhere), asked twice
    const bad = [];
    let nodes = 0;
    let paths = 0;
    for (let seed = 1; seed <= RANDOM_TOWNS; seed++) {
      const data = randomTown(seed);
      const W = createWalk(data);
      const B = brute(createWalk(data), data);
      const G = W.graph;
      const why = sameGraph(G, B.graph());
      if (why) bad.push(`town ${seed}: ${why}`);
      nodes += G.nodes.length;
      const R = mulberry32(seed * 31 + 5);
      const pt = (k) => {
        const n = G.nodes.length ? G.nodes[Math.floor(R() * G.nodes.length)] : { x: 0, z: 0 };
        return k % 3 === 0 ? { x: n.x, z: n.z } : k % 3 === 1 ? { x: n.x + (R() * 2 - 1) * 3, z: n.z + (R() * 2 - 1) * 3 } : { x: (R() * 2 - 1) * 22, z: (R() * 2 - 1) * 22 };
      };
      const pairs = [];
      for (const a of data.places) for (const b of data.places) if (a !== b) pairs.push([a, b]);
      for (let k = 0; k < 60; k++) pairs.push([pt(k), pt(k + 1)]);
      for (let round = 0; round < 2; round++) {
        for (const [a, b] of pairs) {
          paths++;
          if (!samePts(W.path(a, b), B.path(a, b))) {
            bad.push(`town ${seed}: ${round ? 'asked again, ' : ''}the path ${a.x.toFixed(2)},${a.z.toFixed(2)} → ${b.x.toFixed(2)},${b.z.toFixed(2)}`);
            break;
          }
        }
      }
    }
    check(bad.length === 0, `${RANDOM_TOWNS} seeded random towns (${nodes} nodes): the brute force's graphs and all ${paths} paths${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
  }

  // ---- the budgets (§6.6) ----
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'walkgraph-'));
  try {
    for (const [name, data] of towns) {
      const t = timed[name];
      const file = path.join(tmp, 'walk.json');
      fs.writeFileSync(file, JSON.stringify(data));
      const cold = coldGraphMs(file);
      // the worst place-to-place path: (a) every pair once, in order, on one walk whose graph is built first (as
      // in the game, where a walk keeps its answers from tap to tap; a pair over the budget is timed again on
      // fresh walks, best of three, so a busy machine's hiccup is not the walk's); (b) the five longest of those
      // paths again, each on a fresh walk with nothing remembered (its graph built first), best of three
      const W = createWalk(data);
      void W.graph;
      const P = data.places;
      const onFresh = (a, b) => {
        let best = Infinity;
        for (let k = 0; k < 3; k++) {
          const W2 = createWalk(data);
          void W2.graph;
          const t1 = performance.now();
          W2.path(a, b);
          best = Math.min(best, performance.now() - t1);
        }
        return best;
      };
      let worst = { ms: 0 };
      let sum = 0;
      let n = 0;
      const long = [];
      for (const a of P) {
        for (const b of P) {
          if (a === b) continue;
          const t0 = performance.now();
          const pts = W.path(a, b);
          let dt = performance.now() - t0;
          if (dt > 20) dt = Math.min(dt, onFresh(a, b));
          sum += dt;
          n++;
          if (dt > worst.ms) worst = { ms: dt, from: a.id, to: b.id };
          let L = 0;
          for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
          long.push({ a, b, L });
        }
      }
      long.sort((p, q) => q.L - p.L);
      let fresh = { ms: 0 };
      for (const { a, b, L } of long.slice(0, 5)) {
        const dt = onFresh(a, b);
        if (dt > fresh.ms) fresh = { ms: dt, from: a.id, to: b.id, L };
      }
      const isV4 = !name.startsWith("today's");
      const base = name.startsWith("today's") ? "Stage 0's baseline (today's walk.js): cold 55.7–62.8 ms, worst path 2.7 ms" : name.startsWith("Stage 0's") ? "Stage 0's baseline (today's walk.js): cold 108.7–137.0 ms, worst path 2.6 ms" : 'no Stage 0 baseline';
      const line = `${name}: ${t.nodes} nodes, ${t.edges} edges; graph cold ${ms(cold.best)} (${cold.all.map((v) => v.toFixed(1)).join(' / ')}; CPU ${cold.cpu.map((v) => v.toFixed(0)).join(' / ')}), the brute force here ${ms(t.bruteMs)} warm; worst path ${ms(worst.ms)} (${worst.from} → ${worst.to}), mean ${ms(sum / Math.max(1, n))} over ${n} pairs, the longest with nothing remembered ${ms(fresh.ms)} (${fresh.from} → ${fresh.to}, ${(fresh.L || 0).toFixed(0)} u) [${base}]`;
      if (isV4) check(cold.best <= 300 && worst.ms <= 20 && fresh.ms <= 20, `budgets (graph <= 300 ms, path <= 20 ms) on ${line}`);
      else console.log(`TIME  ${line}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ---- junk ----
  {
    let threw = null;
    try {
      const J = createWalk(SMALL.junk);
      void J.graph;
      J.path({ x: 0, z: 0 }, { x: 1, z: 1 });
      J.path({ x: NaN, z: 0 }, { x: Infinity, z: 1 });
      J.clear({ x: 0, z: 0 }, { x: NaN, z: 1 });
      const W = createWalk(today);
      W.path({ x: 1e300, z: -1e300 }, { x: 0.6, z: -4.2 });
      W.path({ x: 0.6, z: -4.2 }, { x: 'a', z: null });
      W.clear({ x: 0.6, z: -4.2 }, { x: Infinity, z: 0 });
      createWalk({ areas: [{ id: 'far', kind: 'rect', x: 1e12, z: -1e12, w: 3, d: 3, ry: 0, y: 1 }], places: [{ id: 'p', x: 1e12, z: -1e12 }] }).graph;
    } catch (e) {
      threw = e.message;
    }
    check(threw === null, `junk data and junk arguments never throw${threw ? ' (' + threw + ')' : ''}`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll walk graph checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
}
