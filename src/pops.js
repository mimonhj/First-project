import * as THREE from 'three';

// Pop words over the 3D view (SPEC2 §2.5, §5.3): "17", "STERN RAKE ×2!", "CRIT! MAST DOWN!", "−3 CREW",
// "CAPTURED! +145". Each pop is a recycled DOM span in the #pops layer, anchored to a world point and
// projected every frame, so it costs 0 draw calls. ≥ 24 px light text with a 3 px ink outline (fx.css).
//
// createPops(layerEl, camera, { reducedMotion, avoid, insetTop, furniture }) → {
//   pop(text, x, y, z, style, mod) → boolean,   // style: 'dmg' | 'rake' | 'crit' | 'crew' | 'info' | 'slow'
//                                           //        | 'capture' | 'gold' | 'bad' | 'fire' | 'frost' | 'stink'
//                                           //        | 'kraken'; a '\n' (or "CRIT! <effect>", or for the
//                                           //        four new styles "<WORD!> <more>", e.g. "FIRE OUT! SSSS!")
//                                           //        splits the text into a big line and a smaller second
//                                           //        line; mod (optional, a word, or up to 3 words with
//                                           //        spaces): an extra class pop-<mod> for each, e.g.
//                                           //        'round' for round shot's bigger hull damage, 'kaboom'
//                                           //        for KA-BOOM! (bigger), 'eye' for BULLSEYE!; and 'keep'
//                                           //        (also a class, pop-keep) for a pop that is never
//                                           //        dropped (see Keep below), e.g. pop('IMMUNE!', x, y, z,
//                                           //        'info', 'keep')
//   update(dt),   // ages, moves and fades the pops (dt in seconds; 0 while paused freezes them)
//   clear(), get count /* pops alive */
// }
// reducedMotion: a boolean or a function returning one (read at each pop): the pop only fades in and
// out, no rise, no bounce, no wobble.
// avoid: optional () => DOMRect[] (or {left, top, right, bottom}): screen boxes the pops keep off, e.g. the
// hitmark. Each box counts 10% bigger on every side (its own pop-in). Read when a pop is placed and again
// every frame while pops are up, so a box that shows up (or grows) after a pop makes that pop hop aside
// (not while paused: update(0) moves nothing).
// insetTop: optional () => number: px from the top of the viewport the pops stay below (the top HUD row).
// furniture: CSS selectors (or [selector, weight]) of the battle HUD's own pieces that pops keep off whenever
// they show, counted like `avoid` boxes: by default the level / "X sunk!" banner, the minimap, the boss bar, the
// boarding strip, the objective pill, the hint bubble, the gun card and the touch pads (FURNITURE). Looked up in
// the layer's document; a piece that is hidden (display: none) or missing is skipped. Pass [] for none. A weight
// below 1 makes a soft obstacle (an overlap with it counts that much of one with a pop).
// A volley's "−N CREW" that comes right after its damage at the same point joins that pop as its second line.
// Placement: a pop goes right at its impact unless that spot would meet another pop or an avoided box at
// any moment of its life (pops rise, each at its own pace, and grow and tilt as they pop in); then it
// takes the nearest clear spot straight above (or below) it, inside the screen if there is one, and only
// when there is none (a crowded short screen) the nearest clear spot beside what is in its way.
// An impact off the side of the screen (a broadside's target on a portrait phone) shows its pops at that
// edge; only an impact behind the camera, or far above or below the view, hides them.
// The Kraken Seas' words (SPEC3 §2.7, §5.7): 'fire' ON FIRE! / KA-BOOM!, 'frost' FROZEN! / FIRE OUT! SSSS!,
// 'stink' STINKY! / Clothes-pegs!, 'kraken' SLAM! / BULLSEYE! / OUCH! / ACHOO! / TENTACLE!: each a status or a
// monster's move a child must see, so they count as important (below).
// Throttle: ≤ 12 alive (the oldest makes room), ≤ 8 new per second; a pop over the rate waits up to
// 0.4 s in a short queue (CAPTURED!, CRIT!, gold, bad news, statuses and the Kraken's words jump it) and is
// dropped if it is still waiting then.
// No room: a pop with no clear spot waits a moment for one (ROOM_WAIT); POINT BLANK! and the rake words (the
// HIT mark's stickers say them too) are let go if none comes, anything else then shows least covered.
// Keep (mod 'keep'): a word that explains a refusal (IMMUNE!, CLANG!: why a shot did nothing; SPEC3 §0.1 "no
// hidden traps") must show even in a crowded volley. It jumps the queue like an important pop and is never pushed
// out of it, shows late rather than never when the rate holds it past its moment, shows least covered rather than
// be let go when there is no room (even as an 'info' pop), and is the last pushed off the screen when 12 are up.

const MAX_ALIVE = 12;
const RATE = 8; // new pops per second
const QUEUE_MAX = 8;
const QUEUE_AGE = 0.4;
const IMPORTANT = new Set(['capture', 'crit', 'bad', 'gold', 'fire', 'frost', 'stink', 'kraken']);
// the styles whose "<WORD!> <more>" splits into two lines
const SPLIT_BANG = new Set(['fire', 'frost', 'stink', 'kraken']);
// A pop that finds no clear spot (a crowded short screen) waits up to ROOM_WAIT s for one (the words around it
// rise and fade), looking again every ROOM_LOOK s; then it shows where it is least covered, except a word the
// HIT mark's stickers already say or that only adds colour (DROPPABLE), which is let go. Important pops never wait.
const ROOM_WAIT = 0.6;
const ROOM_LOOK = 0.05;
const DROPPABLE = new Set(['info', 'rake']);
// the pops that jump the queue: the important styles and any pop marked 'keep'
const vital = (q) => IMPORTANT.has(q.style) || !!q.keep;
// The battle HUD's pieces the pops keep off (index.html ids; see `furniture`): [selector, weight]. The banner
// is a soft obstacle: a pop crosses it rather than another pop, the HIT mark or a control when there is no room
// for all (its words are big and it soon goes; a short landscape phone has room for little else).
const FURNITURE = [['#banner', 0.3], '#minimap', '#boss', '#boarding-strip', '#objective', '#hint', '#hud .hud-bottom .card.guns', '#touch .pad'];

// Per style: life (s), rise (px over the life), overshoot of the pop-in and entry wobble (deg).
const STYLES = {
  dmg: { life: 1.0, rise: 50, pop: 1.3, wobble: 0 },
  rake: { life: 1.25, rise: 50, pop: 1.25, wobble: -6 },
  crit: { life: 1.35, rise: 50, pop: 1.45, wobble: 9 },
  crew: { life: 1.15, rise: 50, pop: 1.2, wobble: 0 },
  info: { life: 0.95, rise: 50, pop: 1.15, wobble: 0 },
  slow: { life: 1.3, rise: 44, pop: 1.3, wobble: -7 }, // SLOWED! (chain shot's first hit on her)
  capture: { life: 2.0, rise: 60, pop: 1.5, wobble: -5 },
  gold: { life: 1.4, rise: 56, pop: 1.25, wobble: 0 },
  bad: { life: 1.5, rise: 50, pop: 1.2, wobble: 0 },
  // SPEC3: special shot statuses and the Kraken
  fire: { life: 1.4, rise: 54, pop: 1.4, wobble: 8 }, // ON FIRE!, KA-BOOM!
  frost: { life: 1.4, rise: 40, pop: 1.25, wobble: -3 }, // FROZEN! (stiff), FIRE OUT! SSSS!
  stink: { life: 1.5, rise: 36, pop: 1.3, wobble: 11 }, // STINKY! (wobbly), Clothes-pegs!
  kraken: { life: 1.5, rise: 56, pop: 1.45, wobble: -8 }, // SLAM!, BULLSEYE!, OUCH!, ACHOO!
};
const EDGE = 6; // px kept clear at the screen edges (a pop near the edge slides in instead of being cut off)
const GAP = 6; // px kept between a pop's line box and another pop or an avoided box (its outline and shadow)
const AVOID_PAD = 0.1; // an avoided box counts this share of its size bigger on each side
const BELOW = 1.25; // a spot below the impact counts this much farther than one as far above it
const SIDE = 2; // a px of sideways shift counts this much (pops move sideways only on a crowded screen)
const CLAMPED = 30; // px a spot counts farther when the word would be held back at the top inset or the bottom
// The moments (s from now) at which a spot is checked: dense through the pop-in and wobble, then every 0.07 s
// to the longest life.
const SAMPLES = [];
for (let t = 0; t < 0.3; t += 0.03) SAMPLES.push(t);
for (let t = 0.3; t < 2.05; t += 0.07) SAMPLES.push(t);

const _v = new THREE.Vector3();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
// pop-in: 0 → overshoot → 1 over `d` seconds
function popScale(age, d, over) {
  if (age >= d) return 1;
  const x = age / d;
  if (x < 0.55) return 0.35 + (over - 0.35) * easeOut(x / 0.55);
  return over + (1 - over) * easeOut((x - 0.55) / 0.45);
}

// a caller's box as { l, t, r, b } grown by `pad` (a share of its size) on each side, or null when it is
// empty or not a box
function avoidBox(r, pad = AVOID_PAD) {
  if (!r) return null;
  const l = Number(r.left ?? r.x);
  const t = Number(r.top ?? r.y);
  const rr = Number(r.right ?? l + Number(r.width));
  const b = Number(r.bottom ?? t + Number(r.height));
  if (![l, t, rr, b].every(Number.isFinite) || rr - l < 1 || b - t < 1) return null;
  const px = (rr - l) * pad;
  const py = (b - t) * pad;
  return { l: l - px, t: t - py, r: rr + px, b: b + py };
}

export function createPops(layerEl, camera, { reducedMotion = false, avoid = null, insetTop = null, furniture = FURNITURE } = {}) {
  const rm = typeof reducedMotion === 'function' ? () => !!reducedMotion() : () => !!reducedMotion;
  const hasDom = !!layerEl && typeof document !== 'undefined';
  if (hasDom) layerEl.classList.remove('hidden');
  const doc = hasDom ? layerEl.ownerDocument || document : null;
  const pieces = (Array.isArray(furniture) ? furniture : [])
    .map((q) => (typeof q === 'string' ? [q, 1] : Array.isArray(q) && typeof q[0] === 'string' ? [q[0], clamp(Number(q[1]) || 0, 0, 1)] : null))
    .filter((q) => q && q[0] && q[1] > 0);

  // the pool: one span per pop (main line + optional second line), hidden while idle
  const pool = [];
  for (let i = 0; hasDom && i < MAX_ALIVE; i++) {
    const el = document.createElement('span');
    el.className = 'pop';
    el.style.display = 'none';
    const main = document.createElement('span');
    main.className = 'pop-main';
    const sub = document.createElement('span');
    sub.className = 'pop-sub';
    el.append(main, sub);
    layerEl.appendChild(el);
    pool.push({ el, main, sub, alive: false, keep: false, x: 0, y: 0, z: 0, style: 'dmg', S: STYLES.dmg, age: 0, life: 1, still: false, stack: 0, dx: 0, wayAt: -1, wayCost: 0, ax: 0, ay: 0, ok: false, w: 0, h: 0 });
  }
  const alive = []; // oldest first
  const queue = [];
  const waiting = []; // pops with no room yet: { ...q, lookAt }
  let tokens = RATE;
  let clock = 0;
  // the caller's limits, read when a pop is placed and once a frame while pops are up
  let top = EDGE;
  let boxes = [];
  function readLimits() {
    let t = EDGE;
    if (typeof insetTop === 'function') {
      try {
        const v = Number(insetTop());
        if (Number.isFinite(v)) t = Math.max(EDGE, v);
      } catch {
        /* no inset */
      }
    }
    top = t;
    boxes = [];
    if (typeof avoid === 'function') {
      try {
        const list = avoid();
        for (const r of list && typeof list[Symbol.iterator] === 'function' ? list : [list]) {
          const b = avoidBox(r);
          if (b) boxes.push(b);
        }
      } catch {
        boxes = [];
      }
    }
    // the HUD's own pieces, where they show (a hidden one has no box)
    if (doc && pieces.length) {
      try {
        for (const [q, w] of pieces) {
          for (const el of doc.querySelectorAll(q)) {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            const b = avoidBox(r, 0); // (it doesn't pop in: no margin beyond GAP)
            if (b) boxes.push(w < 1 ? { ...b, w } : b);
          }
        }
      } catch {
        /* a bad selector: no furniture */
      }
    }
  }

  function project(p) {
    _v.set(p.x, p.y, p.z).project(camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    // off the side is fine (place() keeps the word inside the screen edge); behind the camera is not
    return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, ok: _v.z < 1 && _v.z > -1 && Math.abs(_v.y) < 1.15 };
  }

  // scale, rise, wobble and opacity at a given age
  const _pose = { s: 1, rise: 0, rot: 0, o: 1 };
  function pose(p, age) {
    const k = age / p.life;
    if (p.still) {
      // reduced motion: fade in, hold, fade out; nothing moves
      _pose.s = 1;
      _pose.rise = 0;
      _pose.rot = 0;
      _pose.o = age < 0.12 ? age / 0.12 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    } else {
      _pose.s = popScale(age, 0.22, p.S.pop);
      _pose.rise = p.S.rise * easeOut(k);
      _pose.rot = p.S.wobble * Math.max(0, 1 - age / 0.3) * Math.cos(age * 30);
      _pose.o = age < 0.05 ? age / 0.05 : k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
    }
    return _pose;
  }
  // the word's bottom centre on screen: its anchor (ax, ay) minus rise and stack, kept inside the screen
  // edges and its top (`up` above that centre) below the top inset
  const spotX = (ax, hw) => {
    const W = window.innerWidth;
    return W > 2 * (hw + EDGE) ? clamp(ax, hw + EDGE, W - hw - EDGE) : W / 2;
  };
  const spotY = (base, st, up) => Math.min(Math.max(base - st, up + top), window.innerHeight - EDGE);
  // how far a word of half-width hw and height sh, tilted by `rot` degrees about its bottom centre,
  // reaches above, below and to either side of that centre
  function reach(hw, sh, rot) {
    const a = (rot * Math.PI) / 180;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    return { up: sh * c + hw * Math.abs(sn), down: hw * Math.abs(sn), l: hw * c - Math.min(0, sh * sn), r: hw * c + Math.max(0, sh * sn) };
  }

  // Pop p `dt` s from now, its anchor taken as fixed on screen (pops of one impact move together) and
  // shifted dx px sideways: its box around its bottom centre (l, r absolute; up, down from the centre,
  // with the wobble's corners) and `base`, that centre's height before its stack and the screen clamp.
  // null while it is gone or (all but) invisible.
  function track(p, dt, dx = p.dx) {
    const age = p.age + dt;
    if (age >= p.life) return null;
    const q = pose(p, age);
    if (q.o <= 0.05) return null;
    const hw = (p.w * q.s) / 2;
    const k = reach(hw, p.h * q.s, q.rot);
    const x = spotX(p.ax + dx, hw);
    return { base: p.ay - q.rise, up: k.up, down: k.down, l: x - k.l, r: x + k.r };
  }

  // What pop p must keep clear of at each sample of the rest of its life: the other pops where they will
  // be (withPops) and the avoided boxes. Worked out once for all the spots tried for p.
  function obstacles(p, withPops = true) {
    const per = [];
    for (const dt of SAMPLES) {
      if (p.age + dt >= p.life) break;
      const list = [];
      if (withPops) {
        for (const o of alive) {
          if (o === p || !o.ok) continue;
          const ot = track(o, dt);
          if (!ot) continue;
          const y = spotY(ot.base, o.stack, ot.up);
          list.push({ t: y - ot.up, b: y + ot.down, l: ot.l, r: ot.r });
        }
      }
      for (const b of boxes) list.push(b);
      per.push(list);
    }
    return per;
  }

  // Pop p shifted dx px sideways against those obstacles → { cost(st), best() → { st, cost, fits }, me, empty }
  function plan(p, per, dx = p.dx) {
    const all = []; // p's track at each sample while it shows
    const me = []; // the samples with something in its way: { tr, obs }
    for (let i = 0; i < per.length; i++) {
      const tr = track(p, SAMPLES[i], dx);
      if (!tr) continue;
      all.push(tr);
      const obs = per[i].filter((o) => o.l - GAP < tr.r && o.r + GAP > tr.l);
      if (obs.length) me.push({ tr, obs });
    }
    const H = window.innerHeight;
    // px of overlap summed over the samples (0 = clear all its life); stops counting past `over`
    function cost(st, over = Infinity) {
      let c = 0;
      for (const { tr, obs } of me) {
        const y = spotY(tr.base, st, tr.up);
        const t0 = y - tr.up - GAP;
        const b0 = y + tr.down + GAP;
        for (const o of obs) {
          const ov = Math.min(b0, o.b) - Math.max(t0, o.t);
          if (ov > 0.5) c += ov * (o.w ?? 1);
        }
        if (c > over) return c;
      }
      return c;
    }
    // never held back by the top inset or the bottom edge
    const fits = (st) => all.every((tr) => tr.base - st - tr.up >= top && tr.base - st <= H - EDGE);
    // the nearest clear spot straight above or below (above on a tie, since pops rise; one held back by
    // the top inset or the bottom edge counts CLAMPED px farther), else the least covered one
    function best() {
      // the stacks at which p would meet an obstacle at some sample (the screen clamp aside): open spans
      // (lo, hi); a stack at lo or below passes under it, at hi or above over it
      const spans = [];
      for (const { tr, obs } of me) {
        for (const o of obs) spans.push([tr.base - tr.up - o.b - GAP, tr.base - o.t + GAP + tr.down]);
      }
      spans.sort((a, b) => a[0] - b[0]);
      // candidates: at the impact, where it is, and the edges of the merged spans (2 px grid, outward)
      const cands = new Set([0, p.stack]);
      let lo = -Infinity;
      let hi = -Infinity;
      for (const [a, b] of [...spans, [Infinity, Infinity]]) {
        if (a < hi) {
          hi = Math.max(hi, b);
          continue;
        }
        if (hi > -Infinity) cands.add(2 * Math.floor(lo / 2)).add(2 * Math.ceil(hi / 2));
        lo = a;
        hi = b;
      }
      const pick = pickOf(cands);
      if (pick.cost === 0 && pick.fits) return pick;
      // nothing clear that stays inside the screen: the clamp at the top inset or the bottom moves a word
      // that would cross it, so try the edges of every span too
      const more = new Set();
      for (const [a, b] of spans) more.add(2 * Math.floor(a / 2)).add(2 * Math.ceil(b / 2));
      return pickOf(more, pick);
    }
    function pickOf(cands, pick = { st: 0, cost: Infinity, fits: false }) {
      const list = [...cands].sort((u, v) => rank(u) - rank(v) || v - u);
      for (const st of list) {
        if (pick.cost === 0 && rank(st) >= score(pick)) break; // nothing farther can win
        // (the list is nearest first, so a spot more covered than the pick cannot win)
        const c = cost(st, pick.cost);
        const r = { st, cost: c, fits: c === 0 && fits(st) };
        if (score(r) < score(pick)) pick = r;
      }
      return pick;
    }
    return { cost, best, me, empty: me.length === 0 };
  }
  const rank = (st) => (st >= 0 ? st : -st * BELOW);
  // a spot's badness: px from the impact (sideways shift + stack), plus CLAMPED when it is held back at the
  // top inset or the bottom edge, plus a lot for any overlap
  const score = (r) => (r.cost > 0 ? 1e6 + r.cost : r.fits ? 0 : CLAMPED) + SIDE * Math.abs(r.dx || 0) + rank(r.st);

  // Pop p's spot { dx, st, cost }: straight above or below its impact when there is a clear one, else
  // the nearest clear one beside whatever is in the way (a crowded short screen), else the least covered.
  function search(p, per = obstacles(p)) {
    const P = plan(p, per, 0);
    if (P.empty) return { dx: 0, st: 0, cost: 0 };
    let pick = { dx: 0, ...P.best() };
    if (pick.cost === 0 && pick.fits) return pick;
    // sideways: just left or right of each obstacle (its widest reach against p's), nearest first
    const side = new Set();
    for (const { tr, obs } of P.me) {
      for (const o of obs) {
        side.add(4 * Math.floor((o.l - GAP - tr.r) / 4));
        side.add(4 * Math.ceil((o.r + GAP - tr.l) / 4));
      }
    }
    for (const dx of [...side].sort((u, v) => Math.abs(u) - Math.abs(v)).slice(0, 10)) {
      if (SIDE * Math.abs(dx) >= score(pick)) break; // nothing farther can win
      const r = { dx, ...plan(p, per, dx).best() };
      if (score(r) < score(pick)) pick = r;
    }
    return pick;
  }

  function spawn(q) {
    // (a pop looking again for room never pushes out a pop that is showing)
    if (q.lookAt !== undefined && !q.force && !pool.some((x) => !x.alive)) {
      waiting.push({ ...q, lookAt: clock + ROOM_LOOK });
      return true;
    }
    let p = pool.find((x) => !x.alive);
    if (!p) {
      // the oldest makes room (a 'keep' pop only when every pop up is one)
      const i = alive.findIndex((x) => !x.keep);
      p = alive.splice(i < 0 ? 0 : i, 1)[0];
      p.alive = false;
    }
    const S = STYLES[q.style] || STYLES.info;
    p.alive = true;
    p.keep = !!q.keep;
    p.x = q.x;
    p.y = q.y;
    p.z = q.z;
    p.style = STYLES[q.style] ? q.style : 'info';
    p.S = S;
    p.age = 0;
    p.life = S.life;
    p.still = rm();
    p.stack = 0;
    p.dx = 0;
    p.wayAt = -1;
    p.wayCost = 0;
    const [a, b] = split(q.text, p.style);
    p.main.textContent = a;
    p.sub.textContent = b;
    p.sub.style.display = b ? '' : 'none';
    const mod = q.mods.map((m) => ` pop-${m}`).join('');
    p.el.className = `pop pop-${p.style}${mod}${p.still ? ' still' : ''}`;
    p.el.style.display = '';
    p.el.style.opacity = '0';
    // measure once (one layout per new pop), then find it a spot that stays clear all its life
    p.w = p.el.offsetWidth;
    p.h = p.el.offsetHeight;
    readLimits();
    const at = project(p);
    p.ax = at.x;
    p.ay = at.y;
    p.ok = at.ok;
    if (at.ok) {
      const r = search(p);
      // no clear spot: wait a moment for one (not an important pop, and not past its wait)
      if (r.cost > 0 && !IMPORTANT.has(p.style) && !q.force && clock - q.at < ROOM_WAIT) {
        p.alive = false;
        p.el.style.display = 'none';
        waiting.push({ ...q, lookAt: clock + ROOM_LOOK });
        return true;
      }
      p.dx = r.dx;
      p.stack = r.st;
    }
    alive.push(p);
    place(p);
    return true;
  }

  // An avoided box that showed up (or grew) after pop p was placed: if it is in p's way now or later,
  // p hops to its best spot when that spot is clearly better (a hop, not a glide: a glide would cross the
  // pops around it).
  function makeWay(p) {
    if (!p.ok || !boxes.length) return;
    const bc = plan(p, obstacles(p, false)).cost(p.stack);
    // nothing in the way; or stuck where it is, and the box no worse than at the last look 0.15 s ago
    if (bc === 0 || (bc <= p.wayCost && clock - p.wayAt < 0.15)) return;
    p.wayAt = clock;
    p.wayCost = bc;
    const per = obstacles(p);
    const was = plan(p, per).cost(p.stack);
    const r = search(p, per);
    if ((r.dx !== p.dx || r.st !== p.stack) && r.cost <= was * 0.7) {
      p.dx = r.dx;
      p.stack = r.st;
      p.wayAt = -1; // moved: look again as soon as a box is in the way there
    }
  }

  function place(p) {
    const at = project(p);
    p.ax = at.x;
    p.ay = at.y;
    p.ok = at.ok;
    if (!at.ok) {
      p.el.style.visibility = 'hidden'; // (and in nobody's way: plan() skips it)
      return;
    }
    p.el.style.visibility = '';
    const { s, rise, rot, o } = pose(p, p.age);
    // keep the whole word on screen (and below the top inset) when its impact is near an edge
    const x = spotX(at.x + p.dx, (p.w * s) / 2);
    const y = spotY(at.y - rise, p.stack, reach((p.w * s) / 2, p.h * s, rot).up);
    p.el.style.opacity = String(clamp(o, 0, 1).toFixed(3));
    p.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${s.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
  }

  function split(text, style) {
    const s = String(text ?? '').slice(0, 60);
    let a = s;
    let b = '';
    const nl = s.indexOf('\n');
    if (nl >= 0) {
      a = s.slice(0, nl).trim();
      b = s.slice(nl + 1).trim();
    } else if (style === 'crit') {
      const m = /^(CRIT!)\s+(.+)$/i.exec(s);
      if (m) {
        a = m[1];
        b = m[2];
      }
    } else if (SPLIT_BANG.has(style)) {
      const m = /^([^!]{1,24}!)\s+(\S.*)$/.exec(s);
      if (m) {
        a = m[1];
        b = m[2];
      }
    }
    return [a, b];
  }

  // A crew count joins the damage pop just made at the same point (still unaged; or still waiting in the
  // queue) as its smaller second line, so one volley shows one word, not two to find room for.
  function joinCrew(q) {
    const same = (a) => a.style === 'dmg' && Math.abs(a.x - q.x) < 1e-6 && Math.abs(a.y - q.y) < 1e-6 && Math.abs(a.z - q.z) < 1e-6;
    for (const list of [waiting, queue]) {
      const w = list.length ? list[list.length - 1] : null;
      if (w && same(w) && !String(w.text).includes('\n')) {
        w.text = `${w.text}\n${q.text}`;
        return true;
      }
    }
    const p = alive.length ? alive[alive.length - 1] : null;
    if (!p || p.age > 0 || !same(p) || p.sub.textContent) return false;
    p.sub.textContent = String(q.text).slice(0, 40);
    p.sub.style.display = '';
    p.w = p.el.offsetWidth;
    p.h = p.el.offsetHeight;
    readLimits();
    if (p.ok) {
      const r = search(p);
      p.dx = r.dx;
      p.stack = r.st;
    }
    place(p);
    return true;
  }

  function retire(p) {
    p.alive = false;
    p.el.style.display = 'none';
    const i = alive.indexOf(p);
    if (i >= 0) alive.splice(i, 1);
  }

  return {
    pop(text, x, y, z, style = 'dmg', mod = '') {
      if (!hasDom || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
      if (text === null || text === undefined || String(text).trim() === '') return false;
      // the mod words: plain lower-case words, at most 3 (anything else adds no class)
      const mods = typeof mod === 'string' ? [...new Set(mod.trim().split(/\s+/))].filter((m) => /^[a-z]{1,16}$/.test(m)).slice(0, 3) : [];
      const q = { text, x, y, z, style: typeof style === 'string' ? style : 'dmg', mods, keep: mods.includes('keep'), at: clock };
      // "−N CREW" right after its volley's damage at the same point: the damage pop's second line
      if (q.style === 'crew' && joinCrew(q)) return true;
      if (tokens >= 1) {
        tokens -= 1;
        return spawn(q);
      }
      // over the rate: wait in the queue (important and 'keep' pops first), dropping the oldest plain one if
      // full (else the oldest important one; never a 'keep' pop: with nothing else to drop, a new 'keep' pop
      // makes the queue longer and any other new pop is dropped)
      if (queue.length >= QUEUE_MAX) {
        let out = queue.findIndex((e) => !vital(e));
        if (out < 0 && !vital(q)) return false;
        if (out < 0) out = queue.findIndex((e) => !e.keep);
        if (out >= 0) queue.splice(out, 1);
        else if (!q.keep) return false;
      }
      if (vital(q)) {
        const firstPlain = queue.findIndex((e) => !vital(e));
        queue.splice(firstPlain < 0 ? queue.length : firstPlain, 0, q);
      } else queue.push(q);
      return true;
    },

    update(dt) {
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
      clock += step;
      tokens = Math.min(RATE, tokens + RATE * step);
      while (queue.length && (clock - queue[0].at > QUEUE_AGE || tokens >= 1)) {
        const q = queue.shift();
        if (clock - q.at > QUEUE_AGE) {
          // stale: its moment has passed (a 'keep' pop shows anyway, late rather than never)
          if (q.keep) spawn(q);
          continue;
        }
        tokens -= 1;
        spawn(q);
      }
      for (let i = alive.length - 1; i >= 0; i--) {
        const p = alive[i];
        p.age += step;
        if (p.age >= p.life) retire(p);
      }
      // pops waiting for room look again (after the old ones have moved on); past their wait they show, or go
      if (step > 0 && waiting.length) {
        const due = waiting.filter((w) => clock >= w.lookAt);
        for (const w of due) {
          waiting.splice(waiting.indexOf(w), 1);
          if (clock - w.at >= ROOM_WAIT) {
            if (DROPPABLE.has(w.style) && !w.keep) continue;
            w.force = true;
          }
          spawn(w);
        }
      }
      if (!alive.length) return;
      readLimits();
      if (step > 0) for (const p of alive) makeWay(p); // (paused: nothing moves)
      for (const p of alive) place(p);
    },

    clear() {
      for (const p of [...alive]) retire(p);
      queue.length = 0;
      waiting.length = 0;
      tokens = RATE;
    },

    get count() {
      return alive.length;
    },
  };
}
