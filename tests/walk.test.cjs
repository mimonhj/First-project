// Unit checks for the town's walking rules in src/walk.js (plain Node, no browser):
// - on the real town (tests/fixtures/sparrow-walk.json, dumped from the live env.walk of
//   src/env/sparrow.js by a harness): the spawn and every place stand on the walk, clear of every
//   obstacle; every place can be reached from the spawn and from every other place along a path
//   that stays on the walk and clear of the obstacles all the way; 10,000 seeded random steps (some
//   of them with townsfolk in the way) never leave the walk, never walk into anything and never rise
//   or drop more than a step; taps on the decks and bridges land, taps on the water miss
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
    check(JSON.stringify(places) === JSON.stringify(['ship', 'shipyard', 'tailor', 'tavern']), `the places, in order: ${places.join(', ')}`);
    const tailor = data.places.find((p) => p.id === 'tailor');
    check(!!tailor && tailor.name === "Polly's Plumes & Trims" && tailor.podium && Number.isFinite(tailor.podium.y) && Array.isArray(tailor.lineup) && tailor.lineup.length === 3 && tailor.cam && tailor.cam.pos.length === 3 && tailor.cam.target.length === 3, "Polly's has its podium, a line-up of three and a fitting camera");
    const tavern = data.places.find((p) => p.id === 'tavern');
    check(!!tavern && tavern.name === 'The Salty Sparrow' && tavern.cam && tavern.cam.pos.length === 3, 'The Salty Sparrow has its porch camera');
    check(data.places.every((p) => Number.isFinite(p.r) && p.r > 0 && Number.isFinite(p.face)), 'every place has a reach and a facing');
    check(!!data.spawn && Math.abs(Math.abs(data.spawn.h) - Math.PI) < 0.3, `the spawn faces the town (h ${f2(data.spawn && data.spawn.h)})`);
    check(data.blockers.length >= 60 && data.blockers.every((b) => Number.isFinite(b.h) && (Number.isFinite(b.r) || (Number.isFinite(b.w) && Number.isFinite(b.d)))), `${data.blockers.length} obstacles, each round or a box, each with a height for the camera`);
    check(JSON.stringify(JSON.parse(JSON.stringify(data))) === JSON.stringify(data), 'the data survives a JSON round trip unchanged');
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
