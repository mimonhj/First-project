// The construction scene's timeline (SPEC4 §5.2): for every build and upgrade on the island's 21 plots, the
// builders push their cart in and the house goes up in stages (foundation or scaffold, frame, walls, roof, finishing
// touches) and its people move in. 9.4 s for a new building, 7.0 s for an upgrade, 5.0 s under reduced motion (four
// stills and three crossfades: derived from `still` and `fade`, never a number of its own); skippable.
//
// Pure: imports nothing (the Node tests load it as a data: URL). The 3D scene is env/construction.js's, the strip,
// keys, taps and camera townMode's and town.js's; they all read the stage, the captions and the cues from here, so
// every screen says the same thing at the same moment.
//
// STAGES (ids builders, foundation / scaffold, frame, walls, roof, finish, movingIn), SCENE,
// sceneLength(kind, reduced) -> s, stageAt(t, kind, reduced) -> { stage, index, k, caption, pips, done },
// cueAt(t0, t1, kind, reduced) -> [{ at, sfx | event }] (each cue fired exactly once however the frames fall)
// and the helpers cameraAt(t, kind, reduced) -> { glide, orbit } and builtLine(name, movers) -> the last caption.
//
// kind is 'new' (a plot's first tier: the old shack folds into the cart and a foundation is laid) or 'upgrade' (a
// scaffold goes up round the old building and its roof lifts away); anything else counts as 'new'. reduced: the
// player's reduced-motion setting (true / false). Times are scene seconds from 0 (the scene's start) to
// sceneLength(kind, reduced) (its end state); outside that range they are clamped.

// ---------------------------------------------------------------------------------------- helpers

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const kindOf = (kind) => (kind === 'upgrade' ? 'upgrade' : 'new');
const time = (t) => (typeof t === 'number' && !Number.isNaN(t) ? t : 0);
// Six decimals: the derived lengths stay exact numbers (4 × 1.1 + 3 × 0.2 is 5.000000000000001 in floating point).
const tidy = (v) => Math.round(v * 1e6) / 1e6;

// ---------------------------------------------------------------------------------------- the tables

const still = 1.1;
const fade = 0.2;
/**
 * §5.2: new 9.4 s, upgrade 7.0 s; skip: the jump to the end state takes 0.3 s and then the inhabitants wave from the
 * porch for skipWave s (one cheer); reduced motion: four stills of `still` s with three crossfades of `fade` s (no fade
 * before the first still, which starts on a cut), so `reduced` = 4 × still + 3 × fade = 5.0 s, derived here; glide:
 * the camera's glide onto the plot (s; a cut under reduced motion); orbit: the slow orbit's half-swing round the pad
 * (degrees; none under reduced motion); confetti: the most bits in the moving-in puff.
 */
export const SCENE = freeze({ new: 9.4, upgrade: 7.0, skip: 0.3, still, fade, orbit: 10, reduced: tidy(4 * still + 3 * fade), glide: 0.9, skipWave: 1, confetti: 40 });

/** The strip's pips: six, one filled per stage done (stage 0 "Builders, ho!" shows none, "Walls" three). */
export const PIPS = 6;

/**
 * §5.2's seven stages in order. Each: index, id (an upgrade's stage 1 is `scaffold`, `upId`), the strip pill's name
 * (`upName`), the caption read by #build-live (`upCaption`), its span in a new building and in an upgrade
 * (`new` / `upgrade`: [from, to] s, contiguous from 0 to the scene's length), and its cues: [u, sfx | null, event |
 * null] with u the cue's place in the stage (0 < u ≤ 1; `upCues` for the upgrade where they differ). Events name what
 * env/construction.js shows at that moment (a stone block dropping, a post popping up, the paint wipe…).
 */
const C = (u, sfx, event = null, extra = {}) => ({ u, sfx, event, ...extra });
export const STAGES = freeze([
  {
    index: 0, id: 'builders', upId: 'builders', name: 'Builders, ho!', upName: 'Builders, ho!',
    caption: 'Builders on the way!', upCaption: 'Builders on the way!',
    new: [0, 1.0], upgrade: [0, 0.8],
    // the camera glides in, Bess whistles, Chip, Mortar and Dab push the plank cart in; the blueprint appears
    cues: [C(0.04, 'whistle', 'glide'), C(0.2, 'step', 'cart'), C(0.4, 'crate'), C(0.55, null, 'blueprint'), C(0.7, 'step')],
  },
  {
    index: 1, id: 'foundation', upId: 'scaffold', name: 'Foundation', upName: 'Scaffold',
    caption: 'Laying the foundation!', upCaption: 'Up goes the scaffold!',
    new: [1.0, 2.2], upgrade: [0.8, 1.2],
    // new: the old shack's roof lifts off and it folds flat into the cart ("poof"); six stone blocks drop into a chalk
    // outline, each with a dust puff
    cues: [C(0.05, null, 'roofLift'), C(0.25, 'pop', 'shackFold'), ...[0, 1, 2, 3, 4, 5].map((i) => C(0.38 + i * 0.11, 'thud', 'block', { i }))],
    // upgrade: a yellow scaffold pops up round the old building and its roof lifts away
    upCues: [C(0.1, 'tok', 'scaffoldUp'), C(0.6, 'tok', 'roofLift')],
  },
  {
    index: 2, id: 'frame', upId: 'frame', name: 'Frame', upName: 'Frame',
    caption: 'Putting up the frame!', upCaption: 'Putting up the frame!',
    new: [2.2, 3.8], upgrade: [1.2, 2.2],
    // corner posts pop up one by one, beams snap across, the ladder goes up and Chip climbs it
    cues: [
      ...[0, 1, 2, 3].map((i) => C(0.08 + i * 0.11, 'tok', 'post', { i })),
      ...[0, 1, 2, 3].map((i) => C(0.54 + i * 0.1, 'tok', 'beam', { i })),
      C(0.92, null, 'ladder'),
    ],
  },
  {
    index: 3, id: 'walls', upId: 'walls', name: 'Walls', upName: 'Walls',
    caption: 'Raising the walls!', upCaption: 'Raising the walls!',
    new: [3.8, 5.4], upgrade: [2.2, 3.6],
    // the cut line sweeps up from the floor to the eaves with its plank band and sawdust
    cues: [C(0.03, 'saw', 'cut'), C(0.4, 'tok'), C(0.75, 'tok')],
  },
  {
    index: 4, id: 'roof', upId: 'roof', name: 'Roof', upName: 'Roof',
    caption: 'Putting on the roof!', upCaption: 'Putting on the roof!',
    new: [5.4, 6.6], upgrade: [3.6, 4.6],
    // the cut climbs from the eaves to the top in four tile bands; the chimney or vane pops on last with a squash
    cues: [...[0, 1, 2, 3].map((i) => C(0.08 + i * 0.19, 'clack', 'tiles', { i })), C(0.92, 'pop', 'topper')],
  },
  {
    index: 5, id: 'finish', upId: 'finish', name: 'Finishing touches', upName: 'Finishing touches',
    caption: 'Finishing touches!', upCaption: 'Finishing touches!',
    new: [6.6, 7.8], upgrade: [4.6, 5.6],
    // Dab's paint sweeps the walls; windows light; flower boxes, the sign and the vane pop in with sparkles; the
    // scaffold folds down; bunting unfurls
    cues: [C(0.04, 'brush', 'paint'), C(0.35, 'chime', 'lights'), C(0.6, 'chime', 'sparkle'), C(0.75, null, 'scaffoldDown'), C(0.85, 'chime', 'bunting')],
  },
  {
    index: 6, id: 'movingIn', upId: 'movingIn', name: 'Moving in', upName: 'Moving in',
    caption: 'Moving in!', upCaption: 'Moving in!',
    new: [7.8, 9.4], upgrade: [5.6, 7.0],
    // the door opens; the new inhabitants step out and wave ("Thank you, Captain!"); confetti; everyone cheers
    cues: [C(0.06, 'door', 'door'), C(0.25, null, 'out'), C(0.5, 'cheer', 'wave'), C(0.56, 'tada', 'confetti'), C(0.85, null, 'thanks')],
  },
]);

/**
 * Reduced motion (§5.2): four stills, each the end state of the stages it covers (foundation or scaffold, the
 * frame, the walls and the roof, done), held `still` s with a `fade` s crossfade before the second, third and
 * fourth; the same sounds (each covered stage's cues, in order, inside its still; the glide, the cart ride and the
 * confetti keep only their sounds) and one caption a still (`shows`: the stage whose end the still pictures).
 */
export const STILLS = freeze([
  { stages: [0, 1], shows: 1 },
  { stages: [2], shows: 2 },
  { stages: [3, 4], shows: 4 },
  { stages: [5, 6], shows: 6 },
]);

// ---------------------------------------------------------------------------------------- the timeline

/** How long a scene lasts: 'new' 9.4 s, 'upgrade' 7.0 s, reduced motion 5.0 s (either kind). */
export function sceneLength(kind, reduced) {
  if (reduced === true) return SCENE.reduced;
  return kindOf(kind) === 'upgrade' ? SCENE.upgrade : SCENE.new;
}

const stageId = (st, kind) => (kind === 'upgrade' ? st.upId : st.id);
const stageName = (st, kind) => (kind === 'upgrade' ? st.upName : st.name);
const stageCaption = (st, kind) => (kind === 'upgrade' ? st.upCaption : st.caption);
const stageCues = (st, kind) => (kind === 'upgrade' && st.upCues ? st.upCues : st.cues);
// Still i's window: [start, start + still], with its crossfade (none for the first) just before it.
const stillStart = (i) => tidy(i * (SCENE.still + SCENE.fade));

/**
 * The scene at time t: { stage (its id), index (0..6), name (the strip pill's word), k (0..1 through the stage, or
 * through the still under reduced motion), caption, pips (filled, 0..PIPS), done (t has reached the end state) };
 * under reduced motion also still (0..3) and fade (0..1: the crossfade into this still, 1 once it has finished; the
 * first still starts on a cut, fade 1).
 */
export function stageAt(t, kind, reduced) {
  const kd = kindOf(kind);
  const L = sceneLength(kd, reduced);
  const tt = clamp(time(t), 0, L);
  const done = time(t) >= L;
  if (reduced === true) {
    let i = 0;
    for (let j = 1; j < STILLS.length; j++) if (tt >= stillStart(j) - SCENE.fade) i = j;
    const st = STAGES[STILLS[i].shows];
    const s0 = stillStart(i);
    const f = i === 0 ? 1 : clamp((tt - (s0 - SCENE.fade)) / SCENE.fade, 0, 1);
    const k = done ? 1 : clamp((tt - s0) / SCENE.still, 0, 1);
    return { stage: stageId(st, kd), index: st.index, name: stageName(st, kd), k, caption: stageCaption(st, kd), pips: st.index, done, still: i, fade: f };
  }
  let st = STAGES[0];
  for (const s of STAGES) if (tt >= s[kd][0]) st = s;
  const [a, b] = st[kd];
  const k = done ? 1 : clamp((tt - a) / (b - a), 0, 1);
  return { stage: stageId(st, kd), index: st.index, name: stageName(st, kd), k, caption: stageCaption(st, kd), pips: st.index, done };
}

// Motion the reduced scene leaves out (§5.2: no glide, no flying confetti, the builders already stand at the plot):
// those cues keep their sounds only.
const STILL_ONLY = new Set(['glide', 'cart', 'confetti']);

// Every cue of a scene, in time order: [{ at, sfx? , event?, stage, i? }]. A stage's start is an event of its own
// ('stage', with its caption), as are the stills' under reduced motion.
const CUES = {};
function cuesOf(kd, reduced) {
  const key = `${kd}:${reduced === true}`;
  if (CUES[key]) return CUES[key];
  const out = [];
  const push = (at, c, st) => {
    const q = { at: tidy(at), stage: stageId(st, kd) };
    if (c.sfx) q.sfx = c.sfx;
    if (c.event) q.event = c.event;
    if (c.i !== undefined) q.i = c.i;
    if (c.caption !== undefined) q.caption = c.caption;
    out.push(q);
  };
  if (reduced === true) {
    STILLS.forEach((sl, i) => {
      const s0 = stillStart(i);
      const shows = STAGES[sl.shows];
      // the still's caption as it cuts or finishes fading in (the first at a hair past 0, so (t0, t1] always holds it)
      push(i === 0 ? 0.001 : s0, { event: 'still', caption: stageCaption(shows, kd), i }, shows);
      // the covered stages' cues, in order, squeezed into the first 80 % of the still
      const span = sl.stages.reduce((n, j) => n + (STAGES[j][kd][1] - STAGES[j][kd][0]), 0);
      let off = 0;
      for (const j of sl.stages) {
        const st = STAGES[j];
        const len = st[kd][1] - st[kd][0];
        for (const c of stageCues(st, kd)) {
          const q = STILL_ONLY.has(c.event) ? { ...c, event: null } : c; // no glide, cart ride or confetti: the sound only
          push(s0 + 0.002 + ((off + c.u * len) / span) * SCENE.still * 0.8, q, st);
        }
        off += len;
      }
    });
  } else {
    for (const st of STAGES) {
      const [a, b] = st[kd];
      push(st.index === 0 ? 0.001 : a, { event: 'stage', caption: stageCaption(st, kd) }, st);
      for (const c of stageCues(st, kd)) push(a + c.u * (b - a), c, st);
    }
  }
  out.sort((p, q) => p.at - q.at);
  CUES[key] = freeze(out);
  return CUES[key];
}

/**
 * The sounds and events between scene times t0 (excluded) and t1 (included), in time order: [{ at, sfx?, event?,
 * stage, i?, caption? }]. Every cue lies in (0, sceneLength], so stepping a scene from 0 to its end in frames of any
 * size (cueAt(0, t1), cueAt(t1, t2), …) fires each one exactly once. Events: 'stage' (a stage starts; its caption),
 * 'still' (reduced motion: a still starts; its caption), and what the scene shows: 'glide', 'cart', 'blueprint',
 * 'roofLift', 'shackFold', 'block' (i 0..5), 'scaffoldUp', 'post' / 'beam' (i 0..3), 'ladder', 'cut', 'tiles' (i 0..3),
 * 'topper', 'paint', 'lights', 'sparkle', 'scaffoldDown', 'bunting', 'door', 'out', 'wave', 'confetti', 'thanks'.
 * Sounds are audio.js SFX names (§11.1: whistle step crate pop thud tok saw clack brush chime door cheer tada).
 */
export function cueAt(t0, t1, kind, reduced) {
  const a = time(t0);
  const b = time(t1);
  if (!(b > a)) return [];
  const out = [];
  for (const c of cuesOf(kindOf(kind), reduced)) if (c.at > a && c.at <= b) out.push({ ...c });
  return out;
}

/**
 * The camera's timeline (§5.2): glide 0..1 over the first SCENE.glide s (1 at once under reduced motion: a cut), then
 * a slow orbit of ±SCENE.orbit degrees round the pad (orbit: radians, 0 at the glide's end and under reduced motion).
 */
export function cameraAt(t, kind, reduced) {
  if (reduced === true) return { glide: 1, orbit: 0 };
  const L = sceneLength(kind, false);
  const tt = clamp(time(t), 0, L);
  const glide = clamp(tt / SCENE.glide, 0, 1);
  const u = clamp((tt - SCENE.glide) / Math.max(1e-6, L - SCENE.glide), 0, 1);
  return { glide, orbit: (SCENE.orbit * Math.PI) / 180 * Math.sin(u * Math.PI * 2) };
}

/**
 * The scene's last caption (§5.2, #build-live): "Treehouse built! Granny Wren, Kip and Coco moved in." from the
 * building's name and who moves in (islanders.js movesIn: its people and animals, by name); with nobody moving in,
 * just "Treehouse built!".
 */
export function builtLine(name, movers) {
  const n = typeof name === 'string' && name.trim() ? name.trim() : 'Your building';
  const who = (Array.isArray(movers) ? movers : []).filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim());
  if (!who.length) return `${n} built!`;
  const list = who.length === 1 ? who[0] : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`;
  return `${n} built! ${list} moved in.`;
}
