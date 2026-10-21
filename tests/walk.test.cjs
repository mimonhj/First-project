// Unit checks for the town's walking rules in src/walk.js (plain Node, no browser):
// - on the real town (tests/fixtures/sparrow-walk.json, dumped from the live env.walk of
//   src/env/sparrow.js by a harness): the spawn and every place stand on the walk, clear of every
//   obstacle; every place can be reached from the spawn and from every other place along a path
//   that stays on the walk and clear of the obstacles all the way; 10,000 seeded random steps (some
//   of them with townsfolk in the way) never leave the walk, never walk into anything and never rise
//   or drop more than a step; taps on the decks and bridges land, taps on the water miss; the
//   camera-only volumes (the signs' boards on their posts and the like) are there, clear of the
//   camera's target wherever the captain stops, and ignored by the walking; the rope bridges have no lip at
//   their posts, and a jog held from each land end, straight or a little off the line, gets across
// - the Kraken Seas (SPEC3 §7.1, §8; the fixture is dumped with the build ctx's kraken on): the two new places,
//   Professor Barnacle's Riddle Bell and Builder Bess, reachable from the spawn and from each other; no new
//   walkable area or bridge, no plot walkable, every plot's tallest building a camera-only box from tier 0;
//   Bess and the professor clear of every walker's path and villager's loop (1 u), of the bridge mouths and the
//   doorways (2 u) and of the other places, leaving no passage narrower than 1.6 u of deck; the villagers' loops
//   on the walk, clear of everything, at most two on any bridge
// - small made-up towns: an L of two rects, a turned rect, a round mound, a sagging bridge (its
//   height followed along the planks), two islands (no path between them)
// - junk data and junk arguments never throw
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let passes = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}

// The game's modules are browser ES modules in a package without "type": "module". walk.js imports
// nothing, so it is loaded from its source as a data: URL (like tests/upgrades.test.cjs does).
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
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

const R = 0.3; // the captain's radius
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));

// A path is good when it starts at `from`, ends at `to` (or where `to` snapped), and every point every
// 0.25 along it (the corners too) is on the walk and clear of the obstacles.
function pathProblems(W, p, from, to) {
  const out = [];
  if (!Array.isArray(p) || p.length < 2) return ['no path'];
  if (Math.hypot(p[0].x - from.x, p[0].z - from.z) > 1.0) out.push(`starts ${f2(Math.hypot(p[0].x - from.x, p[0].z - from.z))} from the start`);
  const end = p[p.length - 1];
  if (Math.hypot(end.x - to.x, end.z - to.z) > 3.0) out.push(`ends ${f2(Math.hypot(end.x - to.x, end.z - to.z))} from the goal`);
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i];
    const b = p[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / 0.25));
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const z = a.z + ((b.z - a.z) * k) / n;
      if (!W.inside(x, z)) out.push(`off the walk at ${f2(x)},${f2(z)}`);
      else if (W.blocked(x, z, R)) out.push(`into an obstacle at ${f2(x)},${f2(z)}`);
      if (out.length > 3) return out;
    }
  }
  return out;
}

(async () => {
  const { createWalk } = await load(process.env.WALK_SRC || 'src/walk.js');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sparrow-walk.json'), 'utf8'));

  // ---- the fixture is the town's walk data, plain JSON ----
  {
    const ids = data.areas.map((a) => a.id);
    const want = ['pier', 'plaza', 'tavern', 'tower', 'yard', 's1', 'garden'];
    check(want.every((id) => ids.includes(id)), `the walkable decks are all there: ${want.join(', ')} (areas: ${ids.join(', ')})`);
    const links = data.links.map((l) => l.id);
    check(['plazaS1', 'plazaYard', 'plazaGarden', 'tavernTower'].every((id) => links.includes(id)), `the rope bridges onto them: ${links.join(', ')}`);
    check(ids.filter((id) => id.includes('-')).length >= 3, `the gaps between decks are crossed by portals (${ids.filter((id) => id.includes('-')).join(', ')})`);
    const places = data.places.map((p) => p.id);
    check(JSON.stringify(places) === JSON.stringify(['ship', 'shipyard', 'tailor', 'tavern', 'quiz', 'builder']), `the places, in order: ${places.join(', ')}`);
    const tailor = data.places.find((p) => p.id === 'tailor');
    check(!!tailor && tailor.name === "Polly's Plumes & Trims" && tailor.podium && Number.isFinite(tailor.podium.y) && Array.isArray(tailor.lineup) && tailor.lineup.length === 3 && tailor.cam && tailor.cam.pos.length === 3 && tailor.cam.target.length === 3, "Polly's has its podium, a line-up of three and a fitting camera");
    const tavern = data.places.find((p) => p.id === 'tavern');
    check(!!tavern && tavern.name === 'The Salty Sparrow' && tavern.cam && tavern.cam.pos.length === 3, 'The Salty Sparrow has its porch camera');
    check(data.places.every((p) => Number.isFinite(p.r) && p.r > 0 && Number.isFinite(p.face)), 'every place has a reach and a facing');
    check(!!data.spawn && Math.abs(Math.abs(data.spawn.h) - Math.PI) < 0.3, `the spawn faces the town (h ${f2(data.spawn && data.spawn.h)})`);
    check(data.blockers.length >= 60 && data.blockers.every((b) => Number.isFinite(b.h) && (Number.isFinite(b.r) || (Number.isFinite(b.w) && Number.isFinite(b.d)))), `${data.blockers.length} obstacles, each round or a box, each with a height for the camera`);
    check(JSON.stringify(JSON.parse(JSON.stringify(data))) === JSON.stringify(data), 'the data survives a JSON round trip unchanged');
  }

  // ---- the camera-only volumes (walk.camBlockers: town.js keeps the walk camera out of them) ----
  {
    const cb = Array.isArray(data.camBlockers) ? data.camBlockers : [];
    const fin = (...v) => v.every(Number.isFinite);
    const good = cb.every((b) => fin(b.x, b.z, b.y0, b.y1) && b.y1 > b.y0 && (b.r !== undefined ? fin(b.r) && b.r > 0 : fin(b.w, b.d, b.ry) && b.w > 0 && b.d > 0));
    check(cb.length >= 8 && good, `${cb.length} camera-only volumes, each an upright box or cylinder with a bottom and a top`);
    // is the point (x, y, z) inside one of them (pad: how far the lens keeps off)?
    const inCam = (x, y, z, pad = 0) =>
      cb.some((b) => {
        if (y < b.y0 - pad || y > b.y1 + pad) return false;
        const dx = x - b.x;
        const dz = z - b.z;
        if (b.r !== undefined) return Math.hypot(dx, dz) < b.r + pad;
        const c = Math.cos(b.ry);
        const sn = Math.sin(b.ry);
        return Math.abs(dx * c - dz * sn) < b.w / 2 + pad && Math.abs(dx * sn + dz * c) < b.d / 2 + pad;
      });
    // the boards up on posts that the walk's blockers can't describe (the captain walks under or round them)
    const posts = (x, z, h) => data.blockers.filter((b) => b.r !== undefined && Math.hypot(b.x - x, b.z - z) < 0.2 && b.h >= h);
    check(posts(4.2, -13.7, 3.4).length === 1 && inCam(5.0, 1.3 + 3.02, -13.7) && inCam(5.9, 1.3 + 3.02, -13.72), "the TAILOR arrow board on its post by the pots stall");
    const ws = data.blockers.filter((b) => b.r !== undefined && b.h >= 6);
    const mid = ws.length >= 2 ? { x: (ws[0].x + ws[1].x) / 2, z: (ws[0].z + ws[1].z) / 2 } : { x: NaN, z: NaN };
    check(ws.length === 2 && inCam(mid.x, 1.3 + 5.2, mid.z) && inCam(mid.x, 1.3 + 6.3, mid.z) && !inCam(mid.x, 1.3 + 2.4, mid.z, 0.3), `the welcome sign's board between its two tall posts (${f2(mid.x)}, ${f2(mid.z)}), high over the captain's head`);
    // nowhere the captain stands still is the camera's target (his chest) inside one of them
    const ends = [{ id: 'spawn', ...data.spawn }, ...data.places];
    const W0 = createWalk(data);
    const bad = ends.filter((e) => inCam(e.x, W0.heightAt(e.x, e.z) + 1.2, e.z, 0.3)).map((e) => e.id);
    check(bad.length === 0, `the camera's target over the spawn and every place is clear of them${bad.length ? ': ' + bad.join(', ') : ''}`);
    // walking ignores them: the same paths with or without
    const W1 = createWalk({ ...data, camBlockers: undefined });
    const same = data.places.every((p) => JSON.stringify(W0.path(data.spawn, p)) === JSON.stringify(W1.path(data.spawn, p)));
    check(same, 'walking ignores them (the spawn-to-place paths are the same without them)');
  }

  const W = createWalk(data);
  // ---- spawn and places ----
  {
    const s = data.spawn;
    check(W.inside(s.x, s.z) && !W.blocked(s.x, s.z, R), `the spawn (${f2(s.x)}, ${f2(s.z)}) is on the walk and clear`);
    for (const p of data.places) {
      check(W.inside(p.x, p.z) && !W.blocked(p.x, p.z, R), `${p.name} (${f2(p.x)}, ${f2(p.z)}) is on the walk and clear`);
      const np = W.nearestPlace(p.x, p.z);
      check(!!np && np.place.id === p.id && np.dist < 1e-9, `nearestPlace at ${p.id} finds ${np && np.place.id}`);
    }
    check(W.nearestPlace(60, 60) === null, 'nearestPlace out at sea: none');
    check(Math.abs(W.heightAt(s.x, s.z) - 1.3) < 0.01, `the spawn stands at deck height (${f2(W.heightAt(s.x, s.z))})`);
  }

  // ---- reachability: the spawn to every place, and every place to every other ----
  {
    const ends = [{ id: 'spawn', x: data.spawn.x, z: data.spawn.z }, ...data.places];
    let worstMs = 0;
    for (const a of ends) {
      for (const b of ends) {
        if (a === b) continue;
        const t0 = process.hrtime.bigint();
        const p = W.path(a, b);
        worstMs = Math.max(worstMs, Number(process.hrtime.bigint() - t0) / 1e6);
        const bad = pathProblems(W, p, a, b);
        if (a.id === 'spawn' || bad.length) check(bad.length === 0, `path ${a.id} -> ${b.id}: ${p.length} points${bad.length ? ' -> ' + bad.join('; ') : ', on the walk and clear every 0.25'}`);
      }
    }
    check(true, `all ${ends.length * (ends.length - 1)} place-to-place paths checked (slowest ${worstMs.toFixed(0)} ms, graph built once)`);
    // every walkable deck and bridge can be reached from the spawn too
    for (const a of data.areas.filter((q) => !q.id.includes('-'))) {
      const goal = W.snap(a.x, a.z, 4);
      const p = goal ? W.path(data.spawn, goal) : [];
      const bad = goal ? pathProblems(W, p, data.spawn, goal) : ['no free spot near its middle'];
      check(bad.length === 0, `deck ${a.id} reached from the spawn (${p.length} points)${bad.length ? ': ' + bad.join('; ') : ''}`);
    }
    for (const l of data.links) {
      const m = l.pts[Math.floor(l.pts.length / 2)];
      const p = W.path(data.spawn, { x: m[0], z: m[2] });
      const bad = pathProblems(W, p, data.spawn, { x: m[0], z: m[2] });
      check(bad.length === 0, `the middle of bridge ${l.id} reached from the spawn${bad.length ? ': ' + bad.join('; ') : ''}`);
    }
    const G = W.graph;
    check(G.nodes.length > 50 && G.edges.length > G.nodes.length && G.edges.every(([i, j]) => i !== j && G.nodes[i] && G.nodes[j]), `the walk graph: ${G.nodes.length} nodes, ${G.edges.length} edges`);
  }

  // ---- the rope bridges: no lip at the posts, and a walker heading a little off the line still gets across ----
  {
    const lips = [];
    for (const l of data.links) {
      // every 0.05 along the bridge, just inside either edge of its band: free (the posts at its ends included)
      for (let i = 0; i + 1 < l.pts.length; i++) {
        const [ax, , az] = l.pts[i];
        const [bx, , bz] = l.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / L;
        const nz = (bx - ax) / L;
        for (let s = 0; s <= L; s += 0.05) {
          for (const side of [-1, 1]) {
            const x = ax + ((bx - ax) * s) / L + nx * side * (l.hw - 0.01);
            const z = az + ((bz - az) * s) / L + nz * side * (l.hw - 0.01);
            if (W.inside(x, z) && W.blocked(x, z, R)) lips.push(`${l.id}@${f2(x)},${f2(z)}`);
          }
        }
      }
    }
    check(lips.length === 0, `the rope bridges' bands are free right up to their edges, past the posts too (no lip a walker sliding along a rope stops at)${lips.length ? ': ' + lips.slice(0, 4).join(' ') : ''}`);
    // from each land end, a jog held in a fixed direction straight along the bridge, or 5° or 15° off it into a rope
    const runs = [];
    for (const l of data.links) {
      for (const dir of [1, -1]) {
        const pts = dir === 1 ? l.pts : [...l.pts].reverse();
        const a = pts[0];
        const b = pts[pts.length - 1];
        const Lb = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const ux = (b[0] - a[0]) / Lb;
        const uz = (b[2] - a[2]) / Lb;
        for (const deg of [0, 5, -5, 15, -15]) {
          const h = Math.atan2(ux, uz) + (deg * Math.PI) / 180;
          let p = { x: a[0], z: a[2], y: W.heightAt(a[0], a[2], a[1]) };
          let t = 0;
          let along = 0;
          for (; t < 8 && along < 1; t += 1 / 60) {
            p = W.move(p, Math.sin(h) * 3.0 / 60, Math.cos(h) * 3.0 / 60, R);
            along = ((p.x - a[0]) * ux + (p.z - a[2]) * uz) / Lb;
          }
          runs.push({ id: `${l.id}${dir > 0 ? '>' : '<'}${deg}°`, ok: along >= 1, s: t, along });
        }
      }
    }
    const stuck = runs.filter((r) => !r.ok);
    check(runs.length === data.links.length * 10 && stuck.length === 0, `a jog held from each bridge's land end crosses it, straight or 5° or 15° off the line (sliding along the rope): ${stuck.length ? 'stuck: ' + stuck.map((r) => `${r.id} at ${(r.along * 100).toFixed(0)}%`).join(', ') : `slowest ${Math.max(...runs.map((r) => r.s)).toFixed(1)} s`}`);
    // and round a post: walking at one off its middle, he slides round it instead of stopping dead (square on,
    // he stops)
    const P = createWalk({ areas: [{ id: 'a', kind: 'rect', x: 0, z: 0, w: 10, d: 10, ry: 0, y: 1 }], blockers: [{ x: 0, z: 0, r: 0.2, h: 1 }] });
    let q = { x: 0.3, z: -2, y: 1 };
    for (let i = 0; i < 120; i++) q = P.move(q, 0, 3.0 / 60, R);
    let q0 = { x: 0, z: -2, y: 1 };
    for (let i = 0; i < 120; i++) q0 = P.move(q0, 0, 3.0 / 60, R);
    check(q.z > 1 && !P.blocked(q.x, q.z, R) && q0.z < -0.49 && q0.z > -0.51, `walking at a round post, off its middle he slides round it (to ${f2(q.x)}, ${f2(q.z)}); square on he stops at it (${f2(q0.x)}, ${f2(q0.z)})`);
  }

  // ---- 10,000 seeded random steps ----
  {
    const rnd = mulberry32(20261015);
    let pos = { x: data.spawn.x, z: data.spawn.z, y: W.heightAt(data.spawn.x, data.spawn.z) };
    let off = 0;
    let into = 0;
    let climb = 0;
    let badY = 0;
    let moved = 0;
    let maxDy = 0;
    const areasSeen = new Set();
    const linkHeights = [];
    for (let i = 0; i < 10000; i++) {
      // mostly short steps (a frame's worth), sometimes long ones (split into short ones inside)
      const len = rnd() < 0.9 ? rnd() * 0.12 : rnd() * 1.2;
      const a = rnd() * Math.PI * 2;
      // now and then a townsperson stands right in the way
      const dynamic = rnd() < 0.2 ? [{ x: pos.x + Math.cos(a) * 0.9, z: pos.z + Math.sin(a) * 0.9, r: 0.35 }] : [];
      const n = W.move(pos, Math.cos(a) * len, Math.sin(a) * len, R, dynamic);
      if (n.moved) moved++;
      if (!W.inside(n.x, n.z)) off++;
      if (W.blocked(n.x, n.z, R)) into++;
      if (dynamic.length && Math.hypot(n.x - dynamic[0].x, n.z - dynamic[0].z) < R + 0.35 - 1e-6 && Math.hypot(pos.x - dynamic[0].x, pos.z - dynamic[0].z) >= R + 0.35 - 1e-6) into++;
      const dy = Math.abs(n.y - pos.y);
      maxDy = Math.max(maxDy, dy);
      if (dy > 0.35 + 1e-9) climb++;
      // (the feet on one of the surfaces there: a deck, or a bridge running onto it)
      const h = W.heightAt(n.x, n.z, n.y);
      if (h === null || Math.abs(h - n.y) > 1e-6) badY++;
      for (const ar of data.areas) if (!ar.id.includes('-') && Math.abs(n.y - ar.y) < 0.4 && W.inside(n.x, n.z)) areasSeen.add(ar.id);
      if (n.y < 1.25) linkHeights.push(n.y);
      pos = n;
      // every so often start again somewhere else on the walk
      if (i % 500 === 499) {
        const p = data.places[(i / 500) % data.places.length | 0];
        pos = { x: p.x, z: p.z, y: W.heightAt(p.x, p.z) };
      }
    }
    check(off === 0, `10,000 random steps never leave the walk (${off} off)`);
    check(into === 0, `... never walk into an obstacle or a townsperson (${into} into)`);
    check(climb === 0 && badY === 0, `... never rise or drop more than 0.35 in a step (largest ${maxDy.toFixed(3)}), the feet always at the surface's height (${badY} wrong)`);
    check(moved > 6000, `... and mostly get somewhere (${moved} of 10,000 moved)`);
  }

  // ---- taps ----
  {
    const plaza = data.areas.find((a) => a.id === 'plaza');
    const hit = W.pick([plaza.x, 20, plaza.z + 10], [0, plaza.y - 20, -10]);
    check(!!hit && Math.abs(hit.x - plaza.x) < 1e-6 && Math.abs(hit.z - plaza.z) < 1e-6, `a tap straight at the plaza lands there (${hit && f2(hit.x)}, ${hit && f2(hit.z)})`);
    const miss = W.pick([0, 20, 40], [0, -20, 10]);
    check(miss === null, 'a tap on the open sea misses');
    check(W.pick([0, 20, 0], [0, 1, 0]) === null && W.pick([0, 20, 0], [1, 0, 0]) === null, 'rays going up, or level, miss');
    const br = data.links.find((l) => l.id === 'plazaS1');
    const mid = br.pts[Math.floor(br.pts.length / 2)];
    const hb = W.pick([mid[0] + 3, mid[1] + 6, mid[2]], [-3, -6, 0]);
    check(!!hb && Math.hypot(hb.x - mid[0], hb.z - mid[2]) < 0.15, `a tap on the middle of the plaza-Polly bridge lands on it (${hb && f2(Math.hypot(hb.x - mid[0], hb.z - mid[2]))} off)`);
    const garden = data.areas.find((a) => a.id === 'garden');
    const top = W.heightAt(garden.x, garden.z);
    const hg = W.pick([garden.x, 10, garden.z + 4], [0, top - 10, -4]);
    check(!!hg && Math.hypot(hg.x - garden.x, hg.z - garden.z) < 0.1, `a tap on the top of the garden's sand mound lands there (${hg && f2(hg.x)}, ${hg && f2(hg.z)})`);
    const s = W.snap(plaza.x, plaza.z - plaza.d / 2 - 1.2);
    check(!!s && W.inside(s.x, s.z) && !W.blocked(s.x, s.z, R) && Math.hypot(s.x - plaza.x, s.z - (plaza.z - plaza.d / 2 - 1.2)) <= 3, `a point in the water next to the plaza snaps onto the walk (${s && f2(s.x)}, ${s && f2(s.z)})`);
    check(W.snap(80, 80) === null, 'a point far out at sea snaps to nothing');
  }

  // ---- made-up towns ----
  {
    const L = createWalk({
      areas: [
        { id: 'a', kind: 'rect', x: 0, z: 0, w: 10, d: 2, ry: 0, y: 1 },
        { id: 'b', kind: 'rect', x: 4, z: 4, w: 2, d: 10, ry: 0, y: 1 },
      ],
      blockers: [{ x: -2, z: 0, r: 0.3, h: 1 }],
      places: [{ id: 'p', name: 'P', x: 4, z: 8, r: 1, face: 0 }],
      spawn: { x: -4, z: 0, h: 0 },
    });
    const p = L.path({ x: -4, z: 0 }, { x: 4, z: 8 });
    check(pathProblems(L, p, { x: -4, z: 0 }, { x: 4, z: 8 }).length === 0 && p.length >= 3, `an L of two rects: the path turns the corner (${p.length} points) and goes round the post`);
    check(L.inside(4.9, -0.9) && !L.inside(-2, 2) && !L.inside(0, 5), 'the L: inside its arms, not in the crook');
    const m = L.move({ x: -2.8, z: 0, y: 1 }, 1, 0, R);
    check(m.moved && m.x <= -2.6 + 1e-6 && m.x > -2.7 && !L.blocked(m.x, m.z, R), `walking into the post stops short of it (x ${f2(m.x)})`);
    const slide = L.move({ x: 0, z: 0.5, y: 1 }, 1, 1, R);
    check(slide.moved && slide.z <= 1 + 1e-9 && slide.x > 0.9, `walking diagonally into the edge slides along it (${f2(slide.x)}, ${f2(slide.z)})`);
  }
  {
    const T = createWalk({ areas: [{ id: 'r', kind: 'rect', x: 10, z: -5, w: 4, d: 2, ry: Math.PI / 4, y: 2 }] });
    const c = Math.cos(Math.PI / 4);
    // local (1.9, 0) and (0, 0.9) inside, local (0, 1.1) outside (local -> world: x + lx cos + lz sin, z - lx sin + lz cos)
    const w = (lx, lz) => [10 + lx * c + lz * c, -5 - lx * c + lz * c];
    check(T.inside(...w(1.9, 0)) && T.inside(...w(0, 0.9)) && !T.inside(...w(0, 1.1)) && !T.inside(...w(2.1, 0)), 'a turned rect: inside along its long and short sides, outside past them (turned like THREE rotation.y)');
    check(T.heightAt(...w(1, 0.5)) === 2 && T.heightAt(...w(0, 1.5)) === null, 'its height inside, none outside');
  }
  {
    const C = createWalk({ areas: [{ id: 'm', kind: 'circle', x: 0, z: 0, r: 3, y: 1.4, profile: [[0, 1.6], [2, 1.5], [3, 1.3]] }] });
    check(C.inside(2.9, 0) && !C.inside(2.2, 2.2) && Math.abs(C.heightAt(0, 0) - 1.6) < 1e-9 && Math.abs(C.heightAt(1, 0) - 1.55) < 1e-9 && Math.abs(C.heightAt(0, 2.5) - 1.4) < 1e-9, 'a round mound: inside its circle, its height following the profile out from the middle');
    // (a ray along y = z: where it lands, the mound's height equals that z)
    const h = C.pick([0, 10, 10], [0, -10, -10]);
    check(!!h && Math.abs(h.z - C.heightAt(h.x, h.z)) < 0.02, `a tap on the mound lands on its sloping top (z ${h && f2(h.z)}, height there ${h && f2(C.heightAt(h.x, h.z))})`);
  }
  {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push([i, 1 - 0.8 * 4 * (i / 10) * (1 - i / 10), 0]);
    const B = createWalk({
      areas: [
        { id: 'w', kind: 'rect', x: -2, z: 0, w: 4, d: 3, ry: 0, y: 1 },
        { id: 'e', kind: 'rect', x: 12, z: 0, w: 4, d: 3, ry: 0, y: 1 },
      ],
      links: [{ id: 'br', pts, hw: 0.25 }],
    });
    check(Math.abs(B.heightAt(5, 0) - 0.2) < 1e-9 && Math.abs(B.heightAt(2.5, 0.1) - (pts[2][1] + pts[3][1]) / 2) < 1e-9, `a sagging bridge: its height follows the planks (${f2(B.heightAt(5, 0))} in the middle, ${f2(B.heightAt(2.5, 0.1))} between two of its points)`);
    check(B.inside(5, 0.24) && !B.inside(5, 0.3), 'a walker may stray hw from its middle, no more');
    const p = B.path({ x: -2, z: 0 }, { x: 12, z: 0 });
    check(pathProblems(B, p, { x: -2, z: 0 }, { x: 12, z: 0 }).length === 0, `the path crosses the bridge (${p.length} points)`);
    let q = { x: -1, z: 0, y: 1 };
    let maxDy = 0;
    for (let i = 0; i < 200; i++) {
      const n = B.move(q, 0.08, 0, R);
      maxDy = Math.max(maxDy, Math.abs(n.y - q.y));
      q = n;
    }
    check(q.x > 11 && Math.abs(q.y - 1) < 1e-9 && maxDy < 0.1, `walking across it: down the sag and up again, smoothly (largest step ${maxDy.toFixed(3)}), onto the far deck (${f2(q.x)})`);
    const lip = createWalk({ areas: [{ id: 'lo', kind: 'rect', x: 0, z: 0, w: 2, d: 2, ry: 0, y: 1 }, { id: 'hi', kind: 'rect', x: 2, z: 0, w: 2, d: 2, ry: 0, y: 1.5 }] });
    const up = lip.move({ x: 0.5, z: 0, y: 1 }, 1, 0, R);
    check(!up.moved || up.x <= 1 + 1e-9, `a 0.5 step up stops the walker at its foot (x ${f2(up.x)})`);
  }
  {
    const I = createWalk({
      areas: [
        { id: 'a', kind: 'rect', x: 0, z: 0, w: 4, d: 4, ry: 0, y: 1 },
        { id: 'b', kind: 'rect', x: 10, z: 0, w: 4, d: 4, ry: 0, y: 1 },
      ],
    });
    check(Array.isArray(I.path({ x: 0, z: 0 }, { x: 10, z: 0 })) && I.path({ x: 0, z: 0 }, { x: 10, z: 0 }).length === 0, 'two islands: no path between them ([])');
    const m = I.move({ x: 1.5, z: 0, y: 1 }, 6, 0, R);
    check(m.x <= 2 + 1e-9, `a long step can't jump the water between them (stops at x ${f2(m.x)})`);
  }
  {
    // a walker a townsperson bumped into can still step away (never deeper in)
    const D = createWalk({ areas: [{ id: 'a', kind: 'rect', x: 0, z: 0, w: 10, d: 10, ry: 0, y: 1 }] });
    const folk = [{ x: 0.4, z: 0, r: 0.35 }];
    const away = D.move({ x: 0, z: 0, y: 1 }, -0.3, 0, R, folk);
    const into = D.move({ x: 0, z: 0, y: 1 }, 0.3, 0, R, folk);
    check(away.moved && away.x < 0 && !into.moved, 'pushed against a townsperson: stepping away works, stepping further in does not');
  }

  // ---- the Kraken Seas: the new places, the plots, Bess and the professor, the villagers ----
  {
    // the plots of SPEC3 §8.1: island.js's PLOTS, the one table sparrow.js builds them from ({ id, platform, x, z,
    // height }; its x / z must be the platform's, where sparrow stands each plot, and its height the envelope's)
    const fin = (...v) => v.every(Number.isFinite);
    const PLOTS = (await load('src/island.js')).PLOTS;
    check(PLOTS.length === 10 && PLOTS.every((p) => /^s\d+$/.test(p.platform) && fin(p.x, p.z, p.height) && p.height > 0) && new Set(PLOTS.map((p) => p.platform)).size === PLOTS.length,
      `island.js gives every plot a platform of its own, a place and a tier-3 height (${PLOTS.map((p) => `${p.id} ${p.platform} ${p.height}`).join(', ')})`);
    const quiz = data.places.find((p) => p.id === 'quiz');
    const builder = data.places.find((p) => p.id === 'builder');
    for (const p of [quiz, builder]) {
      check(!!p && fin(p.x, p.z, p.r, p.face) && p.cam && p.cam.pos.length === 3 && p.cam.target.length === 3 && W.inside(p.x, p.z) && !W.blocked(p.x, p.z, R), `${p ? p.name : 'a new place'} stands on the walk, clear, with a facing and a panel camera`);
    }
    check(!!quiz && quiz.name === "Professor Barnacle's Riddle Bell" && Math.abs(W.heightAt(quiz.x, quiz.z) - 1.3) < 0.01 && Math.hypot(quiz.x + 18.2, quiz.z + 25.4) < 3.6, `the Riddle Bell is on the lookout tower's raft (${f2(quiz && quiz.x)}, ${f2(quiz && quiz.z)})`);
    check(!!builder && builder.name === 'Builder Bess' && builder.x > -8.5 && builder.x < 8.5 && builder.z < -5.7 && builder.z > -14.8, `Builder Bess's place is on the plaza (${f2(builder && builder.x)}, ${f2(builder && builder.z)})`);
    // (the reachability loop above already walks from the spawn to every place and between every two places)
    for (const p of [quiz, builder]) {
      const a = W.path(data.spawn, p);
      const b = W.path(p, data.places.find((q) => q.id === 'ship'));
      check(pathProblems(W, a, data.spawn, p).length === 0 && pathProblems(W, b, p, data.places[0]).length === 0, `${p.id}: reached from the spawn (${a.length} points) and back to the ship (${b.length} points)`);
    }
    // the walk changed only by the two places and their props: today's decks, portals and bridges, nothing more
    const areaIds = data.areas.map((a) => a.id).sort().join(',');
    const linkIds = data.links.map((l) => l.id).sort().join(',');
    check(areaIds === 'garden,pier,pier-plaza-1,pier-plaza-2,plaza,plaza-tavern,s1,tavern,tower,yard' && linkIds === 'plazaGarden,plazaS1,plazaYard,tavernTower', `no new walkable area or bridge (areas ${areaIds}; bridges ${linkIds})`);
    // every plot: none walkable, and its tallest building (its platform's footprint x its height) a camera-only box from tier 0
    const envs = (data.camBlockers || []).filter((b) => typeof b.plot === 'string');
    const plotIds = PLOTS.map((p) => p.id);
    check(envs.length === PLOTS.length && plotIds.every((id) => envs.filter((b) => b.plot === id).length === 1), `every plot has one camera envelope (${envs.map((b) => b.plot).join(', ')})`);
    for (const p of PLOTS) {
      const b = envs.find((q) => q.plot === p.id);
      if (!b) continue;
      let onWalk = 0;
      const c = Math.cos(b.ry);
      const sn = Math.sin(b.ry);
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          const lx = (i / 10 - 0.5) * b.w;
          const lz = (j / 10 - 0.5) * b.d;
          if (W.inside(b.x + lx * c + lz * sn, b.z - lx * sn + lz * c)) onWalk++;
        }
      }
      const deckY = b.y0 + 0.3;
      check(Math.hypot(b.x - p.x, b.z - p.z) < 0.05 && b.w >= 4.9 && b.d >= 4.9 && Math.abs(b.y1 - deckY - p.height) < 1e-6 && b.y0 <= deckY && onWalk === 0,
        `plot ${p.id} (${p.platform}): not walkable (${onWalk} of 121 points on the walk), a camera box ${f2(b.w)} x ${f2(b.d)} from its deck up to ${f2(b.y1 - deckY)} (the tallest building ${p.height})`);
    }
    // Bess and the professor: blockers, clear of the walkers' paths and villagers' loops, the bridge mouths, the
    // doorways, the other places; and no passage beside them narrower than 1.6 u of deck
    const npcs = data.npcs || [];
    // (they are townsfolk like any other: folk() gives each a blocker of r 0.35, which the captain squeezes past
    // after a moment; the walk data gives them none, which he couldn't)
    check(npcs.length === 2 && ['barnacle', 'bess'].every((id) => npcs.some((n) => n.id === id)) && npcs.every((n) => n.r === 0.35 && W.inside(n.x, n.z) && !data.blockers.some((b) => Math.hypot(b.x - n.x, b.z - n.z) < 0.05)), `Bess and the professor stand on the walk as townsfolk (r ${npcs.map((n) => n.r).join(', ')}), with no blocker of their own in the walk data`);
    const segD = (px, pz, a, b) => {
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const L2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[2]) * dz) / L2));
      return Math.hypot(px - a[0] - dx * u, pz - a[2] - dz * u);
    };
    const pathD = (px, pz, pts) => {
      let d = Infinity;
      for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segD(px, pz, pts[i], pts[i + 1]));
      return d;
    };
    const paths = data.paths || [];
    const mouths = data.links.flatMap((l) => [l.pts[1], l.pts[l.pts.length - 2]]);
    const doors = data.doors || [];
    check(paths.filter((q) => q.kind === 'walker').length === 6 && paths.filter((q) => q.kind === 'villager').length === 8 && doors.length >= 3, `the walk data lists the townsfolk's ${paths.filter((q) => q.kind === 'walker').length} paths, the villagers' ${paths.filter((q) => q.kind === 'villager').length} loops and ${doors.length} doorways`);
    const own = { barnacle: 'quiz', bess: 'builder' };
    for (const n of npcs) {
      const near = Math.min(...paths.map((q) => pathD(n.x, n.z, q.pts)));
      const mouth = Math.min(...mouths.map((m) => Math.hypot(n.x - m[0], n.z - m[2])));
      const door = doors.length ? Math.min(...doors.map((d) => Math.hypot(n.x - d.x, n.z - d.z))) : Infinity;
      const inside = data.places.filter((p) => p.id !== own[n.id] && Math.hypot(p.x - n.x, p.z - n.z) < p.r).map((p) => p.id);
      const plank = Math.hypot(n.x - data.spawn.x, n.z - data.spawn.z);
      check(near >= 1 && mouth >= 2 && door >= 2 && plank >= 2 && inside.length === 0, `${n.id}: ${f2(near)} u from the nearest walker's path or villager's loop (>= 1), ${f2(mouth)} u from a bridge mouth, ${f2(door)} u from a doorway and ${f2(plank)} u from the gangplank's foot (>= 2), in no other place's circle${inside.length ? ' (in ' + inside.join(', ') + ')' : ''}`);
    }
    // Their blockers (r 0.35, as folk() gives them) never narrow a deck below 1.6 u and plug no gap (so the captain
    // never has to squeeze past them to get anywhere): on a 0.1 grid over the whole walk,
    // (a) every spot the captain reaches from the spawn without the two of them, he still reaches with them in the
    //     way (but for the spots right beside them), and
    // (b) a walker as wide as 1.6 u of deck (r 0.8, his middle 0.15 inside the walk's edge, which keeps 0.65 from
    //     the deck's edge) who can get from one spot to another without them still can with them (no pinch below
    //     1.6 u where there was room before)
    {
      const W0 = W;
      const W1 = createWalk({ ...data, blockers: [...data.blockers, ...npcs.map((n) => ({ x: n.x, z: n.z, r: n.r, h: 1.6 }))] });
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (const a of data.areas) {
        const e = a.kind === 'circle' ? a.r : Math.hypot(a.w, a.d) / 2;
        x0 = Math.min(x0, a.x - e);
        x1 = Math.max(x1, a.x + e);
        z0 = Math.min(z0, a.z - e);
        z1 = Math.max(z1, a.z + e);
      }
      const S = 0.1;
      const NX = Math.ceil((x1 - x0) / S) + 1;
      const NZ = Math.ceil((z1 - z0) / S) + 1;
      const ring = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
      const grid = (Wx, rad, margin) => {
        const free = new Uint8Array(NX * NZ);
        for (let j = 0; j < NZ; j++) {
          for (let i = 0; i < NX; i++) {
            const x = x0 + i * S;
            const z = z0 + j * S;
            if (!Wx.inside(x, z) || Wx.blocked(x, z, rad)) continue;
            if (margin && !ring.every(([cx, cz]) => Wx.inside(x + cx * margin, z + cz * margin))) continue;
            free[j * NX + i] = 1;
          }
        }
        // label the 4-connected pieces
        const lab = new Int32Array(NX * NZ).fill(-1);
        let n = 0;
        const st = [];
        for (let k = 0; k < NX * NZ; k++) {
          if (!free[k] || lab[k] >= 0) continue;
          lab[k] = n;
          st.push(k);
          while (st.length) {
            const u = st.pop();
            const i = u % NX;
            for (const v of [i > 0 ? u - 1 : -1, i < NX - 1 ? u + 1 : -1, u - NX, u + NX]) {
              if (v >= 0 && v < NX * NZ && free[v] && lab[v] < 0) {
                lab[v] = n;
                st.push(v);
              }
            }
          }
          n++;
        }
        return { lab, n };
      };
      const besideNpc = (k, reach) => {
        const x = x0 + (k % NX) * S;
        const z = z0 + Math.floor(k / NX) * S;
        return npcs.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + reach + 0.15);
      };
      const cell = (x, z) => Math.round((z - z0) / S) * NX + Math.round((x - x0) / S);
      // (a) the captain
      const A0 = grid(W0, R, 0);
      const A1 = grid(W1, R, 0);
      const sp = W0.snap(data.spawn.x, data.spawn.z, 1);
      let spk = cell(sp.x, sp.z);
      if (A0.lab[spk] < 0 || A1.lab[spk] < 0) for (let d = 1; d < 5 && (A0.lab[spk] < 0 || A1.lab[spk] < 0); d++) spk = cell(sp.x + d * S, sp.z);
      let reached = 0;
      let lost = 0;
      for (let k = 0; k < NX * NZ; k++) {
        if (A0.lab[k] < 0 || A0.lab[k] !== A0.lab[spk]) continue;
        reached++;
        if (A1.lab[k] !== A1.lab[spk] && !besideNpc(k, R)) lost++;
      }
      check(reached > 5000 && lost === 0, `Bess and the professor shut the captain out of nowhere: ${reached} spots (0.1 apart) reached from the spawn without them, ${lost} lost with them`);
      // (b) a walker 1.6 u wide
      const F = 0.8;
      const B0 = grid(W0, F, F - 0.65);
      const B1 = grid(W1, F, F - 0.65);
      const pieces = new Map(); // a piece without them -> the pieces its spots fall in with them
      let roomy = 0;
      for (let k = 0; k < NX * NZ; k++) {
        if (B0.lab[k] < 0) continue;
        roomy++;
        if (besideNpc(k, F)) continue;
        if (!pieces.has(B0.lab[k])) pieces.set(B0.lab[k], new Set());
        pieces.get(B0.lab[k]).add(B1.lab[k]);
      }
      const split = [...pieces.values()].filter((v) => v.size > 1 || v.has(-1)).length;
      check(roomy > 2000 && split === 0, `... nor narrow a deck below 1.6 u: ${pieces.size} roomy stretches of deck (${roomy} spots a 1.6 u wide walker fits), ${split} cut or pinched by them`);
    }
    // the villagers' loops: closed loops (a walker on a loop never pauses), on the walk at its height all the way, clear
    // of the obstacles, the other paths and loops, the places' circles; at most two loops over any bridge
    const loops = paths.filter((q) => q.kind === 'villager');
    const bad = [];
    const perBridge = {};
    for (const l of loops) {
      const P0 = l.pts[0];
      const P1 = l.pts[l.pts.length - 1];
      if (!l.loop || Math.hypot(P0[0] - P1[0], P0[2] - P1[2]) > 1e-6) bad.push(`${l.id} is not closed`);
      let minObs = Infinity;
      let minOther = Infinity;
      for (let i = 0; i + 1 < l.pts.length; i++) {
        const [ax, ay, az] = l.pts[i];
        const [bx, by, bz] = l.pts[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1));
        for (let k = 0; k < n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const y = ay + ((by - ay) * k) / n;
          const z = az + ((bz - az) * k) / n;
          const h = W.heightAt(x, z, y);
          if (h === null || Math.abs(h - y) > 0.08) bad.push(`${l.id} off the walk at ${f2(x)},${f2(z)}`);
          minObs = Math.min(minObs, W.blocked(x, z, 0.3) ? -1 : Infinity);
          for (const q of paths) if (q !== l) minOther = Math.min(minOther, pathD(x, z, q.pts));
          for (const p of data.places) if (Math.hypot(p.x - x, p.z - z) < p.r + 0.5) bad.push(`${l.id} through the ${p.id} circle`);
        }
      }
      if (minObs < 0) bad.push(`${l.id} into an obstacle`);
      if (minOther < 0.7) bad.push(`${l.id} ${f2(minOther)} from another walker`);
      for (const k of data.links) {
        const mid = k.pts[Math.floor(k.pts.length / 2)];
        if (pathD(mid[0], mid[2], l.pts) < 0.05) perBridge[k.id] = (perBridge[k.id] || 0) + 1;
      }
    }
    check(loops.length === 8 && bad.length === 0 && Object.values(perBridge).every((v) => v <= 2), `the villagers' 8 loops are closed, on the walk, clear of obstacles (0.3), of the other paths and loops (0.7) and of the places' circles; loops per bridge ${JSON.stringify(perBridge)}${bad.length ? ': ' + [...new Set(bad)].slice(0, 5).join('; ') : ''}`);
  }

  // ---- junk ----
  {
    let threw = null;
    try {
      const J = createWalk({ areas: [null, 7, { kind: 'circle' }, { kind: 'rect', w: 'x' }], links: [{ pts: [[1, 2, 3]] }, { pts: 'no' }, null], blockers: [null, { x: 1 }], places: [{ x: NaN }], spawn: 'here' });
      J.inside(NaN, 0);
      J.heightAt(undefined, null);
      J.blocked(Infinity, 0);
      J.move(null, 1, 1);
      J.move({ x: 0, z: 0 }, NaN, 'a');
      J.nearestPlace(0, 0);
      J.path(null, { x: 1 });
      J.path({ x: 0, z: 0 }, { x: 1, z: 1 });
      J.snap(NaN, 0);
      J.pick('a', 'b');
      J.pick([0, 0, 0], [0, 0, 0]);
      void J.graph;
      createWalk();
      createWalk(null).path({ x: 0, z: 0 }, { x: 1, z: 1 });
      createWalk('junk').inside(0, 0);
      createWalk({ areas: 'x', links: 3, blockers: {}, places: 'y' }).path({ x: 0, z: 0 }, { x: 1, z: 0 });
    } catch (e) {
      threw = e.message;
    }
    check(threw === null, `junk data and junk arguments never throw${threw ? ' (' + threw + ')' : ''}`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll walk checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
