import * as THREE from 'three';

// Pop words over the 3D view (SPEC2 §2.5, §5.3): "17", "STERN RAKE ×2!", "CRIT! MAST DOWN!", "−3 CREW",
// "CAPTURED! +145". Each pop is a recycled DOM span in the #pops layer, anchored to a world point and
// projected every frame, so it costs 0 draw calls. ≥ 24 px light text with a 3 px ink outline (fx.css).
//
// createPops(layerEl, camera, { reducedMotion }) → {
//   pop(text, x, y, z, style) → boolean,   // style: 'dmg' | 'rake' | 'crit' | 'crew' | 'info' | 'capture'
//                                           //        | 'gold' | 'bad'; a '\n' (or "CRIT! <effect>") splits
//                                           //        the text into a big line and a smaller second line
//   update(dt),   // ages, moves and fades the pops (dt in seconds; 0 while paused freezes them)
//   clear(), get count /* pops alive */
// }
// reducedMotion: a boolean or a function returning one (read at each pop): the pop only fades in and
// out, no rise, no bounce, no wobble.
// Throttle: ≤ 12 alive (the oldest makes room), ≤ 8 new per second; a pop over the rate waits up to
// 0.4 s in a short queue (CAPTURED!, CRIT!, gold and bad news jump it) and is dropped if it is still waiting then.

const MAX_ALIVE = 12;
const RATE = 8; // new pops per second
const QUEUE_MAX = 8;
const QUEUE_AGE = 0.4;
const IMPORTANT = new Set(['capture', 'crit', 'bad', 'gold']);

// Per style: life (s), rise (px over the life; the same for the styles that stack on one impact, so a
// stack keeps its spacing), overshoot of the pop-in and entry wobble (deg).
const STYLES = {
  dmg: { life: 1.0, rise: 50, pop: 1.3, wobble: 0 },
  rake: { life: 1.25, rise: 50, pop: 1.25, wobble: -6 },
  crit: { life: 1.35, rise: 50, pop: 1.45, wobble: 9 },
  crew: { life: 1.15, rise: 50, pop: 1.2, wobble: 0 },
  info: { life: 0.95, rise: 50, pop: 1.15, wobble: 0 },
  capture: { life: 2.0, rise: 60, pop: 1.5, wobble: -5 },
  gold: { life: 1.4, rise: 56, pop: 1.25, wobble: 0 },
  bad: { life: 1.5, rise: 50, pop: 1.2, wobble: 0 },
};
const EDGE = 6; // px kept clear at the screen edges (a pop near the edge slides in instead of being cut off)
const INK_PAD = 6; // the outline and drop shadow reach this far outside a pop's line box

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

export function createPops(layerEl, camera, { reducedMotion = false } = {}) {
  const rm = typeof reducedMotion === 'function' ? () => !!reducedMotion() : () => !!reducedMotion;
  const hasDom = !!layerEl && typeof document !== 'undefined';
  if (hasDom) layerEl.classList.remove('hidden');

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
    pool.push({ el, main, sub, alive: false, x: 0, y: 0, z: 0, style: 'dmg', S: STYLES.dmg, age: 0, life: 1, still: false, stack: 0, cx: 0, cy: 0, w: 0, h: 0 });
  }
  const alive = []; // oldest first
  const queue = [];
  let tokens = RATE;
  let clock = 0;

  function project(p) {
    _v.set(p.x, p.y, p.z).project(camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, ok: _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15 };
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
    }
    return [a, b];
  }

  function spawn(q) {
    let p = pool.find((x) => !x.alive);
    if (!p) {
      p = alive.shift(); // the oldest makes room
      p.alive = false;
    }
    const S = STYLES[q.style] || STYLES.info;
    p.alive = true;
    p.x = q.x;
    p.y = q.y;
    p.z = q.z;
    p.style = STYLES[q.style] ? q.style : 'info';
    p.S = S;
    p.age = 0;
    p.life = S.life;
    p.still = rm();
    const [a, b] = split(q.text, p.style);
    p.main.textContent = a;
    p.sub.textContent = b;
    p.sub.style.display = b ? '' : 'none';
    p.el.className = `pop pop-${p.style}${p.still ? ' still' : ''}`;
    p.el.style.display = '';
    p.el.style.opacity = '0';
    // measure once (one layout per new pop), then find it a free spot: right at its impact if nothing
    // young is in the way, else the nearest place just above (or, when that would run off the top of a
    // short screen, just below) the pops already there
    p.w = p.el.offsetWidth;
    p.h = p.el.offsetHeight;
    const at = project(p);
    const busy = [];
    for (const o of alive) {
      if (o.age > 0.6 || Math.abs(o.cx - at.x) > (o.w + p.w) / 2 + 4) continue;
      busy.push([o.cy - o.h - INK_PAD, o.cy + INK_PAD]); // its box as it is on screen now
    }
    const free = (st) => busy.every(([t, b]) => at.y - st <= t || at.y - st - p.h >= b);
    const fits = (st) => at.y - st - p.h - p.S.rise >= EDGE && at.y - st <= window.innerHeight - EDGE;
    const cands = [0];
    for (const [t, b] of busy) cands.push(at.y - t, at.y - p.h - b);
    const ok = cands.filter(free).sort((u, v) => Math.abs(u) - Math.abs(v) || v - u);
    p.stack = ok.find(fits) ?? ok[0] ?? 0;
    alive.push(p);
    place(p);
    return true;
  }

  function place(p) {
    const at = project(p);
    if (!at.ok) {
      p.el.style.visibility = 'hidden';
      p.cx = -1e9; // off screen: in nobody's way
      return;
    }
    p.el.style.visibility = '';
    const k = p.age / p.life;
    let s = 1;
    let rise = 0;
    let rot = 0;
    let o;
    if (p.still) {
      // reduced motion: fade in, hold, fade out; nothing moves
      o = p.age < 0.12 ? p.age / 0.12 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    } else {
      s = popScale(p.age, 0.22, p.S.pop);
      rise = p.S.rise * easeOut(k);
      rot = p.S.wobble * Math.max(0, 1 - p.age / 0.3) * Math.cos(p.age * 30);
      o = p.age < 0.05 ? p.age / 0.05 : k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
    }
    // keep the whole word on screen when its impact is near an edge
    const W = window.innerWidth;
    const H = window.innerHeight;
    const hw = (p.w * s) / 2;
    const x = W > 2 * (hw + EDGE) ? clamp(at.x, hw + EDGE, W - hw - EDGE) : W / 2;
    const y = Math.min(Math.max(at.y - rise - p.stack, p.h * s + EDGE), H - EDGE);
    p.cx = x;
    p.cy = y;
    p.el.style.opacity = String(clamp(o, 0, 1).toFixed(3));
    p.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${s.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
  }

  function retire(p) {
    p.alive = false;
    p.el.style.display = 'none';
    const i = alive.indexOf(p);
    if (i >= 0) alive.splice(i, 1);
  }

  return {
    pop(text, x, y, z, style = 'dmg') {
      if (!hasDom || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
      if (text === null || text === undefined || String(text).trim() === '') return false;
      const q = { text, x, y, z, style: typeof style === 'string' ? style : 'dmg', at: clock };
      if (tokens >= 1) {
        tokens -= 1;
        return spawn(q);
      }
      // over the rate: wait in the queue (important pops first), dropping the oldest plain one if full
      if (queue.length >= QUEUE_MAX) {
        const plain = queue.findIndex((e) => !IMPORTANT.has(e.style));
        if (plain < 0 && !IMPORTANT.has(q.style)) return false;
        queue.splice(plain >= 0 ? plain : 0, 1);
      }
      if (IMPORTANT.has(q.style)) {
        const firstPlain = queue.findIndex((e) => !IMPORTANT.has(e.style));
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
        if (clock - q.at > QUEUE_AGE) continue; // stale: its moment has passed
        tokens -= 1;
        spawn(q);
      }
      for (let i = alive.length - 1; i >= 0; i--) {
        const p = alive[i];
        p.age += step;
        if (p.age >= p.life) retire(p);
      }
      for (const p of alive) place(p);
    },

    clear() {
      for (const p of [...alive]) retire(p);
      queue.length = 0;
      tokens = RATE;
    },

    get count() {
      return alive.length;
    },
  };
}
