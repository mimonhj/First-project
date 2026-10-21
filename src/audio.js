// Sound for Pirates Ahoy!: sound effects, ambience beds and music, played with the Web Audio API.
// Recorded tracks (made with ElevenLabs, see RECORDED and tools/audio/) are used where there is one; everything
// else, and anything whose file has not arrived, is synthesised live (no libraries).
//
//   const audio = createAudio();
//   addEventListener('pointerdown', () => audio.unlock()); // sound may only start after a user gesture
//   audio.setScene('europe');                               // crossfades music + ambience (SCENE_NAMES)
//   const h = audio.play('bombWhistle', { distance: 12, pan: -0.3 });
//   h.stop();                                               // every play() returns { stop(fade), set(opts) }
//
// Every method is a safe no-op before unlock() and when Web Audio is missing. play() is also refused while
// the context cannot run (autoplay-blocked, an iOS interruption, muted, hidden tab), so nothing stockpiles
// on a frozen clock; a hidden tab suspends the context and the clock (no backlog on return).
//
// Recordings: the files are fetched from the start (the title-screen music and the effects first), and decoded
// once there is an AudioContext. A scene whose recording is still on its way waits for it (MUSIC_WAIT) before
// falling back to the synthesised tune, and switches over if it arrives later. Only the current and the previous
// scene's music stay decoded (a minute of decoded stereo is ~23 MB). Add ?audio=synth to the URL for the
// synthesised soundtrack only.
//
// Signal flow:
//   one-shot voice: sound → gain (volume × distance) → low-pass (distance) → panner → sfx bus ──────┐
//   scene: instrument buses (panned, reverb sends) → music fade → music bus (volume) → duck ────────┤→ sum → high-pass
//          ambience beds + random events → ambience fade → ambience bus ───────────────────────────┤  → compressor
//   shared reverb (convolver) ←── music / fanfare sends ────────────────────────────────────────────┘  → soft clipper
//                                                                                                       → mute → out
// Fanfares (levelClear / victory / defeat / capture) duck the music while they play; stingers never stack.
//
// Music is sequenced with a lookahead scheduler: a timer (and update()) tops up
// the next LOOKAHEAD seconds, but every note time is computed from the
// AudioContext clock as start + step × stepDuration, so loops never drift and
// wrap seamlessly. Short-lived nodes are tracked per voice and disconnected
// once their scheduled end has passed.

const MUTE_KEY = 'pirates-ahoy-muted';
const LOOKAHEAD = 0.5; // seconds of music scheduled ahead of the clock (covers main-thread stalls)
const TICK_MS = 50; // scheduler timer period (timing comes from the audio clock, not this)
const MAX_DIST = 150; // world units: one-shots are silent beyond this
const MAX_SFX = 40; // simultaneous one-shot voices
// Simultaneous voices per sound (the oldest is not cut; new ones are skipped past the cap).
const SFX_CAP = {
  cannon: 10, splash: 8, hit: 8, coin: 6, bombWhistle: 6, bombBoom: 4, sink: 4, reef: 2, sailUp: 2, sailDown: 2, click: 4,
  grapple: 3, heave: 3, clash: 6, cheer: 2, crit: 3, rake: 3, chain: 6, grape: 6, cut: 3, crunch: 3, thunder: 2, step: 4,
  overboard: 4, ghost: 2,
  ignite: 4, crackle: 2, sizzle: 3, freeze: 4, stink: 4, blast: 2, clang: 4, ram: 3, mortar: 3, fuse: 3, spout: 3, horn: 1,
  rogue: 2, surf: 2, ink: 3, krakenRise: 1, slam: 4, grab: 2, gurgle: 1, sneeze: 1, bell: 2, bonk: 2, squawk: 2, build: 1,
  crate: 2, tentacle: 4, geyser: 4,
};
// Loops (a burning ship's crackle, a waterspout's wind) are started even out of earshot, so the handle's
// set({ distance }) can bring them in as you sail closer.
const LOOPS = { crackle: true, spout: true };
// Stingers: one at a time (a new one replaces the old); the fanfares also duck the music while they play.
const STINGER = { wave: 0, levelClear: 2.4, victory: 6.9, defeat: 3.6, capture: 1.5 };
const LEVEL = { sfx: 0.85, music: 0.5, amb: 0.75, verb: 0.9 };
// Per-sound and per-scene trims, balanced with K-weighted loudness measurements of offline renders.
const SFX_GAIN = {
  cannon: 1.8, splash: 1.4, hit: 2.1, sink: 1.4, coin: 1.3, bombWhistle: 0.4, bombBoom: 1.2, wave: 0.47,
  levelClear: 0.45, victory: 0.52, defeat: 0.42, click: 4, reef: 1.4, sailUp: 1.4, sailDown: 1.8,
  grapple: 1.14, heave: 0.82, clash: 1.77, cheer: 0.52, capture: 0.5, crit: 1.52, rake: 1.34, chain: 1.06, grape: 2.5,
  cut: 2.09, crunch: 1.43, thunder: 1.56, step: 1.95, overboard: 0.6, ghost: 0.3,
  // The Kraken Seas, set against those (momentary-max loudness at distance 0) and for where each is heard: the mortar,
  // the ink pot, the fuse and the ram from their ship (25-45 u off), the Kraken's rise, sneeze and gurgle from where it
  // is, the rest close by.
  ignite: 1.2, crackle: 1, sizzle: 0.5, freeze: 0.64, stink: 0.62, blast: 0.6, clang: 1.45, ram: 2.5, mortar: 2.6, fuse: 0.83,
  spout: 0.84, horn: 0.61, rogue: 0.44, surf: 0.71, ink: 1.8, krakenRise: 1.26, slam: 1.2, grab: 0.8, gurgle: 1.6, sneeze: 1.4,
  bell: 1.38, bonk: 0.52, squawk: 1.76, build: 1.05, crate: 1.8, tentacle: 1.35, geyser: 1,
};
const SCENE_GAIN = {
  menu: { music: 0.95, amb: 1.3 },
  dock: { music: 0.95, amb: 1.3 },
  europe: { music: 1.5, amb: 1 },
  bali: { music: 1.3, amb: 1.3 },
  volcano: { music: 0.6, amb: 0.75 },
  doubloon: { music: 0.88, amb: 1.19 },
  frost: { music: 1.32, amb: 1.37 },
  maelstrom: { music: 0.99, amb: 0.62 },
  town: { music: 0.95, amb: 1.4 }, // the title tune at the title's level, so carrying it over never jumps
  atolls: { music: 1.13, amb: 1.17 },
  cape: { music: 1.12, amb: 0.91 },
  deep: { music: 1.55, amb: 1.84 }, // a quiet night: a little under the other levels
  kraken: { music: 0.85, amb: 1.32 }, // the theme a touch over them; its dread drone 4 LU under the theme
  quiz: { music: 0.95, amb: 1.4 }, // the town's levels: walking up to the Riddle Bell changes nothing you can hear
};

export const SFX_NAMES = [
  'cannon', 'splash', 'hit', 'sink', 'coin', 'bombWhistle', 'bombBoom', 'wave',
  'levelClear', 'victory', 'defeat', 'click', 'reef', 'sailUp', 'sailDown',
  // Boarders Away!: boarding, the new shot, crits and rakes, Act II hazards, the town.
  'grapple', 'heave', 'clash', 'cheer', 'capture', 'crit', 'rake', 'chain', 'grape', 'cut', 'crunch', 'thunder', 'step',
  'overboard', 'ghost',
  // The Kraken Seas: Fire, Frost and Stink shot, the new ships, Voyage III's hazards, the Kraken, the Riddle Bell,
  // building the island, powder crates. `tentacle` (the Kraken's warning) and `geyser` (L9's sea geysers) are the
  // two telegraph sounds §5.3 and §5.7.3 describe but §11.1's list leaves unnamed.
  'ignite', 'crackle', 'sizzle', 'freeze', 'stink', 'blast', 'clang', 'ram', 'mortar', 'fuse', 'spout', 'horn', 'rogue',
  'surf', 'ink', 'krakenRise', 'slam', 'grab', 'gurgle', 'sneeze', 'bell', 'bonk', 'squawk', 'build', 'crate',
  'tentacle', 'geyser',
];
export const SCENE_NAMES = ['menu', 'dock', 'europe', 'bali', 'volcano', 'doubloon', 'frost', 'maelstrom', 'town', 'atolls', 'cape', 'deep', 'kraken', 'quiz'];
// Scenes that play another scene's music: ashore on Sparrow's Floating Island you hear the title-screen tune (its
// recording too, when there is one) over the harbour, and at Professor Barnacle's Riddle Bell too. Going between two
// scenes that share their music carries it on from where it is instead of starting it again.
const MUSIC_OF = { town: 'menu', quiz: 'menu' };
const musicOf = (scene) => MUSIC_OF[scene] || scene;
// The synthesised tune each scene plays, where it is another scene's (the shipyard's own tune is a recording).
const TUNE_OF = { dock: 'menu', town: 'menu', quiz: 'menu' };
const tuneOf = (scene) => TUNE_OF[scene] || scene;

// Recorded audio in assets/audio/ (generated with ElevenLabs; tools/audio/assets.json has the prompts and the cuts).
// music: a seamless loop per scene. amb: a looping ambience bed per scene (replaces the synthesised one).
// sfx: one-shots and fanfares, by sound name. gain: level trim, set so each recording is as loud as the
// synthesised version it replaces (measured on offline renders through the same mix, see tests/audio.cjs).
// duck: seconds a fanfare holds the music down. frames: a loop's exact length in samples at 48 kHz (build.py prints
// it), so decoder padding can be cut off. Anything not listed here is synthesised.
export const RECORDED = {
  music: {
    menu: { file: 'music-menu.mp3', gain: 0.489, frames: 2880107 },
    dock: { file: 'music-dock.mp3', gain: 0.483, frames: 2303712 },
    europe: { file: 'music-europe.mp3', gain: 0.29, frames: 3575076 },
    volcano: { file: 'music-volcano.mp3', gain: 0.658, frames: 3839872 },
  },
  amb: {},
  sfx: {
    levelClear: { file: 'stinger-level-clear.mp3', gain: 0.8, duck: 2.9 },
  },
};
const ASSET_DIR = new URL('../assets/audio/', import.meta.url);
const MUSIC_WAIT = 2; // seconds a scene waits, silent, for its recorded music before playing the synthesised tune
const KEEP_MUSIC = 2; // decoded music tracks kept (the current scene's and the one it crossfades from)
// Per-shot pitch variation (±) for recorded one-shots that repeat a lot.
const VARY = { cannon: 0.04, splash: 0.05, hit: 0.05, sink: 0.03, bombBoom: 0.04, reef: 0.04, sailUp: 0.03, sailDown: 0.03 };

// Every recording as { key: 'music:menu' | 'amb:bali' | 'sfx:cannon', name, kind, file, gain, duck }.
const RECORDINGS = [];
for (const kind of ['music', 'amb', 'sfx']) {
  for (const [name, r] of Object.entries(RECORDED[kind])) RECORDINGS.push({ key: `${kind}:${name}`, name, kind, ...r });
}

const NOOP_HANDLE = Object.freeze({ stop() {}, set() {} });
const EMPTY = Object.freeze({});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(m) {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    // Storage blocked: the setting just won't persist.
  }
}

// Loudness falls off with distance (≈ -6 dB at 30 units) and fades out completely by MAX_DIST.
function distGain(d) {
  if (!(d > 0)) return 1;
  if (d >= MAX_DIST) return 0;
  const edge = d > 110 ? 0.5 + 0.5 * Math.cos((Math.PI * (d - 110)) / (MAX_DIST - 110)) : 1;
  return edge / (1 + Math.pow(d / 30, 1.3));
}

// Far sounds lose their highs.
function distCutoff(d) {
  return Math.max(500, 20000 * Math.exp(-(d > 0 ? d : 0) / 35));
}

// ---------------------------------------------------------------------------
// Recordings: fetching and decoding
// ---------------------------------------------------------------------------
// The compressed files, fetched once per page (a few MB in all) and kept, so a dropped track can be decoded again.
const fileCache = new Map();
function fetchRecording(file) {
  if (!fileCache.has(file)) {
    fileCache.set(
      file,
      fetch(new URL(file, ASSET_DIR)).then((res) => {
        if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
        return res.arrayBuffer();
      }),
    );
  }
  return fileCache.get(file);
}

// decodeAudioData detaches the bytes it is given, so it gets a copy. Older Safari only has the callback form.
function decodeRecording(ctx, bytes) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(bytes.slice(0), resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

// Chromium and Firefox decode these MP3s to their exact length (they read the encoder's gapless info). A decoder
// that does not also returns the encoder's priming at the start (encoder delay 576 + decoder delay 529 samples:
// low-level pre-echo, not silence) and padding at the end, which would put a dropout in a loop. Loops know their
// exact length (`frames` at 48 kHz), so anything beyond it is cut: the priming from the start, the rest from the end.
const PRIMING = 1105;
function fitLength(ctx, buf, frames, rate = 48000) {
  const ratio = buf.sampleRate / rate;
  const want = Math.round(frames * ratio);
  const extra = buf.length - want;
  if (extra <= 1 || want < 1) return buf; // exact (±1 from resampling)
  let lead = Math.round(PRIMING * ratio);
  if (extra < lead) lead = quietHead(buf, extra) ? extra : 0; // only one end was padded: the quiet one
  const out = ctx.createBuffer(buf.numberOfChannels, want, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(lead, lead + want));
  return out;
}

// Are the first n samples far (over 20 dB) quieter than the n after them?
function quietHead(buf, n) {
  let head = 0;
  let next = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) head += d[i] * d[i];
    for (let i = n; i < Math.min(d.length, 2 * n); i++) next += d[i] * d[i];
  }
  return head * 100 < next;
}

async function loadRecording(ctx, rec) {
  const buf = await decodeRecording(ctx, await fetchRecording(rec.file));
  return rec.frames ? fitLength(ctx, buf, rec.frames) : buf;
}

function audioParam(name) {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scores: compact note strings, parsed once per scene
// ---------------------------------------------------------------------------
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteNumber(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// "A4:2 D5 - | ..." → notes [{at, m, len}] in steps ("-" is a rest, the default length is 1 step).
function parseScore(text, perBar) {
  const notes = [];
  const errors = [];
  const bars = text.split('|');
  bars.forEach((bar, b) => {
    let used = 0;
    for (const tok of bar.trim().split(/\s+/)) {
      if (!tok) continue;
      const [name, l] = tok.split(':');
      const len = l ? Number(l) : 1;
      if (name !== '-') {
        const m = noteNumber(name);
        if (m == null) errors.push(`bar ${b + 1}: bad note ${tok}`);
        else notes.push({ at: b * perBar + used, m, len });
      }
      used += len;
    }
    if (used !== perBar) errors.push(`bar ${b + 1}: ${used} steps, expected ${perBar}`);
  });
  return { notes, bars: bars.length, errors };
}

// Notes indexed by the step they start on.
function byStep(notes, len) {
  const at = new Array(len).fill(null);
  for (const n of notes) (at[n.at] || (at[n.at] = [])).push(n);
  return at;
}

// "G C Am/D" → [['G'], ['C'], ['Am', 'D']] (a slash splits the bar in halves).
const parseChords = (s) => s.trim().split(/\s+/).map((c) => c.split('/'));

const CHORD = {
  C: [48, 52, 55], Dm: [50, 53, 57], D: [50, 54, 57], Em: [52, 55, 59], F: [53, 57, 60],
  G: [55, 59, 62], Gm: [55, 58, 62], A: [57, 61, 64], Am: [57, 60, 64], Bb: [58, 62, 65], Eb: [51, 55, 58],
  E: [52, 56, 59], Cm: [48, 51, 55], Fm: [53, 56, 60], Ab: [56, 60, 63], Bm: [59, 62, 66], B: [59, 63, 66],
  Bdim: [59, 62, 65, 68],
};

// Move chord tones into [lo, hi].
function voicing(chord, lo, hi) {
  return chord.map((m) => {
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return m;
  });
}

// The note `k` scale steps away from midi note `m` (null if m is outside the scale).
function diatonic(m, k, scale) {
  const pc = ((m % 12) + 12) % 12;
  const i = scale.indexOf(pc);
  if (i < 0) return null;
  const pc2 = scale[(((i + k) % 7) + 7) % 7];
  return k > 0 ? m + (((pc2 - pc) % 12) + 12) % 12 : m - (((pc - pc2) % 12) + 12) % 12;
}

// Menu: a jaunty shanty jig in D dorian (6/8, one step = an eighth note). A A' B A''.
const MENU = {
  bar: 6,
  dur: 0.2,
  scale: [2, 4, 5, 7, 9, 11, 0],
  melody: `A4:2 D5 D5:2 E5 | F5:2 E5 D5:2 A4 | G4:2 C5 C5:2 D5 | E5:2 D5 C5:2 G4 |
           A4:2 D5 D5:2 E5 | F5:2 G5 A5:2 F5 | E5:2 C5 D5 E5 C5 | D5:3 D5:2 - |
           A4:2 D5 D5:2 E5 | F5:2 E5 D5:2 F5 | G5:2 F5 E5:2 C5 | E5:2 D5 C5:2 E5 |
           A5:2 G5 F5:2 E5 | D5:2 E5 F5:2 A5 | G5:2 E5 C5:2 E5 | D5:3 D5:3 |
           C5:2 F5 F5:2 A5 | G5:2 E5 C5:2 E5 | F5:2 A5 C6:2 A5 | G5:3 E5:3 |
           D5:2 G5 G5:2 B5 | A5:2 G5 E5:2 C5 | B4:2 D5 G5:2 F5 | E5:2 C#5 A4:3 |
           A4:2 D5 D5:2 E5 | F5:2 E5 D5:2 A4 | G4:2 C5 C5:2 D5 | E5:2 D5 C5:2 G4 |
           A4:2 D5 D5:2 E5 | F5:2 G5 A5:2 F5 | E5:2 C5 D5 E5 C5 | D5:3 -:3`,
  chords: `Dm Dm C C Dm Dm C Dm  Dm Dm C C Dm Dm C Dm  F C F C G Am G A  Dm Dm C C Dm Dm C Dm`,
};

// Coast of Europe: a bright fiddle-and-accordion polka in G major (4/4 at 116 bpm, eighth-note steps). A B A'.
const EUROPE = {
  bar: 8,
  dur: 60 / 116 / 2,
  scale: [7, 9, 11, 0, 2, 4, 6],
  melody: `D5:2 B4 D5 G5:2 F#5 E5 | E5:2 C5 E5 G5:2 E5 C5 | D5:2 B4 G4 B4:2 D5 B4 | A4:2 F#4 A4 D5:4 |
           D5:2 B4 D5 G5:2 A5 B5 | C6:2 B5 A5 G5:2 E5 C5 | D5 E5 F#5 G5 A5:2 F#5 D5 | G5:4 G4:2 -:2 |
           B4:2 E5 G5 B5:2 A5 G5 | F#5 G5 A5 G5 F#5:2 E5 D5 | E5:2 C5 E5 G5:2 E5 G5 | F#5:2 D5 F#5 A5:4 |
           B5:2 A5 G5 E5:2 G5 B5 | C6:2 B5 A5 G5:2 E5 C5 | A4 C5 E5 A5 F#5 D5 E5 F#5 | G5:2 D5:2 B4:2 -:2 |
           D5:2 B4 D5 G5:2 F#5 E5 | E5:2 C5 E5 G5:2 E5 C5 | D5:2 B4 G4 B4:2 D5 B4 | A4:2 F#4 A4 D5:4 |
           D5:2 B4 D5 G5:2 A5 B5 | C6:2 B5 A5 G5:2 E5 C5 | D5 E5 F#5 G5 A5:2 F#5 D5 | G5:2 F#5 E5 D5 C5 B4 A4`,
  chords: `G C G D G C D G  Em Em C D Em C Am/D G  G C G D G C D G/D`,
};

// Bali: a gamelan-flavoured loop in a pelog-selisir-like five-tone tuning (cents above the base),
// 80 bpm with sixteenth-note steps. Four 16-beat gong cycles: A A B B.
const BALI = {
  dur: 60 / 80 / 4,
  base: 293.66,
  cents: [0, 120, 270, 670, 790],
  pokokA: [2, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2, 0],
  pokokB: [3, 4, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 1, 0],
  // Bamboo flute lines for cycles 3 and 4: [beat, degree, beats].
  suling: [
    [[0, 9, 2], [2, 8, 2], [4, 6, 3], [7, 7, 1], [8, 8, 3], [11, 6, 1], [12, 7, 2], [14, 5, 2]],
    [[0, 8, 3], [3, 9, 1], [4, 8, 2], [6, 7, 2], [8, 8, 2], [10, 7, 1], [11, 6, 1], [12, 6, 2], [14, 5, 2]],
  ],
};

// The Volcano: taiko-driven D minor (96 bpm, sixteenth-note steps), 16 bars over a low drone.
const VOLCANO = {
  bar: 16,
  dur: 60 / 96 / 4,
  chords: `Dm Dm Dm Dm Dm Dm Bb A Gm Gm Bb A Dm Eb Dm A`,
  lead: `-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 |
         D5:6 C5:2 Bb4:8 | A4:4 Bb4:4 G4:8 | F5:6 Eb5:2 D5:8 | C#5:8 E5:8 |
         D5:12 A4:4 | Bb4:6 G4:2 Eb5:8 | D5:8 F5:4 E5:4 | C#5:12 -:4`,
  drums: {
    intro: 'X.......X.......',
    a: 'X..x..X.X..x.k.k',
    b: 'X..x..X.X.kx..xk',
    fill: 'X..x..X.X.ttTtTT',
  },
};

// Doubloon Bay: a fandango for the treasure fleet at dusk, in A minor with the Spanish G# (3/4, one step = an eighth
// note; even bars lean into 6/8). Trumpets over strummed guitars, castanets and a cajon; the harbour bell tolls each
// section in. A A' B A''.
const DOUBLOON = {
  bar: 6,
  dur: 0.17,
  scale: [9, 11, 0, 2, 4, 5, 7],
  spanish: [9, 11, 0, 2, 4, 5, 8], // over E major the thirds use G# (E-C, D-B, C-A, B-G#: the Spanish cadence)
  melody: `A4 C5 E5:2 D5 C5 | B4:2 D5 G5:2 F5 | A5:2 G5 F5 E5 D5 | E5:4 -:2 |
           A4 C5 E5:2 D5 C5 | B4:2 D5 G5:2 B5 | A5:2 G5 F5 E5 D5 | F5 E5 D5 C5 B4 G#4 |
           A4 C5 E5:2 D5 C5 | B4:2 D5 G5:2 F5 | A5:2 G5 F5 E5 D5 | E5:4 -:2 |
           F5:2 E5 D5:2 F5 | E5:2 C5 A4:2 C5 | B4 C5 D5 C5 B4 G#4 | A4:4 -:2 |
           C5 F5 A5:2 G5 F5 | G5:2 E5 C5:2 E5 | D5 G5 B5:2 A5 G5 | G5:3 E5:3 |
           C5 F5 A5:2 G5 F5 | G5:2 E5 C6:2 B5 | A5 G5 F5 E5 D5 F5 | E5:2 D5 B4:2 G#4 |
           A4 C5 E5:2 D5 C5 | B4:2 D5 G5:2 F5 | A5:2 G5 F5 E5 D5 | F5 E5 D5 C5 B4 G#4 |
           F5:2 E5 D5:2 F5 | E5:2 C5 A4:2 C5 | B4 C5 D5 C5 B4 G#4 | A4:3 -:3`,
  chords: `Am G F E Am G F E  Am G F E Dm Am E Am  F C G C F C Dm E  Am G F E Dm Am E Am`,
};

// Frostbite Straits: longships rowing out of the fog. E dorian over a bowed drone (4/4 at 108 bpm, eighth-note
// steps): a hardanger-ish fiddle (a second fiddle a third below it from the middle on), a rowing drum, a choir
// breathing the chords, celesta frost and lur-horn calls in the middle. A B A'.
const FROST = {
  bar: 8,
  dur: 60 / 108 / 2,
  scale: [4, 6, 7, 9, 11, 1, 2],
  melody: `E5:2 B4 E5 F#5:2 G5 F#5 | E5:2 D5 B4 A4:2 B4:2 | D5:2 A4 D5 F#5:2 E5 D5 | E5:4 B4:2 -:2 |
           E5:2 B4 E5 F#5:2 G5 A5 | B5:2 A5 G5 F#5:2 E5 C#5 | D5:2 F#5 A5 G5 F#5 E5 D5 | E5:6 -:2 |
           G5:2 E5 G5 C6:2 B5 A5 | F#5:2 D5 F#5 A5:4 | G5 F#5 E5 F#5 G5:2 B5:2 | B5:4 A5:2 G5:2 |
           E5:2 G5 E5 C5:2 E5:2 | D5:2 F#5 D5 A4:2 D5:2 | F#5:2 D5 B4 F#5:2 A5 F#5 | D#5:4 F#5:2 B4:2 |
           E5:2 B4 E5 F#5:2 G5 F#5 | E5:2 D5 B4 A4:2 B4:2 | D5:2 A4 D5 F#5:2 E5 D5 | E5:4 B4:2 -:2 |
           E5:2 B4 E5 F#5:2 G5 A5 | B5:2 A5 G5 F#5:2 E5 C#5 | D5:2 F#5 A5 G5 F#5 E5 D5 | E5:6 -:2`,
  chords: `Em Em D Em Em A D Em  C D Em Em C D Bm B  Em Em D Em Em A D Em`,
};

// The Maelstrom: a danse macabre for the Phantom Galleon in C minor (3/4 at 150 bpm, eighth-note steps). A
// theremin ghost over a pizzicato waltz and a wheezing organ, xylophone bones in the whirl, timpani and a tolling
// bell. A A' B A''.
const MAELSTROM = {
  bar: 6,
  dur: 60 / 150 / 2,
  scale: [0, 2, 3, 5, 7, 8, 10],
  melody: `C5:2 Eb5:2 G5:2 | Ab5:3 G5 F5 Eb5 | D5:2 F5:2 Ab5:2 | G5:6 |
           C5:2 Eb5:2 G5:2 | C6:3 Bb5 Ab5 G5 | F5:2 Eb5 D5 B4:2 | C5:4 -:2 |
           C5:2 Eb5:2 G5:2 | Ab5:3 G5 F5 Eb5 | F5:2 Ab5:2 C6:2 | Db6:4 C6:2 |
           C6:2 Ab5:2 Eb5:2 | D5:2 F5:2 Ab5:2 | G5 F5 Eb5 D5 C5 B4 | C5:4 -:2 |
           Eb5 G5 Bb5 G5 Eb5 G5 | D5 F5 Bb5 F5 D5 F5 | C5 Eb5 G5 Eb5 C5 Eb5 | B4 D5 G5 D5 B4 D5 |
           C5 Eb5 Ab5 Eb5 C5 Eb5 | C5 F5 Ab5 F5 C5 F5 | D5 G5 B5 G5 D5 G5 | D5:2 B4:2 G4:2 |
           C5:2 Eb5:2 G5:2 | Ab5:3 G5 F5 Eb5 | D5:2 F5:2 Ab5:2 | G5:6 |
           C5:2 Eb5:2 G5:2 | C6:3 Bb5 Ab5 G5 | F5:2 Eb5 D5 B4:2 | C5:3 -:3`,
  chords: `Cm Cm G G Cm Fm G Cm  Cm Cm Fm Fm Ab Bdim G Cm  Eb Bb Cm G Ab Fm G G  Cm Cm G G Cm Fm G Cm`,
};

// The Turtle Atolls: a calypso in C major (4/4 at 116 bpm, eighth-note steps; the tune leans on the 3+3+2 of the
// beat). Steel pans and marimba take turns with the tune over a strummed ukulele, a bass on the calypso's "1, 2-and,
// 3", shakers, congas and a woodblock clave. A B A'.
const ATOLLS = {
  bar: 8,
  dur: 60 / 116 / 2,
  scale: [0, 2, 4, 5, 7, 9, 11],
  melody: `E5:3 G5:3 E5 D5 | F5:3 A5:3 G5:2 | D5:3 G5:3 F5 D5 | E5:3 C5:3 -:2 |
           E5:3 G5:3 C6 B5 | A5:3 F5:3 A5:2 | G5 F5 E5 D5 B4:2 D5:2 | C5:6 -:2 |
           A5:2 A5 C6 A5:2 F5:2 | G5:3 F5:3 E5 F5 | G5:2 G5 E5 C5:2 E5:2 | D5:3 E5:3 -:2 |
           F5:2 F5 A5 G5:2 F5:2 | D5:3 B4:3 D5 F5 | E5:3 G5:3 C6 B5 | C6:4 -:2 G4:2 |
           E5:3 G5:3 E5 D5 | F5:3 A5:3 G5:2 | D5:3 G5:3 F5 D5 | E5:3 C5:3 -:2 |
           E5:3 G5:3 C6 B5 | A5:3 F5:3 A5:2 | G5 F5 E5 D5 B4:2 D5:2 | C5:6 -:2`,
  chords: `C F G C C F G C  F F C C G G C C  C F G C C F G C`,
};

// The Cape of Storms: a brass storm shanty in G minor (4/4 at 96 bpm, eighth-note steps). Horns with the tune (two
// in thirds for the reprise), a concertina pumping the chords and taking the chorus, storm strings shivering under
// it all with a run up into each section, a big drum on the heave. A B A'.
const CAPE = {
  bar: 8,
  dur: 60 / 96 / 2,
  scale: [7, 9, 10, 0, 2, 3, 5],
  harmonic: [7, 9, 10, 0, 2, 3, 6], // over D major the seventh is F#
  melody: `G4:2 Bb4 D5 G5:3 F5 | D5:2 Bb4 G4 A4:2 Bb4:2 | C5:2 A4 F4 C5:3 D5 | F#5:4 D5:2 -:2 |
           G4:2 Bb4 D5 G5:3 A5 | Bb5:2 G5 Eb5 G5:2 Bb5:2 | A5:2 F#5 D5 A4:2 C5 Bb4 | G4:6 -:2 |
           F5:3 D5 Bb4:2 D5:2 | C5:3 A4 F4:2 A4:2 | Bb4:2 D5 G5 F5:2 D5:2 | A4:6 -:2 |
           G5:3 Eb5 Bb4:2 Eb5:2 | F5:3 D5 Bb4:2 D5:2 | C5:2 Bb4 A4 F#4:2 A4:2 | D5:6 -:2 |
           G4:2 Bb4 D5 G5:3 F5 | D5:2 Bb4 G4 A4:2 Bb4:2 | C5:2 A4 F4 C5:3 D5 | F#5:4 D5:2 -:2 |
           G4:2 Bb4 D5 G5:3 A5 | Bb5:2 G5 Eb5 G5:2 Bb5:2 | A5:2 F#5 D5 A4:2 C5 Bb4 | G4:6 -:2`,
  chords: `Gm Gm F D Gm Eb D Gm  Bb F Gm D Eb Bb D D  Gm Gm F D Gm Eb D Gm`,
};

// The Kraken's Deep: moonlit and mysterious, E minor (4/4 at 72 bpm, eighth-note steps). A low cello ostinato rocks
// through the chords, a glass harmonica sings slow notes above it, and whales call and glide far off.
const DEEP = {
  bar: 8,
  dur: 60 / 72 / 2,
  scale: [4, 6, 7, 9, 11, 0, 2],
  melody: `-:8 | -:8 | -:8 | -:8 | E5:4 C5:4 | B4:6 A4:2 | F#5:4 D#5:4 | B4:8 |
           G5:4 F#5:2 E5:2 | B5:8 | G5:4 E5:4 | C5:6 D5:2 | E5:4 A5:4 | F#5:4 D#5:4 | E5:8 | -:8`,
  chords: `Em Em C C Am Am B B  Em Em C C Am B Em Em`,
};

// The Kraken: first the dread (the music drops to a 40 Hz drone with a heartbeat), then the theme: a descending
// D–C#–A tuba motif over timpani in 6/8 (eighth-note steps, faster in phase 3), storm strings, horns with the tune
// and a choir in the second half. A B.
const KRAKEN_TUNE = {
  bar: 6,
  beat: 3, // steps in a beat (a dotted quarter): where the dread gives way to the theme and back
  dur: 0.25,
  fast: 0.82, // phase 3: the steps shrink to this (≈ 22% faster)
  autoStart: 10, // s: with nobody calling setMusicPhase the theme starts after the dread (4 s) and the rise (6 s)
  melody: `D5:3 F5:2 E5 | C#5:3 A4:3 | D5:2 E5 F5:2 G5 | A5:3 F5:3 | D5:3 A5:2 G5 | E5:3 C#5:3 | D5:2 Bb4 G4:2 Bb4 | A4:6 |
           F5:3 D5:2 Bb4 | C#5:3 E5:3 | D5:2 G5 Bb5:2 A5 | A5:6 | Bb5:2 A5 G5:2 F5 | G5:2 F5 E5:2 D5 | E5:3 C#5:3 | A4:3 -:3`,
  tuba: `D3:3 C#3:3 | A2:6 | D3:3 C#3:3 | Bb2:3 A2:3 | D3:3 C#3:3 | A2:6 | G2:3 Bb2:3 | A2:3 C#3:3 |
         Bb2:6 | A2:6 | G2:6 | A2:3 C#3:3 | Bb2:3 A2:3 | G2:3 F2:3 | E2:3 G2:3 | A2:3 C#3:3`,
  chords: `Dm A Dm Bb Dm A Gm A  Bb A Gm A Bb Gm A A`,
  scale: [2, 4, 5, 7, 9, 10, 0],
  // The drone: 40 Hz with the harmonics a phone's small speaker can play (§5.7.1), and a 41 Hz twin beating slowly.
  drone: [[40, 0.45], [41, 0.3], [80, 0.5], [120, 0.36], [160, 0.32], [240, 0.24]],
  droneLevel: 0.11,
};

// ---------------------------------------------------------------------------
// Shared buffers and curves (built once per AudioContext)
// ---------------------------------------------------------------------------
function buildResources(ctx) {
  const sr = ctx.sampleRate;
  const make = (ch, sec) => ctx.createBuffer(ch, Math.max(1, Math.floor(sr * sec)), sr);

  // White noise: mono for panned one-shots, decorrelated stereo for ambience beds.
  const noise = make(1, 2);
  const noise2 = make(2, 3);
  for (const b of [noise, noise2]) {
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      zeroMean(d);
    }
  }

  // Crackle: sparse snaps of random size (lava, burning debris).
  const crackle = make(1, 3);
  {
    const d = crackle.getChannelData(0);
    let i = 0;
    while (i < d.length) {
      i += Math.floor(sr * (0.004 + Math.random() * Math.random() * 0.09));
      const a = 0.1 + 0.9 * Math.random() * Math.random();
      const len = Math.floor(sr * (0.0004 + Math.random() * 0.003));
      for (let k = 0; k < len && i + k < d.length; k++) d[i + k] += (Math.random() * 2 - 1) * a * (1 - k / len) ** 2;
    }
    zeroMean(d);
  }

  return {
    noise,
    noise2,
    crackle,
    // Plucked strings (Karplus-Strong), one per octave; notes in between retune by playback rate.
    ks: [98, 196, 392, 784].map((f, i) => ksString(ctx, f, [1.6, 1.3, 1.0, 0.8][i])),
    reed: reedWave(ctx),
    organ: organWave(ctx),
    ir: reverbImpulse(ctx, 1.5),
    curve: softClipCurve(),
    drive: driveCurve(3),
  };
}

// tanh saturation for booms: turns a low sine into a fat, punchy tone whose harmonics survive small speakers.
// Odd length, so an input of exactly 0 maps to exactly 0 (no DC).
function driveCurve(k) {
  const n = 1025;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / Math.tanh(k);
  return c;
}

function zeroMean(d) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m += d[i];
  m /= d.length;
  for (let i = 0; i < d.length; i++) d[i] -= m;
}

function ksString(ctx, f0, sec) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * sec);
  const buf = ctx.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / f0 - 0.5));
  const f = sr / (N + 0.5); // the averaging filter adds half a sample of delay
  const loss = Math.pow(10, -3 / (sec * 0.85 * f)); // per-period loss for a T60 of ~85% of the buffer
  // Excitation: one period of softened noise with its mean removed (no DC).
  const ex = new Float32Array(N);
  let p = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    p += 0.55 * (Math.random() * 2 - 1 - p);
    ex[i] = p;
    mean += p / N;
  }
  for (let i = 0; i < len; i++) {
    const a = i >= N ? y[i - N] : 0;
    const b = i > N ? y[i - N - 1] : 0;
    y[i] = (i < N ? ex[i] - mean : 0) + loss * 0.5 * (a + b);
  }
  // DC blocker, normalise, fade the very end.
  let x1 = 0;
  let y1 = 0;
  let peak = 1e-9;
  for (let i = 0; i < len; i++) {
    const x = y[i];
    y1 = x - x1 + 0.995 * y1;
    x1 = x;
    y[i] = y1;
    peak = Math.max(peak, Math.abs(y1));
  }
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < len; i++) y[i] *= (0.9 / peak) * Math.min(1, (len - i) / fade);
  return { buf, f };
}

// A narrow-pulse reed spectrum with a soft body resonance: accordion / concertina.
function reedWave(ctx) {
  const n = 40;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (Math.sin(Math.PI * k * 0.28) / k) * (1 + 0.8 * Math.exp(-((k - 4) ** 2) / 4));
  return ctx.createPeriodicWave(re, im);
}

// A pipe organ's flue stops (8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1'): the Maelstrom's wheezing chapel organ.
function organWave(ctx) {
  const re = new Float32Array(9);
  const im = new Float32Array(9);
  [[1, 1], [2, 0.55], [3, 0.3], [4, 0.28], [5, 0.08], [6, 0.12], [8, 0.1]].forEach(([k, a]) => (im[k] = a));
  return ctx.createPeriodicWave(re, im);
}

// A small, dark room: decaying stereo noise whose highs die away first.
function reverbImpulse(ctx, sec) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * sec);
  const buf = ctx.createBuffer(2, len, sr);
  const decay = Math.pow(10, -3 / (sec * sr)); // -60 dB over `sec`, per sample
  const dampDecay = Math.exp(-4 / sr);
  const pre = Math.floor(sr * 0.01);
  const ramp = sr * 0.02;
  const tail = sr * 0.05;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    let env = 1;
    let damp = 0.88;
    for (let i = 0; i < len; i++) {
      lp += (0.12 + damp) * (Math.random() * 2 - 1 - lp);
      const onset = i < pre ? 0 : Math.min(1, (i - pre) / ramp);
      d[i] = lp * onset * env * Math.min(1, (len - i) / tail);
      env *= decay;
      damp *= dampDecay;
    }
  }
  return buf;
}

// Transparent up to 0.6, then bends smoothly towards a ceiling of 0.98 (the shaper is fed half the signal).
function softClipCurve() {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const u = Math.abs(x) * 2;
    const y = u < 0.6 ? u : 0.6 + 0.38 * Math.tanh((u - 0.6) / 0.38);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

// ---------------------------------------------------------------------------
// Envelopes (all start and end at exactly zero, so nothing clicks)
// ---------------------------------------------------------------------------
// 0 → peak over `a`, then an exponential fall of 60 dB over `d`. Returns the end time.
function perc(p, t, peak, a, d) {
  peak = Math.max(peak, 1e-5);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(peak * 1e-3, t + a + d);
  p.linearRampToValueAtTime(0, t + a + d + 0.01);
  return t + a + d + 0.01;
}

// 0 → peak over `a`, hold until `off`, then release (60 dB) over `r`. Returns the end time.
function sus(p, t, peak, a, off, r) {
  peak = Math.max(peak, 1e-5);
  const h = Math.max(off, t + a);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setValueAtTime(peak, h);
  p.exponentialRampToValueAtTime(peak * 1e-3, h + r);
  p.linearRampToValueAtTime(0, h + r + 0.01);
  return h + r + 0.01;
}

// ---------------------------------------------------------------------------
// The engine: everything that needs an AudioContext (real-time or offline)
// ---------------------------------------------------------------------------
// `pending(key)`: is a recording for this key on its way (so a new scene should wait for it)?
// `musicOffset`: where recorded music starts, in seconds (tests use it to listen across a loop's seam).
function createEngine(ctx, { seed = (Math.random() * 4294967296) >>> 0, pending = () => false, musicOffset = 0 } = {}) {
  const R = buildResources(ctx);
  const recs = new Map(); // decoded recordings by key ('music:menu', 'sfx:levelClear'...): { buffer, gain, duck, name }
  const rng = mulberry32(seed); // music + ambience (deterministic per seed)
  const rand = (a, b) => a + (b - a) * rng();
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const S = { nodes: 0, made: 0, peak: 0, sfx: 0, recPlays: 0 };

  // ---- voices: every short-lived node belongs to one, and is disconnected after `end`
  const live = [];
  let owner = null; // the scene whose notes / ambience events are being scheduled right now
  function voice(sfx = false) {
    const v = { end: 0, nodes: [], src: sfx || owner ? [] : null, sfx, dead: false };
    live.push(v);
    if (sfx) S.sfx++;
    if (owner) owner.kids.push(v); // so a scene can cut its pending notes and events when it goes
    return v;
  }
  function own(v, n) {
    v.nodes.push(n);
    S.nodes++;
    S.made++;
    if (S.nodes > S.peak) S.peak = S.nodes;
    return n;
  }
  function release(v) {
    for (let k = 0; k < v.nodes.length; k++) v.nodes[k].disconnect();
    S.nodes -= v.nodes.length;
    // Drop every node reference so a handle the game still holds does not pin the graph.
    v.nodes.length = 0;
    if (v.src) v.src.length = 0;
    v.in = v.lp = v.pn = null;
    v.dead = true;
    if (v.sfx) {
      S.sfx--;
      active[v.name]--;
      if (stinger === v) stinger = null;
    }
  }
  let lastSweep = -1;
  function sweep(now) {
    lastSweep = now;
    for (let i = live.length - 1; i >= 0; i--) {
      const v = live[i];
      if (v.end > now - 0.05) continue;
      release(v);
      live[i] = live[live.length - 1];
      live.pop();
    }
  }
  function kill(v) {
    const i = live.indexOf(v);
    if (i >= 0) {
      live[i] = live[live.length - 1];
      live.pop();
    }
    if (!v.dead) release(v);
  }

  // ---- node helpers
  const gain = (v, value = 1) => {
    const g = own(v, ctx.createGain());
    g.gain.value = value;
    return g;
  };
  // Note: for lowpass/highpass the Web Audio Q is a resonance in dB (-3 ≈ flat); for bandpass it is a real Q.
  const filt = (v, type, freq, q) => {
    const f = own(v, ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  };
  const panner = (v, pan) => {
    if (!ctx.createStereoPanner) return gain(v, 1);
    const p = own(v, ctx.createStereoPanner());
    p.pan.value = clamp(pan, -1, 1);
    return p;
  };
  // stop() on a source that already has a stop time throws in some older WebKit builds.
  function stopAt(s, t) {
    try {
      s.stop(t);
      s.t1 = t;
    } catch {
      // Already stopped or finished: nothing to do.
    }
  }
  function begin(v, s, t0, t1, offset) {
    if (offset != null) s.start(t0, offset);
    else s.start(t0);
    if (t1 != null) {
      s.stop(t1);
      s.t1 = t1;
      if (t1 > v.end) v.end = t1;
    } else s.t1 = Infinity;
    if (v.src) v.src.push(s);
    return s;
  }
  function osc(v, type, f, t0, t1) {
    const o = own(v, ctx.createOscillator());
    if (type === 'reed' || type === 'organ') o.setPeriodicWave(R[type]);
    else o.type = type;
    o.frequency.value = f;
    o.frequency.setValueAtTime(f, t0); // so later ramps start at t0, not at "now"
    return begin(v, o, t0, t1);
  }
  function noise(v, t0, t1, buf = R.noise, rate = 1) {
    const s = own(v, ctx.createBufferSource());
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    return begin(v, s, t0, t1, rng() * buf.duration * 0.95);
  }
  function sample(v, buf, t0, t1, rate = 1, offset = 0) {
    const s = own(v, ctx.createBufferSource());
    s.buffer = buf;
    s.playbackRate.value = rate;
    return begin(v, s, t0, t1, offset);
  }
  function lfo(v, rate, depth, param, t0, t1 = null, type = 'sine') {
    const o = osc(v, type, rate, t0, t1);
    const d = gain(v, depth);
    o.connect(d);
    d.connect(param);
    return o;
  }

  // ---- master chain
  const fixed = { end: Infinity, nodes: [], src: null, sfx: false, dead: false }; // never swept
  const sum = gain(fixed, 1);
  const dcBlock = filt(fixed, 'highpass', 22, -3); // no DC or inaudible sub-rumble eating headroom
  const comp = own(fixed, ctx.createDynamicsCompressor());
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.003;
  comp.release.value = 0.22;
  const pre = gain(fixed, 0.5);
  const shaper = own(fixed, ctx.createWaveShaper());
  shaper.curve = R.curve;
  const master = gain(fixed, 1);
  sum.connect(dcBlock);
  dcBlock.connect(comp);
  comp.connect(pre);
  pre.connect(shaper);
  shaper.connect(master);
  master.connect(ctx.destination);

  const sfxBus = gain(fixed, LEVEL.sfx);
  const musicBus = gain(fixed, LEVEL.music);
  const ambBus = gain(fixed, LEVEL.amb);
  const duckDry = gain(fixed, 1); // fanfares push the music down while they play
  const duckWet = gain(fixed, 1);
  sfxBus.connect(sum);
  musicBus.connect(duckDry);
  duckDry.connect(sum);
  ambBus.connect(sum);
  const verb = own(fixed, ctx.createConvolver());
  verb.buffer = R.ir;
  const verbOut = gain(fixed, LEVEL.verb);
  verb.connect(verbOut);
  verbOut.connect(sum);
  const musicVerb = gain(fixed, LEVEL.music); // music reverb send follows the music volume
  musicVerb.connect(duckWet);
  duckWet.connect(verb);
  // Duck the music until `until`, then let it swell back (until <= now: restore right away).
  function duck(now, until) {
    for (const g of [duckDry.gain, duckWet.gain]) {
      g.cancelScheduledValues(now);
      if (until > now) {
        g.setTargetAtTime(0.3, now, 0.05);
        g.setTargetAtTime(1, until, 0.5);
      } else g.setTargetAtTime(1, now, 0.3);
    }
  }
  const sfxVerb = gain(fixed, 0.35); // fanfares get a little room too
  sfxVerb.connect(verb);

  // =========================================================================
  // Instruments: each builds one note into voice `v` and connects it to `out`.
  // =========================================================================
  function pluck(v, out, t, f, vel, len = 1) {
    let best = R.ks[0];
    for (const k of R.ks) if (Math.abs(Math.log(f / k.f)) < Math.abs(Math.log(f / best.f))) best = k;
    const rate = f / best.f;
    const max = best.buf.duration / rate;
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.003, t + Math.min(len, max - 0.12), 0.1);
    const s = sample(v, best.buf, t, Math.min(end, t + max), rate);
    s.connect(g);
    g.connect(out);
  }

  function strum(v, out, t, notes, vel, len, gap = 0.012) {
    for (let k = 0; k < notes.length; k++) pluck(v, out, t + k * gap, mtof(notes[k]), vel * (k ? 0.8 : 1), len);
  }

  // Accordion / concertina: pairs of reeds tuned a few cents apart (the "musette" shimmer).
  function reed(v, out, t, notes, dur, vel, bright = 2600, detune = 7) {
    const lp = filt(v, 'lowpass', bright, 1);
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.022, t + dur, 0.07);
    for (const m of notes) {
      for (const dt of [-detune, detune]) {
        const o = osc(v, 'reed', mtof(m), t, end);
        o.detune.value = dt;
        o.connect(lp);
      }
    }
    lp.connect(g);
    g.connect(out);
  }

  // Bowed fiddle: a sawtooth with a little scoop and delayed vibrato.
  function fiddle(v, out, t, f, dur, vel) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.05, t + dur, 0.1);
    const o = osc(v, 'sawtooth', f, t, end);
    o.frequency.setValueAtTime(f * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const vib = osc(v, 'sine', 5.4 + rng() * 0.6, t, end);
    const depth = gain(v, 0);
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.006, t + clamp(dur, 0.1, 0.45));
    vib.connect(depth);
    depth.connect(o.frequency);
    const lp = filt(v, 'lowpass', Math.min(4200, f * 6), 0);
    const body = filt(v, 'peaking', 1100, 1.2);
    body.gain.value = 4;
    o.connect(lp);
    lp.connect(body);
    body.connect(g);
    g.connect(out);
  }

  // FM bell / metallophone. `beat` adds a twin carrier a few Hz off (gamelan "ombak" shimmer).
  function bell(v, out, t, f, vel, decay, ratio = 3.5, index = 1.2, beat = 0) {
    const g = gain(v, 0);
    const end = perc(g.gain, t, vel, 0.002, decay);
    const c = osc(v, 'sine', f, t, end);
    const m = osc(v, 'sine', f * ratio, t, end);
    const mg = gain(v, 0);
    const depth = f * ratio * index;
    mg.gain.setValueAtTime(depth, t);
    mg.gain.exponentialRampToValueAtTime(depth * 0.02, t + decay * 0.5);
    m.connect(mg);
    mg.connect(c.frequency);
    c.connect(g);
    if (beat) {
      const c2 = osc(v, 'sine', f + beat, t, end);
      mg.connect(c2.frequency);
      c2.connect(g);
    }
    g.connect(out);
  }

  function gong(v, out, t, f, vel, decay) {
    bell(v, out, t, f, vel, decay, 1.4, 0.8, f * 0.012);
    bell(v, out, t + 0.01, f * 2.01, vel * 0.35, decay * 0.6, 2, 0.3, 0);
    hiss(v, out, t, vel * 0.3, 0.12, 'lowpass', 400, 0);
  }

  // A tuned membrane: a sine that drops in pitch (kick, bodhran, taiko, toms).
  function drum(v, out, t, vel, f, d, drop = 1.6) {
    const g = gain(v, 0);
    const end = perc(g.gain, t, vel, 0.002, d);
    const o = osc(v, 'sine', f * drop, t, end);
    o.frequency.setValueAtTime(f * drop, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.connect(g);
    g.connect(out);
  }

  // A driven drum: the dropping sine goes through tanh saturation, so the attack is fat with harmonics
  // (audible on laptop and phone speakers) and the tail relaxes into a clean sub thump.
  function boom(v, out, t, vel, f, d, drop = 3) {
    const env = gain(v, 0);
    const end = perc(env.gain, t, 1, 0.002, d);
    const o = osc(v, 'sine', f * drop, t, end);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const sh = own(v, ctx.createWaveShaper());
    sh.curve = R.drive;
    const g = gain(v, vel);
    o.connect(env);
    env.connect(sh);
    sh.connect(g);
    g.connect(out);
  }

  // A little of the shared reverb on a one-shot (size for booms and fanfares).
  function roomSend(v, level) {
    const s = gain(v, level);
    v.pn.connect(s);
    s.connect(sfxVerb);
  }

  // Filtered noise hit (snare, shaker, rim, slaps, cymbals).
  function hiss(v, out, t, vel, d, type = 'highpass', f = 6000, q) {
    const g = gain(v, 0);
    const end = perc(g.gain, t, vel, 0.002, d);
    const n = noise(v, t, end);
    const fl = filt(v, type, f, q);
    n.connect(fl);
    fl.connect(g);
    g.connect(out);
    return g;
  }

  // Bamboo flute: a near-sine with breath noise and vibrato; `from` slides into the note.
  function flute(v, out, t, f, dur, vel, from = 0) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.09, t + dur, 0.2);
    const o = osc(v, 'triangle', f, t, end);
    if (from) {
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    }
    const vib = osc(v, 'sine', 4.6, t, end);
    const depth = gain(v, 0);
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.008, t + clamp(dur, 0.15, 0.7));
    vib.connect(depth);
    depth.connect(o.frequency);
    const lp = filt(v, 'lowpass', f * 3, -3);
    const n = noise(v, t, end);
    const bp = filt(v, 'bandpass', f * 2, 2);
    const breath = gain(v, 0.12);
    o.connect(lp);
    lp.connect(g);
    n.connect(bp);
    bp.connect(breath);
    breath.connect(g);
    g.connect(out);
  }

  // Brass: two detuned saws through a low-pass that opens with a "blat".
  function brass(v, out, t, f, dur, vel, bright = 1) {
    const g = gain(v, 0);
    const off = t + dur;
    const end = sus(g.gain, t, vel, 0.035, off, 0.18);
    const lp = filt(v, 'lowpass', f, 2);
    const fq = lp.frequency;
    fq.setValueAtTime(f * 1.2, t);
    fq.exponentialRampToValueAtTime(Math.min(f * 7 * bright, 9000), t + 0.07);
    fq.setTargetAtTime(Math.min(f * 3.5 * bright, 6000), t + 0.07, 0.12);
    fq.setTargetAtTime(f * 1.3, Math.max(off, t + 0.08), 0.08);
    for (const dt of [-6, 6]) {
      const o = osc(v, 'sawtooth', f, t, end);
      o.detune.value = dt;
      o.connect(lp);
    }
    lp.connect(g);
    g.connect(out);
  }

  // Several brass notes sharing one filter and envelope (fanfare chords).
  function brassChord(v, out, t, freqs, dur, vel, bright = 1) {
    const f = Math.min(...freqs);
    const g = gain(v, 0);
    const off = t + dur;
    const end = sus(g.gain, t, vel, 0.04, off, 0.25);
    const lp = filt(v, 'lowpass', f, 1);
    const fq = lp.frequency;
    fq.setValueAtTime(f * 1.5, t);
    fq.exponentialRampToValueAtTime(Math.min(f * 9 * bright, 9000), t + 0.08);
    fq.setTargetAtTime(Math.min(f * 5 * bright, 7000), t + 0.08, 0.15);
    for (const fr of freqs) {
      for (const dt of [-6, 6]) {
        const o = osc(v, 'sawtooth', fr, t, end);
        o.detune.value = dt;
        o.connect(lp);
      }
    }
    lp.connect(g);
    g.connect(out);
  }

  // A tongued brass melody played by one voice: notes = [[time, freq, dur, release]] in order, non-overlapping.
  function brassLine(v, out, notes, vel, bright = 1) {
    const t = notes[0][0];
    const last = notes[notes.length - 1];
    const end = last[0] + last[2] + last[3] + 0.02;
    const g = gain(v, 0);
    const lp = filt(v, 'lowpass', notes[0][1], 2);
    const os = [-6, 6].map((dt) => {
      const o = osc(v, 'sawtooth', notes[0][1], t, end);
      o.detune.value = dt;
      o.connect(lp);
      return o;
    });
    for (const [s, f, d, r] of notes) {
      for (const o of os) o.frequency.setValueAtTime(f, s);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vel, s + 0.03);
      g.gain.setValueAtTime(vel, s + d);
      g.gain.linearRampToValueAtTime(0, s + d + r);
      lp.frequency.setValueAtTime(f * 1.2, s);
      lp.frequency.exponentialRampToValueAtTime(Math.min(f * 7 * bright, 9000), s + 0.06);
      lp.frequency.setTargetAtTime(Math.min(f * 3.5 * bright, 6000), s + 0.06, 0.1);
    }
    lp.connect(g);
    g.connect(out);
  }

  // Synth bass pluck for the volcano ostinato.
  function bassPluck(v, out, t, f, dur, vel) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.004, t + dur, 0.06);
    const o = osc(v, 'sawtooth', f, t, end);
    const lp = filt(v, 'lowpass', f * 8, 4);
    lp.frequency.setValueAtTime(f * 9, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.16);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
  }

  // Chapel organ: flue pipes that speak a little slowly, with a faint wind wobble.
  function organ(v, out, t, notes, dur, vel) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.06, t + dur, 0.2);
    const lp = filt(v, 'lowpass', 2600, -3);
    for (const m of notes) {
      const o = osc(v, 'organ', mtof(m), t, end);
      o.detune.value = (rng() - 0.5) * 6;
      o.connect(lp);
    }
    const wob = gain(v, 1);
    lfo(v, 5.2, 0.06, wob.gain, t, end);
    lp.connect(wob);
    wob.connect(g);
    g.connect(out);
  }

  // Theremin: a sine with a breath of edge, sliding in from the previous note, vibrato swelling as it holds.
  function theremin(v, out, t, f, dur, vel, from = 0) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.07, t + dur, 0.22);
    const voices = [osc(v, 'sine', f, t, end), osc(v, 'triangle', f, t, end)];
    const edge = gain(v, 0.22);
    voices[1].connect(edge);
    const vib = osc(v, 'sine', 5.8, t, end);
    const depth = gain(v, 0);
    depth.gain.setValueAtTime(f * 0.004, t);
    depth.gain.linearRampToValueAtTime(f * 0.016, t + clamp(dur, 0.2, 0.9));
    vib.connect(depth);
    for (const o of voices) {
      if (from) {
        o.frequency.setValueAtTime(from, t);
        o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.14, dur * 0.4));
      }
      depth.connect(o.frequency);
    }
    voices[0].connect(g);
    edge.connect(g);
    g.connect(out);
  }

  // A choir breathing "ooh" (or "aah"): pairs of buzzing voices a few cents apart through the vowel's two formants.
  function choir(v, out, t, notes, dur, vel, vowel = 'oo') {
    const [f1, f2] = vowel === 'aa' ? [720, 1150] : [380, 820];
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, Math.min(0.35, dur * 0.3), t + dur, 0.45);
    const b1 = filt(v, 'bandpass', f1, 2.5);
    const b2 = filt(v, 'bandpass', f2, 4);
    const g2 = gain(v, 0.45);
    for (const m of notes) {
      for (const dt of [-9, 9]) {
        const o = osc(v, 'sawtooth', mtof(m), t, end);
        o.detune.value = dt;
        o.connect(b1);
        o.connect(b2);
      }
    }
    b2.connect(g2);
    b1.connect(g);
    g2.connect(g);
    g.connect(out);
  }

  // A lur or a ram's horn: low saws whose filter opens slowly, with a little wavering pitch.
  function horn(v, out, t, f, dur, vel) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.16, t + dur, 0.35);
    const lp = filt(v, 'lowpass', f * 1.2, 3);
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.exponentialRampToValueAtTime(f * 4.5, t + 0.25);
    lp.frequency.setTargetAtTime(f * 2.4, t + 0.3, 0.4);
    const wob = osc(v, 'sine', 4.3, t, end);
    const depth = gain(v, f * 0.004);
    wob.connect(depth);
    for (const dt of [-5, 5]) {
      const o = osc(v, 'sawtooth', f, t, end);
      o.detune.value = dt;
      o.frequency.setValueAtTime(f * 0.96, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      depth.connect(o.frequency);
      o.connect(lp);
    }
    lp.connect(g);
    g.connect(out);
  }

  // Xylophone: a hard mallet on a wooden bar (the skeletons' bones in the danse macabre).
  function xylo(v, out, t, f, vel) {
    bell(v, out, t, f, vel, 0.32, 3, 0.55);
    hiss(v, out, t, vel * 0.5, 0.012, 'bandpass', f * 4, 2);
  }

  // Castanets: two shells clacking a hair apart.
  function castanet(v, out, t, vel) {
    hiss(v, out, t, vel, 0.022, 'bandpass', 2900, 5);
    hiss(v, out, t + 0.011, vel * 0.7, 0.018, 'bandpass', 3600, 5);
  }

  // A cartoon voice for the crew: a buzzing glottal tone through two formant band-passes (the vowel), with a
  // breathy "h" at the start. pitch / vowel / amp are breakpoints ([time, Hz], [time, F1, F2], [time, level]) that
  // it glides between; amp starts and ends at zero.
  function vox(v, out, pitch, vowel, amp, vib = 0, breath = 0) {
    const t = amp[0][0];
    const end = amp[amp.length - 1][0] + 0.01;
    const o = osc(v, 'sawtooth', pitch[0][1], t, end);
    for (let k = 1; k < pitch.length; k++) o.frequency.exponentialRampToValueAtTime(pitch[k][1], pitch[k][0]);
    if (vib) lfo(v, 5 + Math.random() * 1.5, pitch[0][1] * vib, o.frequency, t, end);
    const b1 = filt(v, 'bandpass', vowel[0][1], 6);
    const b2 = filt(v, 'bandpass', vowel[0][2], 9);
    vowel.forEach(([s, a, b], k) => {
      for (const [f, x] of [[b1.frequency, a], [b2.frequency, b]]) {
        if (k) f.exponentialRampToValueAtTime(x, s);
        else f.setValueAtTime(x, s);
      }
    });
    const g2 = gain(v, 0.7);
    const g = gain(v, 0);
    g.gain.setValueAtTime(0, t);
    for (const [s, a] of amp) g.gain.linearRampToValueAtTime(a, s);
    o.connect(b1);
    o.connect(b2);
    if (breath) {
      const n = noise(v, t, t + 0.12);
      const ng = gain(v, 0);
      perc(ng.gain, t, breath, 0.01, 0.08);
      n.connect(ng);
      ng.connect(b2);
    }
    b2.connect(g2);
    b1.connect(g);
    g2.connect(g);
    g.connect(out);
  }

  // ---- The Kraken Seas' instruments

  // Steel pan: a tuned steel drum. The pan maker tunes its second and third partials, so the note is a near-harmonic
  // stack, struck bright (an FM edge that fades fast) with a little pitch settling at the start.
  function steelpan(v, out, t, f, vel, decay = 0.9) {
    const g = gain(v, 0);
    const end = perc(g.gain, t, vel, 0.003, decay);
    const c = osc(v, 'sine', f * 1.012, t, end);
    c.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const m = osc(v, 'sine', f, t, end);
    const mg = gain(v, 0);
    mg.gain.setValueAtTime(f * 1.3, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.04, t + 0.16);
    m.connect(mg);
    mg.connect(c.frequency);
    c.connect(g);
    g.connect(out);
    for (const [r, a, d] of [[2.004, 0.42, 0.5], [3.01, 0.16, 0.25]]) {
      const h = gain(v, 0);
      perc(h.gain, t, vel * a, 0.002, decay * d);
      osc(v, 'sine', f * r, t, end).connect(h);
      h.connect(out);
    }
  }

  // Marimba: a soft mallet on a rosewood bar over its resonator. The fundamental rings (longer on the low bars), the
  // bar's fourth partial (tuned about two octaves up) gives the woody "tok" and dies at once.
  function marimba(v, out, t, f, vel, decay = 0.55) {
    const g = gain(v, 0);
    const end = perc(g.gain, t, vel, 0.004, decay * clamp(500 / f, 0.6, 1.8));
    osc(v, 'sine', f, t, end).connect(g);
    g.connect(out);
    const k = gain(v, 0);
    const kend = perc(k.gain, t, vel * 0.3, 0.002, 0.07);
    osc(v, 'sine', f * 3.93, t, kend).connect(k);
    k.connect(out);
    hiss(v, out, t, vel * 0.22, 0.012, 'bandpass', Math.min(f * 5, 6000), 2);
  }

  // Cello: a low bowed string, darker than the fiddle: a saw with a soft bow attack and slow vibrato through a woody
  // body (resonances near 250 Hz and 900 Hz, so small speakers still hear the line).
  function cello(v, out, t, f, dur, vel) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, 0.08, t + dur, 0.2);
    const o = osc(v, 'sawtooth', f, t, end);
    const vib = osc(v, 'sine', 4.6, t, end);
    const depth = gain(v, 0);
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.005, t + clamp(dur, 0.2, 0.6));
    vib.connect(depth);
    depth.connect(o.frequency);
    const lp = filt(v, 'lowpass', Math.min(2400, f * 10), -1);
    const body = filt(v, 'peaking', 250, 1.4);
    body.gain.value = 5;
    const wood = filt(v, 'peaking', 900, 1.5);
    wood.gain.value = 3;
    o.connect(lp);
    lp.connect(body);
    body.connect(wood);
    wood.connect(g);
    g.connect(out);
  }

  // Glass harmonica: wet fingers on spinning glass bowls. A pure tone that swells in, a faint octave and a twin a
  // hair sharp beating slowly against it (the glassy shimmer), then a long ring.
  function glass(v, out, t, f, dur, vel) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, Math.min(0.3, dur * 0.4), t + dur, 0.7);
    osc(v, 'sine', f, t, end).connect(g);
    for (const [r, a] of [[1.0008, 0.5], [2, 0.1]]) {
      const h = gain(v, a);
      osc(v, 'sine', f * r, t, end).connect(h);
      h.connect(g);
    }
    g.connect(out);
  }

  // Whale song: a long call gliding through `pts` ([time, Hz] breakpoints), a soft buzz under a sine with a slow
  // vibrato, swelling in and out.
  function whale(v, out, pts, vel) {
    const t = pts[0][0];
    const end = pts[pts.length - 1][0] + 0.05;
    const o = osc(v, 'sine', pts[0][1], t, end);
    const b = osc(v, 'triangle', pts[0][1], t, end);
    for (let k = 1; k < pts.length; k++) {
      o.frequency.exponentialRampToValueAtTime(pts[k][1], pts[k][0]);
      b.frequency.exponentialRampToValueAtTime(pts[k][1], pts[k][0]);
    }
    const vib = osc(v, 'sine', 3.1, t, end);
    const depth = gain(v, pts[0][1] * 0.012);
    vib.connect(depth);
    depth.connect(o.frequency);
    depth.connect(b.frequency);
    const bg = gain(v, 0.25);
    b.connect(bg);
    const lp = filt(v, 'lowpass', 1500, 1);
    const g = gain(v, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(0.6, (end - t) * 0.3));
    g.gain.setValueAtTime(vel, Math.max(t + 0.6, end - 0.7));
    g.gain.linearRampToValueAtTime(0, end);
    o.connect(lp);
    bg.connect(lp);
    lp.connect(g);
    g.connect(out);
  }

  // Timpani: a tuned kettle drum: a driven body settling on its pitch, the kettle's ring an octave and a half up and
  // the felt mallet's thud, so it carries on small speakers too.
  function timpani(v, out, t, f, vel, decay = 1.1) {
    boom(v, out, t, vel * 0.5, f, decay, 1.25);
    hiss(v, out, t, vel * 1.6, decay * 0.4, 'bandpass', f * 2.8, 3);
    hiss(v, out, t, vel * 0.4, 0.05, 'lowpass', 900, 0);
  }

  // Storm strings: a section bowing tremolo: detuned saws whose level shivers at `rate` Hz, swelling in.
  function tremolo(v, out, t, notes, dur, vel, rate = 11) {
    const g = gain(v, 0);
    const end = sus(g.gain, t, vel, Math.min(0.3, dur * 0.3), t + dur, 0.25);
    const lp = filt(v, 'lowpass', 2400, 0);
    const trem = gain(v, 0.6);
    lfo(v, rate, 0.4, trem.gain, t, end, 'triangle');
    for (const m of notes) {
      for (const dt of [-8, 7]) {
        const o = osc(v, 'sawtooth', mtof(m), t, end);
        o.detune.value = dt;
        o.connect(lp);
      }
    }
    lp.connect(trem);
    trem.connect(g);
    g.connect(out);
  }

  // A heartbeat: "lub-dub", two soft driven thumps with a body band the small speakers can carry.
  function heartbeat(v, out, t, vel) {
    for (const [dt, a, f] of [[0, 1, 52], [0.24, 0.7, 46]]) {
      boom(v, out, t + dt, vel * a * 0.5, f, 0.26, 1.6);
      hiss(v, out, t + dt, vel * a * 1.8, 0.12, 'bandpass', 150, 1.6);
      hiss(v, out, t + dt, vel * a * 0.5, 0.06, 'bandpass', 320, 2);
    }
  }

  // A train of bubbles: little "bloop"s, each a sine sweeping up. `from`/`to` set the pitches the train starts and
  // ends around, `gap` its [first, last] spacing in seconds; `r` the random source (the music's seeded one there).
  function bubbleTrain(v, out, t, dur, vel, from = 300, to = 900, gap = [0.06, 0.2], r = Math.random) {
    const evs = [];
    for (let s = t; s < t + dur; ) {
      const u = (s - t) / dur;
      const f = (from + (to - from) * u) * (0.75 + 0.5 * r());
      const d = 0.03 + r() * 0.04;
      evs.push([s, f, d, vel * (0.5 + 0.5 * r())]);
      s += d + (gap[0] + (gap[1] - gap[0]) * u) * (0.5 + r());
    }
    if (!evs.length) return;
    const last = evs[evs.length - 1];
    const o = osc(v, 'sine', evs[0][1], t, last[0] + last[2] + 0.02);
    const g = gain(v, 0);
    for (const [s, f, d, a] of evs) {
      o.frequency.setValueAtTime(f, s);
      o.frequency.exponentialRampToValueAtTime(f * 1.9, s + d);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(a, s + 0.004);
      g.gain.exponentialRampToValueAtTime(a * 0.01, s + d);
      g.gain.linearRampToValueAtTime(0, s + d + 0.004);
    }
    o.connect(g);
    g.connect(out);
  }

  // A loop's level: in over `fade`, held, out over `fade` by `end` (the loops can be stopped early by their handle).
  function loopEnv(p, t, end, peak, fade) {
    const f = Math.min(fade, (end - t) * 0.4);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + f);
    p.setValueAtTime(peak, end - f);
    p.linearRampToValueAtTime(0, end);
  }

  // =========================================================================
  // One-shot sound effects: each builds into v.in, starting at t, with pitch p.
  // =========================================================================
  const R1 = () => 0.92 + Math.random() * 0.16; // ±8% per-shot variation

  const SFX = {
    cannon(v, t, p) {
      const q = p * R1();
      // Crack: a very short mid-band snap that gives the shot its edge.
      hiss(v, v.in, t, 0.5, 0.04, 'bandpass', 2000 * q, 0.8);
      // Blast: noise whose filter slams shut.
      const n = noise(v, t, t + 1.1);
      const lp = filt(v, 'lowpass', 4500, 1);
      lp.frequency.setValueAtTime(4500 * q, t);
      lp.frequency.exponentialRampToValueAtTime(1200 * q, t + 0.1);
      lp.frequency.exponentialRampToValueAtTime(260 * q, t + 0.95);
      const ng = gain(v, 0);
      perc(ng.gain, t, 0.7, 0.002, 0.75 + Math.random() * 0.2);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(v.in);
      // BOOM: a driven body falling from ~190 Hz to 56 Hz, and the chest of the blast (250-700 Hz).
      boom(v, v.in, t, 0.42, 56 * q, 0.45, 3.4);
      hiss(v, v.in, t, 1.5, 0.35, 'bandpass', 280 * q, 1.2);
      hiss(v, v.in, t, 0.6, 0.2, 'bandpass', 650 * q, 1);
      // Cartoon "pop" on top.
      const k = osc(v, 'triangle', 320 * q, t, t + 0.16);
      k.frequency.exponentialRampToValueAtTime(85 * q, t + 0.09);
      const kg = gain(v, 0);
      perc(kg.gain, t, 0.3, 0.002, 0.12);
      k.connect(kg);
      kg.connect(v.in);
      // The shot rolls away over the water.
      roomSend(v, 0.45);
    },

    splash(v, t, p) {
      const q = p * R1();
      // Plop: the ball punching into the water.
      const o = osc(v, 'sine', 560 * q, t, t + 0.2);
      o.frequency.exponentialRampToValueAtTime(150 * q, t + 0.09);
      const og = gain(v, 0);
      perc(og.gain, t, 0.55, 0.002, 0.13);
      o.connect(og);
      og.connect(v.in);
      // Whump: the body of water thrown up.
      hiss(v, v.in, t, 0.4, 0.3, 'lowpass', 380 * q, 0);
      // Spray: noise through a band-pass sweeping down, its fizz rolled off.
      const n = noise(v, t, t + 0.95);
      const bp = filt(v, 'bandpass', 2600, 1);
      bp.frequency.setValueAtTime(2600 * q, t);
      bp.frequency.exponentialRampToValueAtTime(600 * q, t + 0.6);
      const top = filt(v, 'lowpass', 5500, -3);
      const ng = gain(v, 0);
      perc(ng.gain, t, 0.6, 0.012, 0.8);
      n.connect(bp);
      bp.connect(top);
      top.connect(ng);
      ng.connect(v.in);
      // Droplets: tiny rising blips (one oscillator, re-triggered).
      const end = t + 0.75;
      const d = osc(v, 'sine', 1800, t, end);
      const dg = gain(v, 0);
      let tk = t + 0.1;
      for (let i = 0; i < 4; i++) {
        tk += 0.05 + Math.random() * 0.1;
        const f = (1300 + Math.random() * 1500) * q;
        d.frequency.setValueAtTime(f, tk);
        d.frequency.exponentialRampToValueAtTime(f * 1.6, tk + 0.03);
        dg.gain.setValueAtTime(0, tk);
        dg.gain.linearRampToValueAtTime(0.09, tk + 0.003);
        dg.gain.exponentialRampToValueAtTime(0.0002, tk + 0.04);
        dg.gain.linearRampToValueAtTime(0, tk + 0.045);
      }
      d.connect(dg);
      dg.connect(v.in);
    },

    hit(v, t, p) {
      const q = p * R1();
      // Crack: a sharp snap in the mid-highs (no fizz above 10 kHz).
      hiss(v, v.in, t, 0.9, 0.06, 'bandpass', 2200 * q, 0.9);
      // Woody "tok": two hull resonances, plus a driven thud.
      hiss(v, v.in, t, 1.1, 0.22, 'bandpass', 420 * q, 6);
      hiss(v, v.in, t, 0.9, 0.12, 'bandpass', 850 * q, 5);
      boom(v, v.in, t, 0.25, 90 * q, 0.2, 2);
      // Splinters: a few tiny clicks shortly after.
      const end = t + 0.45;
      const n = noise(v, t, end);
      const sp = filt(v, 'bandpass', 3800, 1.4);
      const g = gain(v, 0);
      let tk = t + 0.02;
      for (let i = 0; i < 5; i++) {
        tk += 0.03 + Math.random() * 0.05;
        const a = 0.3 + Math.random() * 0.4;
        g.gain.setValueAtTime(0, tk);
        g.gain.linearRampToValueAtTime(a, tk + 0.002);
        g.gain.exponentialRampToValueAtTime(a * 1e-3, tk + 0.02);
        g.gain.linearRampToValueAtTime(0, tk + 0.025);
      }
      n.connect(sp);
      sp.connect(g);
      g.connect(v.in);
    },

    sink(v, t, p) {
      const q = p * R1();
      // Groan: a low sawtooth that wobbles down, through a nasal band-pass.
      const end = t + 3.4;
      const o = osc(v, 'sawtooth', 90 * q, t, end);
      const f = o.frequency;
      f.setValueAtTime(90 * q, t);
      f.linearRampToValueAtTime(115 * q, t + 0.35);
      f.linearRampToValueAtTime(72 * q, t + 0.9);
      f.linearRampToValueAtTime(96 * q, t + 1.5);
      f.linearRampToValueAtTime(58 * q, t + 2.4);
      f.linearRampToValueAtTime(64 * q, t + 3.2);
      lfo(v, 6.5, 4 * q, f, t, end);
      const bp = filt(v, 'bandpass', 650, 5);
      bp.frequency.setValueAtTime(800, t);
      bp.frequency.exponentialRampToValueAtTime(320, t + 2.8);
      const g = gain(v, 0);
      sus(g.gain, t, 0.55, 0.18, t + 2.0, 1.1);
      o.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      // Gurgle: low rushing water.
      hiss(v, v.in, t + 0.2, 0.22, 2.6, 'lowpass', 450 * q, 0);
      // Bubbles: two streams of short rising blips.
      for (let s = 0; s < 2; s++) {
        const b = osc(v, 'sine', 400, t, t + 4.2);
        const bg = gain(v, 0);
        let tk = t + 0.4 + s * 0.11;
        while (tk < t + 3.9) {
          const fb = (260 + Math.random() * 700) * q;
          const dur = 0.035 + Math.random() * 0.05;
          const a = 0.12 + Math.random() * 0.15;
          b.frequency.setValueAtTime(fb, tk);
          b.frequency.exponentialRampToValueAtTime(fb * 1.8, tk + dur);
          bg.gain.setValueAtTime(0, tk);
          bg.gain.linearRampToValueAtTime(a, tk + 0.004);
          bg.gain.exponentialRampToValueAtTime(a * 0.01, tk + dur);
          bg.gain.linearRampToValueAtTime(0, tk + dur + 0.004);
          tk += dur + 0.06 + Math.random() * 0.22;
        }
        b.connect(bg);
        bg.connect(v.in);
      }
    },

    coin(v, t, p) {
      // B5 → E6: the classic two-note pickup, with a light FM shimmer.
      bell(v, v.in, t, 987.77 * p, 0.2, 0.18, 3, 0.25);
      bell(v, v.in, t + 0.07, 1318.51 * p, 0.24, 0.45, 3, 0.25);
      bell(v, v.in, t + 0.07, 2637 * p, 0.05, 0.25, 2, 0.2);
    },

    bombWhistle(v, t, p, o) {
      const dur = clamp(Number(o.duration) || 2.5, 0.4, 6);
      const end = t + dur + 0.06;
      const q = p * (0.95 + Math.random() * 0.1); // bombs come every few seconds: no two whistles alike
      const hi = 2300 * q;
      const lo = 650 * q;
      // A falling tone with a slight warble...
      const w = osc(v, 'sine', hi, t, end);
      w.frequency.setValueAtTime(hi, t);
      w.frequency.exponentialRampToValueAtTime(lo, t + dur);
      lfo(v, 7, 20 * p, w.frequency, t, end);
      // ...and air rushing past, tracking the same pitch.
      const n = noise(v, t, end);
      const bp = filt(v, 'bandpass', hi, 14);
      bp.frequency.setValueAtTime(hi, t);
      bp.frequency.exponentialRampToValueAtTime(lo, t + dur);
      const g = gain(v, 0);
      const ng = gain(v, 0);
      for (const [param, peak] of [[g.gain, 0.3], [ng.gain, 0.9]]) {
        param.setValueAtTime(0, t);
        param.linearRampToValueAtTime(peak * 0.3, t + Math.min(0.3, dur * 0.3));
        param.linearRampToValueAtTime(peak, t + dur - 0.02);
        param.linearRampToValueAtTime(0, t + dur + 0.05);
      }
      w.connect(g);
      g.connect(v.in);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(v.in);
    },

    bombBoom(v, t, p) {
      const q = p * R1();
      // Blast: noise through a slowly closing low-pass.
      const n = noise(v, t, t + 1.9);
      const lp = filt(v, 'lowpass', 4500, 0);
      lp.frequency.setValueAtTime(4500 * q, t);
      lp.frequency.exponentialRampToValueAtTime(650 * q, t + 0.25);
      lp.frequency.exponentialRampToValueAtTime(170 * q, t + 1.6);
      const ng = gain(v, 0);
      perc(ng.gain, t, 0.95, 0.003, 1.75);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(v.in);
      // KA-BOOM: a big driven body, deeper and longer than the cannon's, with a chest around 250 Hz.
      boom(v, v.in, t, 0.6, 44 * q, 1.0, 3.2);
      hiss(v, v.in, t, 1.4, 0.6, 'bandpass', 240 * q, 1.1);
      // Debris crackle.
      const c = sample(v, R.crackle, t + 0.05, t + 1.6, 0.9 * q, Math.random() * 1.2);
      const cbp = filt(v, 'bandpass', 2400, 0.7);
      const cg = gain(v, 0);
      sus(cg.gain, t + 0.05, 0.6, 0.02, t + 0.6, 0.9);
      c.connect(cbp);
      cbp.connect(cg);
      cg.connect(v.in);
      // Steam hiss: lava meeting the sea (kept out of the very top so it does not fizz).
      const h = noise(v, t + 0.1, t + 2.8);
      const hb = filt(v, 'bandpass', 3600, 0.9);
      const hg = gain(v, 0);
      sus(hg.gain, t + 0.1, 0.2, 0.35, t + 0.9, 1.5);
      h.connect(hb);
      hb.connect(hg);
      hg.connect(v.in);
      roomSend(v, 0.5);
    },

    wave(v, t, p) {
      // A ship's bell, then a battle horn in octaves: "bwaa-BWAAAH".
      bell(v, v.in, t, 1046 * p, 0.12, 1.6, 2.4, 0.5);
      brassChord(v, v.in, t + 0.08, [mtof(38) * p, mtof(50) * p], 0.3, 0.3, 0.7);
      brassChord(v, v.in, t + 0.45, [mtof(45) * p, mtof(57) * p], 1.0, 0.36, 0.8);
      hiss(v, v.in, t + 0.45, 0.05, 0.6, 'highpass', 5000, -3);
      v.pn.connect(sfxVerb);
    },

    levelClear(v, t, p) {
      // C E G → big C major chord, with bells and a cymbal.
      brassLine(v, v.in, [[t, mtof(72) * p, 0.1, 0.03], [t + 0.13, mtof(76) * p, 0.1, 0.03], [t + 0.26, mtof(79) * p, 0.1, 0.03]], 0.22, 1.1);
      const tc = t + 0.4;
      brassChord(v, v.in, tc, [60, 64, 67, 72].map((m) => mtof(m) * p), 0.95, 0.24, 1);
      [84, 88, 91, 96].forEach((m, i) => bell(v, v.in, tc + i * 0.06, mtof(m) * p, 0.07, 0.9, 3.5, 0.5));
      drum(v, v.in, tc, 0.5, 55, 0.4);
      hiss(v, v.in, tc, 0.12, 1.3, 'highpass', 5500, -3);
      v.pn.connect(sfxVerb);
    },

    victory(v, t, p) {
      const b = 0.25; // eighth note at 120 bpm
      // Snare roll building into the first downbeat (one noise source, re-triggered).
      const n = noise(v, t, t + 1.05);
      const hp = filt(v, 'highpass', 1800, -3);
      const sg = gain(v, 0);
      for (let i = 0; i < 16; i++) {
        const s = t + i * 0.0625;
        const a = 0.03 + i * 0.006;
        sg.gain.setValueAtTime(0, s);
        sg.gain.linearRampToValueAtTime(a, s + 0.002);
        sg.gain.exponentialRampToValueAtTime(a * 1e-3, s + 0.055);
        sg.gain.linearRampToValueAtTime(0, s + 0.06);
      }
      n.connect(hp);
      hp.connect(sg);
      sg.connect(v.in);
      const t1 = t + 1.0;
      const line = [
        [0, 67, 0.2], [1, 72, 0.2], [2, 76, 0.2], [3, 79, 0.2], [4, 84, 0.85],
        [8, 81, 0.2], [9, 77, 0.2], [10, 81, 0.2], [11, 84, 0.2], [12, 86, 0.45], [14, 83, 0.45], [16, 84, 1.6],
      ];
      brassLine(v, v.in, line.map(([at, m, d], i) => [t1 + at * b, mtof(m) * p, d, i === line.length - 1 ? 0.3 : 0.04]), 0.2, 1.1);
      const chords = [[4, [60, 64, 67], 0.9], [8, [53, 57, 60], 0.9], [12, [55, 59, 62], 0.9], [16, [48, 55, 60, 64], 1.6]];
      for (const [at, ms, d] of chords) {
        brassChord(v, v.in, t1 + at * b, ms.map((m) => mtof(m) * p), d, 0.14, 0.8);
        drum(v, v.in, t1 + at * b, 0.45, 50, 0.5);
      }
      for (const at of [12, 14]) drum(v, v.in, t1 + at * b, 0.35, 60, 0.35);
      const tf = t1 + 16 * b;
      [84, 88, 91, 96, 100].forEach((m, i) => bell(v, v.in, tf + i * 0.07, mtof(m) * p, 0.06, 1.4, 3.5, 0.5));
      hiss(v, v.in, tf, 0.16, 2.2, 'highpass', 5000, -3);
      v.pn.connect(sfxVerb);
    },

    defeat(v, t, p) {
      // Sad trombone: G, F#, F, then a long wobbling E. One legato voice with a plunger "wah".
      const steps = [[0, 55, 0.36], [0.4, 54, 0.36], [0.8, 53, 0.36], [1.2, 52, 1.5]];
      const end = t + 3.0;
      const g = gain(v, 0);
      const lp = filt(v, 'lowpass', 600, 5);
      const oscs = [osc(v, 'sawtooth', mtof(55) * p, t, end), osc(v, 'sawtooth', mtof(55) * p, t, end)];
      oscs[1].detune.value = 8;
      const vib = osc(v, 'sine', 5, t, end);
      const depth = gain(v, 0);
      vib.connect(depth);
      for (const o of oscs) {
        depth.connect(o.frequency);
        o.connect(lp);
      }
      for (const [at, m, d] of steps) {
        const s = t + at;
        const f = mtof(m) * p;
        for (const o of oscs) {
          o.frequency.setValueAtTime(f * 0.97, s);
          o.frequency.exponentialRampToValueAtTime(f, s + 0.06);
        }
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.4, s + 0.04);
        g.gain.setValueAtTime(0.4, s + d - 0.06);
        g.gain.linearRampToValueAtTime(0, s + d);
        lp.frequency.setValueAtTime(350, s);
        lp.frequency.exponentialRampToValueAtTime(1400, s + 0.12);
        lp.frequency.exponentialRampToValueAtTime(500, s + d);
      }
      // The last note droops and wobbles.
      depth.gain.setValueAtTime(0, t + 1.3);
      depth.gain.linearRampToValueAtTime(mtof(52) * p * 0.025, t + 1.9);
      for (const o of oscs) o.frequency.setTargetAtTime(mtof(51.3) * p, t + 2.2, 0.3);
      g.connect(v.in);
      lp.connect(g);
      v.pn.connect(sfxVerb);
    },

    click(v, t, p) {
      const o = osc(v, 'sine', 1500 * p, t, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(800 * p, t + 0.03);
      const g = gain(v, 0);
      perc(g.gain, t, 0.22, 0.001, 0.05);
      o.connect(g);
      g.connect(v.in);
      hiss(v, v.in, t, 0.12, 0.025, 'bandpass', 2500 * p, 3);
    },

    reef(v, t, p) {
      const q = p * R1();
      const end = t + 1.05;
      // Grinding: noise chopped by an uneven sawtooth, then band-passed.
      const n = noise(v, t, end);
      const chop = gain(v, 0.5);
      const l = lfo(v, 38, 0.5, chop.gain, t, end, 'sawtooth');
      l.frequency.setValueAtTime(30, t);
      l.frequency.linearRampToValueAtTime(52, t + 0.35);
      l.frequency.linearRampToValueAtTime(24, t + 0.9);
      const bp = filt(v, 'bandpass', 900 * q, 1.4);
      bp.frequency.setValueAtTime(1100 * q, t);
      bp.frequency.exponentialRampToValueAtTime(600 * q, t + 0.9);
      const g = gain(v, 0);
      sus(g.gain, t, 0.6, 0.05, t + 0.55, 0.4);
      n.connect(chop);
      chop.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      // Low rumble of the hull riding up.
      hiss(v, v.in, t, 0.5, 0.8, 'lowpass', 220 * q, 0);
      // Timber complaining.
      const c = osc(v, 'sawtooth', 140 * q, t, end);
      c.frequency.linearRampToValueAtTime(110 * q, t + 0.9);
      const cbp = filt(v, 'bandpass', 600 * q, 6);
      const cg = gain(v, 0);
      sus(cg.gain, t + 0.05, 0.2, 0.08, t + 0.5, 0.35);
      c.connect(cbp);
      cbp.connect(cg);
      cg.connect(v.in);
    },

    sailUp(v, t, p) {
      // Rope through a block: a quick, rising ratchet...
      const end = t + 1.2;
      const n = noise(v, t, end);
      const bp = filt(v, 'bandpass', 1800 * p, 7);
      const g = gain(v, 0);
      let tk = t;
      for (let i = 0; i < 8; i++) {
        const f = (1700 + i * 190) * p;
        bp.frequency.setValueAtTime(f, tk);
        g.gain.setValueAtTime(0, tk);
        g.gain.linearRampToValueAtTime(0.7, tk + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0007, tk + 0.025);
        g.gain.linearRampToValueAtTime(0, tk + 0.03);
        tk += 0.065 - i * 0.004;
      }
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      // ...then the canvas fills with a fluttering whump.
      clothFlap(v, tk + 0.03, p, 0.5, 13, 0.45);
      drum(v, v.in, tk + 0.05, 0.25, 70 * p, 0.25, 1.6);
    },

    sailDown(v, t, p) {
      // Rope paying out: a descending zip...
      const end = t + 0.5;
      const n = noise(v, t, end);
      const bp = filt(v, 'bandpass', 3000 * p, 5);
      bp.frequency.setValueAtTime(3000 * p, t);
      bp.frequency.exponentialRampToValueAtTime(800 * p, t + 0.35);
      const chop = gain(v, 0.6);
      lfo(v, 60, 0.4, chop.gain, t, end, 'square');
      const g = gain(v, 0);
      sus(g.gain, t, 0.35, 0.02, t + 0.28, 0.12);
      n.connect(bp);
      bp.connect(chop);
      chop.connect(g);
      g.connect(v.in);
      // ...and the loose sail luffing.
      clothFlap(v, t + 0.22, p, 0.45, 8, 0.8);
    },

    // ---- Boarding, the new shot, crits and rakes, Act II hazards, the town.

    grapple(v, t, p) {
      const q = p * R1();
      // Three hooks whirled and thrown a beat apart: a rope swish each, then the iron biting into her rail
      // (a wooden thunk and a short clank).
      for (let k = 0; k < 3; k++) {
        const s = t + k * 0.12 + Math.random() * 0.03;
        const n = noise(v, s, s + 0.24);
        const bp = filt(v, 'bandpass', 600 * q, 2.5);
        bp.frequency.setValueAtTime(600 * q, s);
        bp.frequency.exponentialRampToValueAtTime(2200 * q, s + 0.09);
        bp.frequency.exponentialRampToValueAtTime(800 * q, s + 0.22);
        const g = gain(v, 0);
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.45, s + 0.09);
        g.gain.linearRampToValueAtTime(0, s + 0.22);
        n.connect(bp);
        bp.connect(g);
        g.connect(v.in);
        const hit = s + 0.34 + Math.random() * 0.03;
        const f = (1500 + Math.random() * 500) * q;
        hiss(v, v.in, hit, 1.6, 0.1, 'bandpass', 480 * q, 4);
        hiss(v, v.in, hit, 0.6, 0.03, 'bandpass', 2400 * q, 2);
        drum(v, v.in, hit, 0.25, 120 * q, 0.08, 1.5);
        bell(v, v.in, hit, f, 0.12, 0.25, 2.76, 0.9);
        bell(v, v.in, hit + 0.004, f * 1.47, 0.06, 0.16, 1.9, 0.5);
      }
      // The lines paying out over the gunwale.
      const z = t + 0.12;
      const n = noise(v, z, z + 0.32);
      const bp = filt(v, 'bandpass', 3200 * q, 4);
      const chop = gain(v, 0.5);
      lfo(v, 85, 0.5, chop.gain, z, z + 0.32, 'sawtooth');
      const g = gain(v, 0);
      sus(g.gain, z, 0.25, 0.03, z + 0.18, 0.1);
      n.connect(bp);
      bp.connect(chop);
      chop.connect(g);
      g.connect(v.in);
    },

    heave(v, t, p) {
      const q = p * R1();
      // "HUP!" from three throats, the rope groaning taut and the block's pawl clicking round.
      for (const [f0, dt, pan] of [[118, 0, -0.3], [146, 0.015, 0.3], [176, 0.03, 0]]) {
        const s = t + dt + Math.random() * 0.02;
        const f = f0 * q * (0.95 + Math.random() * 0.1);
        const e = s + 0.22;
        const pn = panner(v, pan);
        pn.connect(v.in);
        vox(v, pn, [[s, f * 1.1], [s + 0.06, f * 1.18], [e, f * 0.85]], [[s, 520, 1250], [e, 620, 1150]],
          [[s, 0], [s + 0.02, 0.9], [s + 0.13, 0.7], [e, 0]], 0, 0.5);
      }
      const c = osc(v, 'sawtooth', 95 * q, t + 0.02, t + 0.44);
      c.frequency.linearRampToValueAtTime(150 * q, t + 0.36);
      const cb = filt(v, 'bandpass', 900 * q, 7);
      const cg = gain(v, 0);
      sus(cg.gain, t + 0.02, 0.35, 0.05, t + 0.28, 0.1);
      c.connect(cb);
      cb.connect(cg);
      cg.connect(v.in);
      for (let k = 0; k < 3; k++) hiss(v, v.in, t + 0.06 + k * 0.07, 0.25, 0.015, 'bandpass', 2600 * q, 4);
    },

    clash(v, t, p) {
      const q = p * R1();
      // Steel on steel: a bright snap and the dull thump of the blow, then the blades ringing (inharmonic partials,
      // each doubled a few Hz apart so it rings rough and short), sometimes a scrape as they slide apart.
      hiss(v, v.in, t, 0.8, 0.03, 'highpass', 3000, -3);
      hiss(v, v.in, t, 0.6, 0.12, 'bandpass', 5200 * q, 1.5);
      hiss(v, v.in, t, 0.4, 0.08, 'bandpass', 400 * q, 2);
      const f = (950 + Math.random() * 400) * q;
      for (const [r, a, d] of [[1, 0.16, 0.45], [1.59, 0.09, 0.32], [2.76, 0.12, 0.3], [3.93, 0.06, 0.22], [5.4, 0.07, 0.16], [7.1, 0.03, 0.1]]) {
        const g = gain(v, 0);
        const end = perc(g.gain, t, a, 0.001, d * (0.85 + Math.random() * 0.3));
        const fr = f * r * (0.99 + Math.random() * 0.02);
        for (const dt of [-4, 4]) osc(v, 'sine', fr + dt * r, t, end).connect(g);
        g.connect(v.in);
      }
      if (Math.random() < 0.6) {
        const s = t + 0.03;
        const n = noise(v, s, s + 0.2);
        const bp = filt(v, 'bandpass', 5000 * q, 3);
        bp.frequency.setValueAtTime(5000 * q, s);
        bp.frequency.exponentialRampToValueAtTime(2600 * q, s + 0.16);
        const g = gain(v, 0);
        sus(g.gain, s, 0.18, 0.02, s + 0.08, 0.08);
        n.connect(bp);
        bp.connect(g);
        g.connect(v.in);
      }
    },

    cheer(v, t, p) {
      const q = p * R1();
      // "Hoo-RAY!" from seven throats, each its own pitch, timing and place on the deck...
      for (let k = 0; k < 7; k++) {
        const s = t + Math.random() * 0.09;
        const f = (100 + Math.random() * 130) * q;
        const turn = s + 0.15 + Math.random() * 0.07;
        const end = turn + 0.55 + Math.random() * 0.4;
        const a = 0.5 + Math.random() * 0.3;
        const pn = panner(v, (k / 6) * 1.2 - 0.6);
        pn.connect(v.in);
        vox(v, pn,
          [[s, f * 0.9], [turn, f], [turn + 0.12, f * 1.5], [end, f * 1.25]],
          [[s, 330, 880], [turn, 360, 950], [turn + 0.09, 700, 1650], [end, 560, 1900]],
          [[s, 0], [s + 0.05, a * 0.55], [turn, a * 0.45], [turn + 0.05, a], [end - 0.25, a * 0.8], [end, 0]],
          0.025, 0.6);
      }
      // ...then a few whoops over the top...
      for (let k = 0; k < 3; k++) {
        const s = t + 0.55 + k * 0.17 + Math.random() * 0.1;
        const f = (220 + Math.random() * 110) * q;
        const end = s + 0.3 + Math.random() * 0.15;
        const pn = panner(v, Math.random() * 1.4 - 0.7);
        pn.connect(v.in);
        vox(v, pn, [[s, f], [s + 0.1, f * 1.6], [end, f * 1.3]], [[s, 400, 1900], [end, 750, 1300]],
          [[s, 0], [s + 0.03, 0.45], [end - 0.08, 0.3], [end, 0]], 0.03, 0);
      }
      // ...and the crowd's breath under it all.
      const n = noise(v, t, t + 1.5);
      const bp = filt(v, 'bandpass', 1300, 0.8);
      const g = gain(v, 0);
      sus(g.gain, t + 0.15, 0.06, 0.1, t + 0.8, 0.5);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      roomSend(v, 0.25);
    },

    capture(v, t, p) {
      // A prize! A bugle call up the C major triad, a big "ta-DAAA" chord, and the prize money showering down.
      const b = 0.11;
      brassLine(v, v.in, [
        [t, mtof(67) * p, 0.07, 0.03], [t + b, mtof(72) * p, 0.07, 0.03], [t + 2 * b, mtof(76) * p, 0.07, 0.03],
        [t + 3 * b, mtof(79) * p, 0.14, 0.03], [t + 5 * b, mtof(76) * p, 0.07, 0.03], [t + 6 * b, mtof(79) * p, 0.75, 0.25],
      ], 0.22, 1.15);
      const tc = t + 6 * b;
      brassChord(v, v.in, tc, [48, 55, 60, 64].map((m) => mtof(m) * p), 0.75, 0.22, 0.9);
      drum(v, v.in, t + 3 * b, 0.25, 70, 0.2);
      drum(v, v.in, tc, 0.5, 52, 0.45);
      hiss(v, v.in, tc, 0.14, 1.2, 'highpass', 5500, -3);
      [96, 93, 91, 88, 86, 84, 81, 79, 84, 88, 91, 96].forEach((m, i) => {
        const s = tc + 0.05 + i * 0.07 + Math.random() * 0.03;
        bell(v, v.in, s, mtof(m) * p * (0.995 + Math.random() * 0.01), 0.05 * (1 - i * 0.05), 0.3, 3, 0.25);
      });
      v.pn.connect(sfxVerb);
    },

    crit(v, t, p) {
      const q = p * R1();
      // KRANG! A heavy blow (a driven thump and a cracking snap)...
      boom(v, v.in, t, 0.2, 90 * q, 0.18, 2.2);
      hiss(v, v.in, t, 1.2, 0.07, 'bandpass', 1500 * q, 1.2);
      hiss(v, v.in, t, 0.7, 0.04, 'highpass', 4000, -3);
      bell(v, v.in, t, 820 * q, 0.12, 0.35, 2.76, 2.2);
      // ...and a bright "shing!" sweeping up into a burst of star sparkles.
      const o = osc(v, 'sine', 1400 * q, t + 0.02, t + 0.4);
      o.frequency.exponentialRampToValueAtTime(4200 * q, t + 0.16);
      const og = gain(v, 0);
      perc(og.gain, t + 0.02, 0.22, 0.01, 0.3);
      o.connect(og);
      og.connect(v.in);
      hiss(v, v.in, t + 0.02, 0.25, 0.25, 'bandpass', 6500, 2);
      bell(v, v.in, t + 0.05, 2637 * q, 0.16, 0.7, 1.5, 1.6);
      [3136, 3951, 4699].forEach((f, i) => bell(v, v.in, t + 0.12 + i * 0.06, f * q, 0.09, 0.3, 3, 0.3));
      roomSend(v, 0.3);
    },

    rake(v, t, p) {
      const q = p * R1();
      // A broadside raking her from end to end: a deep whump, six cracks running along the hull (and across the
      // stereo field), and a hail of splinters.
      boom(v, v.in, t, 0.4, 55 * q, 0.45, 3);
      for (let k = 0; k < 6; k++) {
        const s = t + 0.02 + k * 0.055 + Math.random() * 0.02;
        const pn = panner(v, -0.45 + k * 0.18);
        pn.connect(v.in);
        const r = q * (1.08 - k * 0.04);
        hiss(v, pn, s, 0.75, 0.05, 'bandpass', 2100 * r, 0.9);
        hiss(v, pn, s, 0.9, 0.16, 'bandpass', 430 * r, 5);
        hiss(v, pn, s, 0.6, 0.1, 'bandpass', 880 * r, 4);
      }
      const n = noise(v, t + 0.05, t + 0.75);
      const sp = filt(v, 'bandpass', 3600, 1.3);
      const g = gain(v, 0);
      for (let tk = t + 0.06; tk < t + 0.65; tk += 0.024 + Math.random() * 0.04) {
        const a = 0.15 + Math.random() * 0.35;
        g.gain.setValueAtTime(0, tk);
        g.gain.linearRampToValueAtTime(a, tk + 0.002);
        g.gain.exponentialRampToValueAtTime(a * 1e-3, tk + 0.018);
        g.gain.linearRampToValueAtTime(0, tk + 0.022);
      }
      n.connect(sp);
      sp.connect(g);
      g.connect(v.in);
      roomSend(v, 0.3);
    },

    chain(v, t, p) {
      const q = p * R1();
      const end = t + 0.85;
      // Two balls on a chain whirling end over end: a chopped "whup-whup" of air that slows and drops in pitch as
      // it goes by, and a link or two rattling.
      const n = noise(v, t, end);
      const bp = filt(v, 'bandpass', 1300 * q, 2.2);
      bp.frequency.setValueAtTime(1300 * q, t);
      bp.frequency.exponentialRampToValueAtTime(800 * q, end);
      const tone = osc(v, 'sine', 640 * q, t, end);
      tone.frequency.exponentialRampToValueAtTime(470 * q, end);
      const tg = gain(v, 0.08);
      const chop = gain(v, 0.5);
      const body = noise(v, t, end);
      const blp = filt(v, 'lowpass', 380 * q, 2);
      body.connect(blp);
      blp.connect(chop);
      const spin = lfo(v, 24, 0.5, chop.gain, t, end, 'triangle');
      spin.frequency.linearRampToValueAtTime(15, end);
      const g = gain(v, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.7, t + 0.15);
      g.gain.setValueAtTime(0.7, t + 0.5);
      g.gain.linearRampToValueAtTime(0, end);
      n.connect(bp);
      bp.connect(chop);
      tone.connect(tg);
      tg.connect(chop);
      chop.connect(g);
      g.connect(v.in);
      for (let k = 0; k < 7; k++) bell(v, v.in, t + 0.05 + Math.random() * 0.65, (2200 + Math.random() * 1600) * q, 0.06, 0.07, 2.4, 1.1);
    },

    grape(v, t, p) {
      const q = p * R1();
      // A bag of musket balls let fly: a blunt "fwump", pellets zipping past, then a hail of them peppering wood.
      hiss(v, v.in, t, 1.4, 0.16, 'lowpass', 900 * q, 0);
      hiss(v, v.in, t, 0.5, 0.05, 'bandpass', 2000 * q, 1);
      boom(v, v.in, t, 0.3, 80 * q, 0.16, 2);
      for (let k = 0; k < 3; k++) {
        const s = t + 0.03 + Math.random() * 0.12;
        const f = (2600 + Math.random() * 1400) * q;
        const o = osc(v, 'sine', f, s, s + 0.1);
        o.frequency.exponentialRampToValueAtTime(f * 0.6, s + 0.09);
        const g = gain(v, 0);
        perc(g.gain, s, 0.04, 0.01, 0.08);
        o.connect(g);
        g.connect(v.in);
      }
      const n = noise(v, t + 0.08, t + 0.65);
      const bp = filt(v, 'bandpass', 1800, 3);
      const g = gain(v, 0);
      for (let k = 0, tk = t + 0.1; k < 16; k++, tk += 0.029 + Math.random() * Math.random() * 0.02) {
        const a = (0.45 + Math.random() * 0.4) * (1 - k * 0.04);
        bp.frequency.setValueAtTime((900 + Math.random() * 2400) * q, tk);
        g.gain.setValueAtTime(0, tk);
        g.gain.linearRampToValueAtTime(a, tk + 0.002);
        g.gain.exponentialRampToValueAtTime(a * 1e-3, tk + 0.025);
        g.gain.linearRampToValueAtTime(0, tk + 0.028);
      }
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
    },

    cut(v, t, p) {
      const q = p * R1();
      // An axe bites through a taut line: THOCK, the rope parts with a twang and a snap, and whips away.
      hiss(v, v.in, t, 1.8, 0.09, 'bandpass', 620 * q, 4);
      hiss(v, v.in, t, 0.9, 0.05, 'bandpass', 1500 * q, 2);
      hiss(v, v.in, t, 0.5, 0.02, 'highpass', 3000, -3);
      boom(v, v.in, t, 0.22, 110 * q, 0.12, 1.6);
      const s = t + 0.035;
      const o = osc(v, 'sawtooth', 240 * q, s, s + 0.3);
      o.frequency.exponentialRampToValueAtTime(85 * q, s + 0.22);
      const bp = filt(v, 'bandpass', 1300 * q, 3);
      const og = gain(v, 0);
      perc(og.gain, s, 0.5, 0.003, 0.22);
      o.connect(bp);
      bp.connect(og);
      og.connect(v.in);
      hiss(v, v.in, s, 0.45, 0.035, 'highpass', 2200, -3);
      const w = s + 0.05;
      const n = noise(v, w, w + 0.32);
      const wb = filt(v, 'bandpass', 2600 * q, 2);
      wb.frequency.setValueAtTime(2600 * q, w);
      wb.frequency.exponentialRampToValueAtTime(600 * q, w + 0.28);
      const wg = gain(v, 0);
      sus(wg.gain, w, 0.3, 0.04, w + 0.12, 0.12);
      n.connect(wb);
      wb.connect(wg);
      wg.connect(v.in);
    },

    crunch(v, t, p) {
      const q = p * R1();
      // The hull rides up onto an ice floe: a thud, cracks running through the ice, a grinding scrape and shards
      // tinkling down.
      boom(v, v.in, t, 0.35, 62 * q, 0.35, 2.4);
      hiss(v, v.in, t, 0.7, 0.18, 'lowpass', 300 * q, 0);
      for (const [dt, a] of [[0, 0.8], [0.07, 0.5], [0.16, 0.6], [0.29, 0.35]]) {
        hiss(v, v.in, t + dt + Math.random() * 0.02, a, 0.035, 'highpass', 2400 * q, -3);
        hiss(v, v.in, t + dt, a * 0.8, 0.07, 'bandpass', 1100 * q, 3);
      }
      const c = sample(v, R.crackle, t + 0.02, t + 0.6, 1.4 * q, Math.random() * 2);
      const cb = filt(v, 'bandpass', 3200, 0.8);
      const cg = gain(v, 0);
      sus(cg.gain, t + 0.02, 0.9, 0.01, t + 0.25, 0.3);
      c.connect(cb);
      cb.connect(cg);
      cg.connect(v.in);
      const end = t + 0.75;
      const n = noise(v, t + 0.05, end);
      const chop = gain(v, 0.5);
      lfo(v, 31, 0.5, chop.gain, t + 0.05, end, 'sawtooth');
      const gb = filt(v, 'bandpass', 750 * q, 1.6);
      const gg = gain(v, 0);
      sus(gg.gain, t + 0.05, 0.35, 0.05, t + 0.35, 0.3);
      n.connect(chop);
      chop.connect(gb);
      gb.connect(gg);
      gg.connect(v.in);
      for (let k = 0; k < 5; k++) bell(v, v.in, t + 0.2 + Math.random() * 0.45, (3000 + Math.random() * 3500) * q, 0.025, 0.12, 2.9, 0.6);
    },

    thunder(v, t, p) {
      const q = p * R1();
      // Lightning: the crack of the bolt (a tearing ripple of snaps), a deep boom, then the roll rumbling away in
      // uneven waves.
      hiss(v, v.in, t, 1.4, 0.18, 'highpass', 1500, -3);
      hiss(v, v.in, t, 1.2, 0.3, 'bandpass', 900 * q, 0.8);
      const c = sample(v, R.crackle, t, t + 0.55, 1.6 * q, Math.random() * 2);
      const cb = filt(v, 'highpass', 1000, -3);
      const cg = gain(v, 0);
      sus(cg.gain, t, 2, 0.005, t + 0.15, 0.35);
      c.connect(cb);
      cb.connect(cg);
      cg.connect(v.in);
      boom(v, v.in, t + 0.02, 0.32, 48 * q, 1.1, 2.4);
      hiss(v, v.in, t + 0.02, 1.4, 0.7, 'bandpass', 220 * q, 1);
      const end = t + 4.2;
      const n = noise(v, t + 0.05, end);
      const lp = filt(v, 'lowpass', 1200, 0);
      lp.frequency.setValueAtTime(1200 * q, t + 0.05);
      lp.frequency.exponentialRampToValueAtTime(450 * q, t + 0.9);
      lp.frequency.exponentialRampToValueAtTime(140 * q, end - 0.2);
      const g = gain(v, 0);
      let tk = t + 0.05;
      let a = 1.4;
      g.gain.setValueAtTime(0, tk);
      g.gain.linearRampToValueAtTime(a, tk + 0.06);
      while (tk < end - 0.9) {
        const d = 0.35 + Math.random() * 0.55;
        g.gain.linearRampToValueAtTime(a * (0.15 + Math.random() * 0.2), tk + d * 0.55);
        a *= 0.65 + Math.random() * 0.25;
        g.gain.linearRampToValueAtTime(a, tk + d);
        tk += d;
      }
      g.gain.linearRampToValueAtTime(0, end);
      n.connect(lp);
      lp.connect(g);
      g.connect(v.in);
      roomSend(v, 0.6);
    },

    step(v, t, p) {
      const q = p * R1();
      // A boot on a boardwalk plank: a soft heel thump, the wood's "tok" and a scuff; now and then the plank creaks.
      drum(v, v.in, t, 0.3, 85 * q, 0.07, 1.4);
      hiss(v, v.in, t, 0.7, 0.06, 'bandpass', 620 * q, 3);
      hiss(v, v.in, t + 0.004, 0.35, 0.04, 'bandpass', 1350 * q, 4);
      hiss(v, v.in, t + 0.012, 0.08, 0.03, 'highpass', 3000, -3);
      if (Math.random() < 0.15) {
        const o = osc(v, 'sawtooth', 160 * q, t + 0.03, t + 0.2);
        o.frequency.linearRampToValueAtTime(210 * q, t + 0.15);
        const bp = filt(v, 'bandpass', 1100 * q, 8);
        const g = gain(v, 0);
        sus(g.gain, t + 0.03, 0.12, 0.03, t + 0.12, 0.05);
        o.connect(bp);
        bp.connect(g);
        g.connect(v.in);
      }
    },

    overboard(v, t, p) {
      const q = p * R1();
      // "Waaaah!" A sailor goes over the rail yelling all the way down, then a body-sized splash.
      const f = (190 + Math.random() * 60) * q;
      const fall = 0.55;
      vox(v, v.in, [[t, f * 1.5], [t + 0.08, f * 1.7], [t + fall, f * 0.85]], [[t, 650, 1100], [t + fall, 800, 1250]],
        [[t, 0], [t + 0.04, 0.9], [t + fall - 0.08, 0.7], [t + fall, 0]], 0.04, 0.3);
      const s = t + fall + 0.03;
      const o = osc(v, 'sine', 380 * q, s, s + 0.25);
      o.frequency.exponentialRampToValueAtTime(95 * q, s + 0.12);
      const og = gain(v, 0);
      perc(og.gain, s, 0.6, 0.003, 0.18);
      o.connect(og);
      og.connect(v.in);
      hiss(v, v.in, s, 0.55, 0.4, 'lowpass', 420 * q, 0);
      const n = noise(v, s, s + 1.0);
      const bp = filt(v, 'bandpass', 2200 * q, 0.9);
      bp.frequency.setValueAtTime(2200 * q, s);
      bp.frequency.exponentialRampToValueAtTime(500 * q, s + 0.75);
      const ng = gain(v, 0);
      perc(ng.gain, s, 0.65, 0.015, 0.85);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(v.in);
    },

    ghost(v, t, p) {
      const q = p * R1();
      const end = t + 2.6;
      // "WoooOOOooo": spectral voices sliding up and down together, a cold wind through them, a tritone chime.
      const g = gain(v, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.5);
      g.gain.linearRampToValueAtTime(0.28, t + 1.6);
      g.gain.linearRampToValueAtTime(0, end);
      const lp = filt(v, 'lowpass', 1800, 0);
      const vib = osc(v, 'sine', 5.2, t, end);
      const depth = gain(v, 0);
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(14 * q, t + 1.2);
      vib.connect(depth);
      for (const [r, dt, a] of [[1, 0, 1], [1, 12, 0.6], [2, -8, 0.25]]) {
        const o = osc(v, 'sine', 280 * q * r, t, end);
        o.detune.value = dt;
        o.frequency.exponentialRampToValueAtTime(520 * q * r, t + 0.9);
        o.frequency.exponentialRampToValueAtTime(330 * q * r, t + 2.3);
        depth.connect(o.frequency);
        const og = gain(v, a);
        o.connect(og);
        og.connect(lp);
      }
      lp.connect(g);
      g.connect(v.in);
      const n = noise(v, t, end);
      const bp = filt(v, 'bandpass', 700 * q, 3);
      bp.frequency.setValueAtTime(700 * q, t);
      bp.frequency.exponentialRampToValueAtTime(2300 * q, t + 1.0);
      bp.frequency.exponentialRampToValueAtTime(1100 * q, end);
      const ng = gain(v, 0);
      sus(ng.gain, t, 0.35, 0.6, t + 1.4, 0.9);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(v.in);
      bell(v, v.in, t, 1480 * q, 0.06, 1.8, 3.5, 0.4, 3);
      bell(v, v.in, t + 0.25, 1047 * q, 0.05, 1.8, 3.5, 0.4, 3);
      roomSend(v, 0.7);
    },

    // ---- The Kraken Seas: special shot, the new ships, Voyage III's hazards, the Kraken, ashore.

    ignite(v, t, p) {
      const q = p * R1();
      // WHOOMPH! A fire shot catching: a soft low thump, a roar of flame opening up and dying back (fluttering as it
      // burns), and embers snapping after it.
      boom(v, v.in, t, 0.22, 72 * q, 0.3, 1.8);
      const end = t + 1.05;
      const n = noise(v, t, end);
      const lp = filt(v, 'lowpass', 300, 2);
      lp.frequency.setValueAtTime(250 * q, t);
      lp.frequency.exponentialRampToValueAtTime(3000 * q, t + 0.12);
      lp.frequency.exponentialRampToValueAtTime(450 * q, t + 0.95);
      const flutter = gain(v, 0.75);
      lfo(v, 16, 0.25, flutter.gain, t, end);
      const g = gain(v, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      g.gain.linearRampToValueAtTime(0, end);
      n.connect(lp);
      lp.connect(flutter);
      flutter.connect(g);
      g.connect(v.in);
      const c = sample(v, R.crackle, t + 0.08, t + 0.95, 1.2 * q, Math.random() * 2);
      const cb = filt(v, 'bandpass', 2600, 0.8);
      const cg = gain(v, 0);
      sus(cg.gain, t + 0.08, 0.9, 0.05, t + 0.4, 0.35);
      c.connect(cb);
      cb.connect(cg);
      cg.connect(v.in);
      roomSend(v, 0.2);
    },

    crackle(v, t, p, o) {
      // A ship on fire, as a loop (`duration` s, 6 by default: a fire shot's burn; stop it sooner with the handle):
      // wood snapping and popping on both sides over the low, fluttering roar of the flames.
      const dur = clamp(Number(o.duration) || 6, 0.3, 30);
      const end = t + dur;
      const q = p * R1();
      for (const [rate, f, a, pan] of [[1, 2400, 0.75, -0.35], [0.8, 1700, 0.55, 0.35]]) {
        const c = sample(v, R.crackle, t, end, rate * q, Math.random() * 2);
        c.loop = true;
        const cb = filt(v, 'bandpass', f * q, 0.7);
        const cg = gain(v, 0);
        loopEnv(cg.gain, t, end, a, 0.35);
        const pn = panner(v, pan);
        c.connect(cb);
        cb.connect(cg);
        cg.connect(pn);
        pn.connect(v.in);
      }
      const n = noise(v, t, end);
      const lp = filt(v, 'lowpass', 520 * q, 1);
      const flutter = gain(v, 0.7);
      lfo(v, 6.5, 0.3, flutter.gain, t, end);
      lfo(v, 0.7, 120 * q, lp.frequency, t, end);
      const rg = gain(v, 0);
      loopEnv(rg.gain, t, end, 0.4, 0.5);
      n.connect(lp);
      lp.connect(flutter);
      flutter.connect(rg);
      rg.connect(v.in);
    },

    sizzle(v, t, p) {
      const q = p * R1();
      // SSSS! Water (or frost) on a fire: a burst of steam hissing out and dying away, its last spits and pops, and a
      // soft puff of smoke.
      const end = t + 1.45;
      const n = noise(v, t, end);
      const hp = filt(v, 'highpass', 2200, -3);
      const bp = filt(v, 'bandpass', 6000, 0.9);
      bp.frequency.setValueAtTime(7000 * q, t);
      bp.frequency.exponentialRampToValueAtTime(3000 * q, t + 1.3);
      const g = gain(v, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.9, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      g.gain.linearRampToValueAtTime(0, end);
      n.connect(hp);
      hp.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      const c = sample(v, R.crackle, t, t + 0.8, 2.2 * q, Math.random() * 2);
      const cb = filt(v, 'bandpass', 4200, 1);
      const cg = gain(v, 0);
      sus(cg.gain, t, 0.7, 0.01, t + 0.35, 0.35);
      c.connect(cb);
      cb.connect(cg);
      cg.connect(v.in);
      hiss(v, v.in, t, 0.5, 0.25, 'lowpass', 520 * q, 0);
    },

    freeze(v, t, p) {
      const q = p * R1();
      // Crack, "kssh", tinkle-tinkle: ice snapping round her hull (a crisp crack and a hiss of frost spreading), then
      // crystalline pings between 2 and 4 kHz climbing and ringing out on both sides.
      hiss(v, v.in, t, 0.8, 0.03, 'highpass', 3000, -3);
      boom(v, v.in, t, 0.12, 110 * q, 0.12, 1.5);
      hiss(v, v.in, t, 0.7, 0.09, 'bandpass', 1300 * q, 2);
      const n = noise(v, t, t + 0.55);
      const bp = filt(v, 'bandpass', 5000, 1.2);
      bp.frequency.setValueAtTime(3500 * q, t);
      bp.frequency.exponentialRampToValueAtTime(7500 * q, t + 0.3);
      const g = gain(v, 0);
      sus(g.gain, t + 0.01, 0.65, 0.04, t + 0.16, 0.25);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      [2093, 2637, 3136, 2349, 3520, 3951].forEach((f, k) => {
        const s = t + 0.07 + k * 0.065 + Math.random() * 0.02;
        const pn = panner(v, (k % 2 ? 0.5 : -0.5) * (0.4 + 0.6 * Math.random()));
        pn.connect(v.in);
        bell(v, pn, s, f * q, 0.075 * (1 - k * 0.07), 0.55, 2.76, 0.35);
      });
      roomSend(v, 0.35);
    },

    stink(v, t, p) {
      const q = p * R1();
      // A stinkpot bursting: a wet SPLORCH (a squelchy band of noise wobbling down, and a plop), a sad trombone slide
      // from 220 down to 110 Hz, and a comic "blech!".
      const n = noise(v, t, t + 0.45);
      const bp = filt(v, 'bandpass', 900, 4);
      bp.frequency.setValueAtTime(1500 * q, t);
      bp.frequency.exponentialRampToValueAtTime(320 * q, t + 0.32);
      const wob = gain(v, 0.6);
      lfo(v, 23, 0.4, wob.gain, t, t + 0.45);
      const g = gain(v, 0);
      perc(g.gain, t, 1.3, 0.008, 0.34);
      n.connect(bp);
      bp.connect(wob);
      wob.connect(g);
      g.connect(v.in);
      const o = osc(v, 'sine', 300 * q, t, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(70 * q, t + 0.18);
      const og = gain(v, 0);
      perc(og.gain, t, 0.5, 0.004, 0.2);
      o.connect(og);
      og.connect(v.in);
      // "Wah-wahhh": two saws sliding 220 → 110 Hz through a plunger mute that opens and closes.
      const s0 = t + 0.2;
      const s1 = s0 + 0.75;
      const tlp = filt(v, 'lowpass', 600, 4);
      tlp.frequency.setValueAtTime(500, s0);
      tlp.frequency.exponentialRampToValueAtTime(1500, s0 + 0.1);
      tlp.frequency.exponentialRampToValueAtTime(450, s1);
      const tg = gain(v, 0);
      tg.gain.setValueAtTime(0, s0);
      tg.gain.linearRampToValueAtTime(0.32, s0 + 0.05);
      tg.gain.setValueAtTime(0.32, s1 - 0.05);
      tg.gain.linearRampToValueAtTime(0, s1 + 0.06);
      const vib = osc(v, 'sine', 6, s0, s1 + 0.07);
      const depth = gain(v, 0);
      depth.gain.setValueAtTime(0, s0);
      depth.gain.linearRampToValueAtTime(5, s1);
      vib.connect(depth);
      for (const dt of [-8, 8]) {
        const sl = osc(v, 'sawtooth', 220 * q, s0, s1 + 0.07);
        sl.detune.value = dt;
        sl.frequency.exponentialRampToValueAtTime(110 * q, s1 - 0.05);
        depth.connect(sl.frequency);
        sl.connect(tlp);
      }
      tlp.connect(tg);
      tg.connect(v.in);
      const b = s1 + 0.04;
      vox(v, v.in, [[b, 190 * q], [b + 0.08, 235 * q], [b + 0.3, 150 * q]], [[b, 520, 1800], [b + 0.3, 600, 1450]],
        [[b, 0], [b + 0.03, 0.85], [b + 0.22, 0.6], [b + 0.32, 0]], 0.03, 0.6);
    },

    blast(v, t, p) {
      const q = p * R1();
      // KA-BOOM! A stink cloud going up in flames (or a fire ship's powder): a sharp "KA" snap, a huge driven BOOM
      // with a fireball's roar opening up, and burning debris crackling down on both sides.
      hiss(v, v.in, t, 1.0, 0.05, 'bandpass', 1800 * q, 0.8);
      hiss(v, v.in, t, 0.5, 0.03, 'highpass', 4000, -3);
      const b = t + 0.06;
      boom(v, v.in, b, 0.7, 40 * q, 1.4, 3.4);
      hiss(v, v.in, b, 1.6, 0.8, 'bandpass', 220 * q, 1.1);
      hiss(v, v.in, b, 0.6, 0.45, 'bandpass', 520 * q, 1);
      const n = noise(v, b, b + 2.2);
      const lp = filt(v, 'lowpass', 300, 1);
      lp.frequency.setValueAtTime(300 * q, b);
      lp.frequency.exponentialRampToValueAtTime(3500 * q, b + 0.15);
      lp.frequency.exponentialRampToValueAtTime(200 * q, b + 2.0);
      const ng = gain(v, 0);
      perc(ng.gain, b, 0.9, 0.02, 2.0);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(v.in);
      for (const pan of [-0.5, 0.5]) {
        const c = sample(v, R.crackle, b + 0.1, b + 1.9, (pan < 0 ? 0.9 : 1.1) * q, Math.random() * 2);
        const cb = filt(v, 'bandpass', 2200, 0.7);
        const cg = gain(v, 0);
        sus(cg.gain, b + 0.1, 0.5, 0.02, b + 0.7, 0.9);
        const pn = panner(v, pan);
        c.connect(cb);
        cb.connect(cg);
        cg.connect(pn);
        pn.connect(v.in);
      }
      roomSend(v, 0.6);
    },

    clang(v, t, p) {
      const q = p * R1();
      // CLANG! A ball glancing off iron plates: a hard metallic strike (inharmonic partials, each doubled a few Hz
      // apart so it rings rough and short), the dull thump of the blow, and the ball whining away.
      hiss(v, v.in, t, 0.9, 0.025, 'highpass', 2500, -3);
      boom(v, v.in, t, 0.2, 95 * q, 0.15, 1.8);
      const f = (520 + Math.random() * 80) * q;
      for (const [r, a, d] of [[1, 0.22, 0.5], [2.32, 0.16, 0.42], [3.86, 0.1, 0.32], [5.21, 0.07, 0.22], [6.73, 0.05, 0.15], [8.1, 0.03, 0.1]]) {
        const g = gain(v, 0);
        const end = perc(g.gain, t, a, 0.001, d * (0.85 + Math.random() * 0.3));
        for (const dt of [-3, 3]) osc(v, 'sine', f * r + dt * r, t, end).connect(g);
        g.connect(v.in);
      }
      const s = t + 0.05;
      const w = osc(v, 'sine', 2600 * q, s, s + 0.4);
      w.frequency.exponentialRampToValueAtTime(900 * q, s + 0.35);
      const wg = gain(v, 0);
      perc(wg.gain, s, 0.06, 0.02, 0.3);
      const pn = panner(v, Math.random() < 0.5 ? -0.5 : 0.5);
      w.connect(wg);
      wg.connect(pn);
      pn.connect(v.in);
    },

    ram(v, t, p) {
      const q = p * R1();
      // A Shark Raider winding up to charge (her 1.5 s wind-up): a growl climbing "grrrRRR!" (a rough low buzz
      // through a snarling vowel, rattling as it rises) over the churn of her bow wave.
      const end = t + 1.6;
      const o = osc(v, 'sawtooth', 70 * q, t, end);
      o.frequency.exponentialRampToValueAtTime(118 * q, t + 1.4);
      const rough = gain(v, 0.55);
      lfo(v, 27, 0.45, rough.gain, t, end, 'triangle');
      const b1 = filt(v, 'bandpass', 450, 3);
      b1.frequency.setValueAtTime(420, t);
      b1.frequency.exponentialRampToValueAtTime(760, t + 1.4);
      const b2 = filt(v, 'bandpass', 1100, 5);
      b2.frequency.setValueAtTime(1050, t);
      b2.frequency.exponentialRampToValueAtTime(1500, t + 1.4);
      const g2 = gain(v, 0.6);
      const g = gain(v, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.15);
      g.gain.linearRampToValueAtTime(1, t + 1.35);
      g.gain.linearRampToValueAtTime(0, end);
      o.connect(rough);
      rough.connect(b1);
      rough.connect(b2);
      b2.connect(g2);
      b1.connect(g);
      g2.connect(g);
      g.connect(v.in);
      const n = noise(v, t, end);
      const lp = filt(v, 'lowpass', 700 * q, 0);
      const ng = gain(v, 0);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.15, t + 1.3);
      ng.gain.linearRampToValueAtTime(0, end);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(v.in);
    },

    mortar(v, t, p) {
      const q = p * R1();
      // THOOMP! A fat bronze mortar firing: a hollow tube "toomp" (a driven low body and the barrel ringing), the
      // shell's "fwip" climbing away, and a puff of smoke.
      boom(v, v.in, t, 0.5, 60 * q, 0.4, 2.6);
      hiss(v, v.in, t, 2.2, 0.22, 'bandpass', 170 * q, 5);
      hiss(v, v.in, t, 0.8, 0.12, 'bandpass', 420 * q, 3);
      hiss(v, v.in, t, 0.3, 0.03, 'highpass', 3000, -3);
      const s = t + 0.05;
      const w = osc(v, 'sine', 300 * q, s, s + 0.35);
      w.frequency.exponentialRampToValueAtTime(1100 * q, s + 0.3);
      const wg = gain(v, 0);
      perc(wg.gain, s, 0.08, 0.02, 0.28);
      w.connect(wg);
      wg.connect(v.in);
      hiss(v, v.in, t + 0.05, 0.25, 0.5, 'lowpass', 700 * q, 0);
      roomSend(v, 0.35);
    },

    fuse(v, t, p, o) {
      // A fire ship's fuse lit (`duration` s, 2 by default: lit to armed is 1.6 s): a sputtering hiss spitting
      // sparks, and her rigging catching with a growing "whoof" of flame.
      const dur = clamp(Number(o.duration) || 2, 0.4, 8);
      const end = t + dur + 0.3;
      const q = p * R1();
      const n = noise(v, t, end);
      const bp = filt(v, 'bandpass', 5200 * q, 1.5);
      const g = gain(v, 0);
      loopEnv(g.gain, t, end, 0.4, 0.08);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      const c = sample(v, R.crackle, t, end, 3 * q, Math.random() * 2);
      c.loop = true;
      const cb = filt(v, 'bandpass', 4500, 1);
      const cg = gain(v, 0);
      loopEnv(cg.gain, t, end, 0.9, 0.05);
      c.connect(cb);
      cb.connect(cg);
      cg.connect(v.in);
      const r = noise(v, t, end);
      const lp = filt(v, 'lowpass', 300, 1);
      lp.frequency.setValueAtTime(300 * q, t);
      lp.frequency.exponentialRampToValueAtTime(1800 * q, t + dur);
      const rg = gain(v, 0);
      rg.gain.setValueAtTime(0, t);
      rg.gain.linearRampToValueAtTime(0.55, t + dur);
      rg.gain.linearRampToValueAtTime(0, end);
      r.connect(lp);
      lp.connect(rg);
      rg.connect(v.in);
    },

    spout(v, t, p, o) {
      // A waterspout, as a loop (`duration` s, 25 by default: forming and active; louder as you near it, through the
      // handle's set({ distance, pan })): wind whistling round the twister (two resonant bands of noise wavering
      // apart), the roar of its foot on the sea and its spray.
      const dur = clamp(Number(o.duration) || 25, 0.5, 60);
      const end = t + dur;
      const q = p * R1();
      for (const [f, pan, a, rate] of [[880, -0.3, 0.6, 0.37], [1320, 0.3, 0.35, 0.29]]) {
        const n = noise(v, t, end);
        const bp = filt(v, 'bandpass', f * q, 9);
        lfo(v, rate, f * 0.3 * q, bp.frequency, t, end);
        lfo(v, rate * 3.7, f * 0.06 * q, bp.frequency, t, end);
        const g = gain(v, 0);
        loopEnv(g.gain, t, end, a, 2);
        const pn = panner(v, pan);
        n.connect(bp);
        bp.connect(g);
        g.connect(pn);
        pn.connect(v.in);
      }
      const r = noise(v, t, end);
      const lp = filt(v, 'lowpass', 300 * q, 1);
      const rg = gain(v, 0);
      loopEnv(rg.gain, t, end, 0.7, 2);
      lfo(v, 0.21, 0.2, rg.gain, t, end);
      r.connect(lp);
      lp.connect(rg);
      rg.connect(v.in);
      const s = noise(v, t, end);
      const sb = filt(v, 'bandpass', 3400 * q, 0.7);
      const sg = gain(v, 0);
      loopEnv(sg.gain, t, end, 0.12, 2);
      s.connect(sb);
      sb.connect(sg);
      sg.connect(v.in);
    },

    horn(v, t, p) {
      // The conch-horn tower: "bwoo-BWOOOO!", a breathy shell horn scooping up into a low note and then a long higher
      // one. It warns of a rogue wave, so it sounds the same every time.
      for (const [dt, f, d, a] of [[0, 196, 0.42, 0.75], [0.55, 262, 1.45, 1]]) {
        const s = t + dt;
        const ff = f * p;
        const end = s + d + 0.4;
        const g = gain(v, 0);
        sus(g.gain, s, 0.28 * a, 0.12, s + d, 0.3);
        const lp = filt(v, 'lowpass', ff * 2, 4);
        lp.frequency.setValueAtTime(ff * 1.5, s);
        lp.frequency.exponentialRampToValueAtTime(ff * 5, s + 0.2);
        lp.frequency.setTargetAtTime(ff * 3, s + 0.25, 0.3);
        const nasal = filt(v, 'peaking', 1100, 2);
        nasal.gain.value = 6;
        const wob = osc(v, 'sine', 4.5, s, end);
        const depth = gain(v, ff * 0.006);
        wob.connect(depth);
        for (const dc of [-6, 6]) {
          const o = osc(v, 'sawtooth', ff * 0.94, s, end);
          o.detune.value = dc;
          o.frequency.exponentialRampToValueAtTime(ff, s + 0.14);
          depth.connect(o.frequency);
          o.connect(lp);
        }
        lp.connect(nasal);
        nasal.connect(g);
        g.connect(v.in);
        const n = noise(v, s, end);
        const bp = filt(v, 'bandpass', ff * 5, 3);
        const ng = gain(v, 0);
        sus(ng.gain, s, 0.12 * a, 0.08, s + d, 0.25);
        n.connect(bp);
        bp.connect(ng);
        ng.connect(v.in);
      }
      roomSend(v, 0.5);
    },

    rogue(v, t, p) {
      const q = p * R1();
      // The rogue wave breaking over you: a rushing roar rising, a heavy crash of water (a thump and a burst of
      // white water), then the foam hissing away and water streaming off the deck on both sides.
      const c = t + 0.45;
      for (const pan of [-0.4, 0.4]) {
        const n = noise(v, t, c + 2.6);
        const lp = filt(v, 'lowpass', 300, 0);
        lp.frequency.setValueAtTime(300 * q, t);
        lp.frequency.exponentialRampToValueAtTime(2600 * q, c);
        lp.frequency.exponentialRampToValueAtTime(700 * q, c + 2.4);
        const g = gain(v, 0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, c);
        g.gain.exponentialRampToValueAtTime(0.001, c + 2.5);
        g.gain.linearRampToValueAtTime(0, c + 2.55);
        const pn = panner(v, pan);
        n.connect(lp);
        lp.connect(g);
        g.connect(pn);
        pn.connect(v.in);
      }
      boom(v, v.in, c, 0.45, 50 * q, 0.6, 2.2);
      hiss(v, v.in, c, 1.5, 0.5, 'bandpass', 300 * q, 1);
      hiss(v, v.in, c, 0.8, 1.4, 'highpass', 900, -3);
      const f = noise(v, c + 0.1, c + 2.4);
      const fb = filt(v, 'bandpass', 3000 * q, 0.7);
      const fg = gain(v, 0);
      sus(fg.gain, c + 0.1, 0.35, 0.1, c + 0.8, 1.3);
      f.connect(fb);
      fb.connect(fg);
      fg.connect(v.in);
      bubbleTrain(v, v.in, c + 0.4, 1.4, 0.05, 1300 * q, 2400 * q, [0.05, 0.16]);
      roomSend(v, 0.3);
    },

    surf(v, t, p) {
      const q = p * R1();
      // SURF'S UP! Riding the wave's back: a rushing whoosh sweeping up, and a happy slide whistle, "wheee!".
      const end = t + 1.1;
      const n = noise(v, t, end);
      const bp = filt(v, 'bandpass', 400, 1.5);
      bp.frequency.setValueAtTime(400 * q, t);
      bp.frequency.exponentialRampToValueAtTime(2600 * q, t + 0.5);
      bp.frequency.exponentialRampToValueAtTime(1100 * q, end);
      const g = gain(v, 0);
      sus(g.gain, t, 0.7, 0.25, t + 0.5, 0.45);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      const w = osc(v, 'sine', 520 * q, t + 0.05, end);
      w.frequency.exponentialRampToValueAtTime(1250 * q, t + 0.5);
      w.frequency.exponentialRampToValueAtTime(1100 * q, t + 0.85);
      const vib = osc(v, 'sine', 7, t + 0.05, end);
      const depth = gain(v, 0);
      depth.gain.setValueAtTime(0, t + 0.3);
      depth.gain.linearRampToValueAtTime(40 * q, t + 0.8);
      vib.connect(depth);
      depth.connect(w.frequency);
      const wg = gain(v, 0);
      sus(wg.gain, t + 0.05, 0.13, 0.1, t + 0.7, 0.3);
      w.connect(wg);
      wg.connect(v.in);
    },

    ink(v, t, p) {
      const q = p * R1();
      // "PTHOO!" An ink pot spat out: a lip-pop "p", a breathy "thoo" through an "oo" mouth, a gloopy "glorp" of ink
      // sloshing in the pot, and the pot whirring away.
      const o = osc(v, 'sine', 180 * q, t, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(60 * q, t + 0.05);
      const og = gain(v, 0);
      perc(og.gain, t, 0.6, 0.002, 0.05);
      o.connect(og);
      og.connect(v.in);
      hiss(v, v.in, t, 0.6, 0.02, 'bandpass', 1500 * q, 2);
      const s = t + 0.02;
      vox(v, v.in, [[s, 150 * q], [s + 0.25, 115 * q]], [[s, 360, 800], [s + 0.25, 330, 760]],
        [[s, 0], [s + 0.03, 0.55], [s + 0.18, 0.35], [s + 0.27, 0]], 0, 1);
      const n = noise(v, s, s + 0.3);
      const b1 = filt(v, 'bandpass', 380, 5);
      const b2 = filt(v, 'bandpass', 850, 6);
      const ng = gain(v, 0);
      sus(ng.gain, s, 1.4, 0.02, s + 0.15, 0.1);
      n.connect(b1);
      n.connect(b2);
      b1.connect(ng);
      b2.connect(ng);
      ng.connect(v.in);
      const gl = t + 0.3;
      const bo = osc(v, 'sine', 120 * q, gl, gl + 0.2);
      bo.frequency.exponentialRampToValueAtTime(380 * q, gl + 0.12);
      const bg = gain(v, 0);
      perc(bg.gain, gl, 0.35, 0.01, 0.15);
      bo.connect(bg);
      bg.connect(v.in);
      const w = t + 0.35;
      const wn = noise(v, w, w + 0.45);
      const wb = filt(v, 'bandpass', 1300, 3);
      wb.frequency.setValueAtTime(1300 * q, w);
      wb.frequency.exponentialRampToValueAtTime(700 * q, w + 0.4);
      const chop = gain(v, 0.5);
      lfo(v, 19, 0.5, chop.gain, w, w + 0.45, 'triangle');
      const wg = gain(v, 0);
      sus(wg.gain, w, 0.3, 0.05, w + 0.2, 0.18);
      wn.connect(wb);
      wb.connect(chop);
      chop.connect(wg);
      wg.connect(v.in);
    },

    krakenRise(v, t, p) {
      // WHOOOM! The Kraken rising: the sea bulging (a deep surge of water swelling up on both sides), then a huge
      // low horn call (a brass choir on D, growling, swelling and sagging at the end) over a sub boom, and the
      // water pouring off its head.
      for (const pan of [-0.5, 0.5]) {
        const n = noise(v, t, t + 3.4);
        const lp = filt(v, 'lowpass', 150, 1);
        lp.frequency.setValueAtTime(140 * p, t);
        lp.frequency.exponentialRampToValueAtTime(900 * p, t + 0.8);
        lp.frequency.exponentialRampToValueAtTime(260 * p, t + 3.2);
        const g = gain(v, 0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.45, t + 0.8);
        g.gain.exponentialRampToValueAtTime(0.001, t + 3.3);
        g.gain.linearRampToValueAtTime(0, t + 3.35);
        const pn = panner(v, pan);
        n.connect(lp);
        lp.connect(g);
        g.connect(pn);
        pn.connect(v.in);
      }
      const h = t + 0.45;
      const off = h + 1.7;
      const end = off + 0.7;
      const g = gain(v, 0);
      sus(g.gain, h, 0.32, 0.35, off, 0.55);
      const lp = filt(v, 'lowpass', 200, 3);
      lp.frequency.setValueAtTime(150 * p, h);
      lp.frequency.exponentialRampToValueAtTime(1300 * p, h + 0.45);
      lp.frequency.setTargetAtTime(700 * p, h + 0.5, 0.4);
      const growl = gain(v, 0.75);
      lfo(v, 31, 0.25, growl.gain, h, end, 'triangle');
      for (const [f, a] of [[73.42, 1], [110, 0.75], [146.83, 0.6], [36.71, 0.5]]) {
        const ag = gain(v, a);
        for (const dt of [-7, 7]) {
          const o = osc(v, 'sawtooth', f * 0.92 * p, h, end);
          o.detune.value = dt;
          o.frequency.exponentialRampToValueAtTime(f * p, h + 0.3);
          o.frequency.setValueAtTime(f * p, off - 0.3);
          o.frequency.exponentialRampToValueAtTime(f * 0.93 * p, off + 0.5);
          o.connect(ag);
        }
        ag.connect(lp);
      }
      lp.connect(growl);
      growl.connect(g);
      g.connect(v.in);
      boom(v, v.in, h, 0.5, 38 * p, 1.5, 2);
      hiss(v, v.in, h, 1.2, 0.8, 'bandpass', 180 * p, 1.2);
      const w = noise(v, off - 0.4, off + 1.6);
      const wb = filt(v, 'bandpass', 1800 * p, 0.6);
      const wg = gain(v, 0);
      sus(wg.gain, off - 0.4, 0.35, 0.3, off + 0.4, 0.8);
      w.connect(wb);
      wb.connect(wg);
      wg.connect(v.in);
      roomSend(v, 0.6);
    },

    slam(v, t, p) {
      const q = p * R1();
      // SLAM! A tentacle smacking down on the sea: a wet slap, a big low thump, a splash thrown up and water raining
      // back down.
      hiss(v, v.in, t, 1.4, 0.06, 'bandpass', 1300 * q, 1.2);
      hiss(v, v.in, t, 0.7, 0.03, 'highpass', 3500, -3);
      boom(v, v.in, t, 0.6, 50 * q, 0.6, 2.6);
      hiss(v, v.in, t, 1.5, 0.35, 'bandpass', 240 * q, 1.2);
      const n = noise(v, t, t + 1.2);
      const bp = filt(v, 'bandpass', 2400, 1);
      bp.frequency.setValueAtTime(2400 * q, t);
      bp.frequency.exponentialRampToValueAtTime(500 * q, t + 0.8);
      const ng = gain(v, 0);
      perc(ng.gain, t, 0.7, 0.015, 1.1);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(v.in);
      const c = sample(v, R.crackle, t + 0.3, t + 1.4, 1.6 * q, Math.random() * 2);
      const cb = filt(v, 'bandpass', 3500, 0.9);
      const cg = gain(v, 0);
      sus(cg.gain, t + 0.3, 0.5, 0.1, t + 0.9, 0.4);
      c.connect(cb);
      cb.connect(cg);
      cg.connect(v.in);
      roomSend(v, 0.4);
    },

    grab(v, t, p) {
      const q = p * R1();
      // A tentacle curling round your hull: a slimy squelch, its suckers popping on one by one, and the timbers
      // creaking as it squeezes.
      boom(v, v.in, t, 0.25, 70 * q, 0.25, 1.6);
      const n = noise(v, t, t + 0.75);
      const bp = filt(v, 'bandpass', 600, 6);
      bp.frequency.setValueAtTime(500 * q, t);
      bp.frequency.exponentialRampToValueAtTime(1500 * q, t + 0.25);
      bp.frequency.exponentialRampToValueAtTime(650 * q, t + 0.7);
      lfo(v, 9, 160 * q, bp.frequency, t, t + 0.75);
      const g = gain(v, 0);
      sus(g.gain, t, 1.6, 0.04, t + 0.4, 0.3);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      for (let k = 0; k < 5; k++) {
        const s = t + 0.15 + k * 0.09 + Math.random() * 0.03;
        const f = (420 + Math.random() * 300) * q;
        const o = osc(v, 'sine', f, s, s + 0.07);
        o.frequency.exponentialRampToValueAtTime(f * 0.45, s + 0.05);
        const og = gain(v, 0);
        perc(og.gain, s, 0.25, 0.003, 0.05);
        const pn = panner(v, -0.6 + k * 0.3);
        o.connect(og);
        og.connect(pn);
        pn.connect(v.in);
      }
      for (const [s, f0] of [[t + 0.35, 85], [t + 0.9, 72]]) {
        const d = 0.45;
        const o = osc(v, 'sawtooth', f0 * q, s, s + d + 0.15);
        o.frequency.linearRampToValueAtTime(f0 * 1.3 * q, s + d * 0.5);
        o.frequency.linearRampToValueAtTime(f0 * 0.9 * q, s + d);
        const cb = filt(v, 'bandpass', 900 * q, 6);
        const cg = gain(v, 0);
        sus(cg.gain, s, 0.4, 0.06, s + d, 0.12);
        o.connect(cb);
        cb.connect(cg);
        cg.connect(v.in);
      }
    },

    gurgle(v, t, p) {
      const q = p * R1();
      // The Kraken sulking off: a long bubbly gurgle sinking away (bubbles falling in pitch over rushing water), then
      // a rude ink raspberry, "pbbbbt!".
      hiss(v, v.in, t, 0.4, 2.2, 'lowpass', 500 * q, 0);
      for (const pan of [-0.4, 0.4]) {
        const pn = panner(v, pan);
        pn.connect(v.in);
        bubbleTrain(v, pn, t + (pan > 0 ? 0.07 : 0), 1.9, 0.18, 900 * q, 220 * q, [0.04, 0.12]);
      }
      const r = t + 1.9;
      const rend = r + 0.85;
      const o = osc(v, 'sawtooth', 110 * q, r, rend);
      o.frequency.exponentialRampToValueAtTime(82 * q, rend - 0.05);
      const flap = gain(v, 0.5);
      lfo(v, 28, 0.5, flap.gain, r, rend, 'triangle');
      const b1 = filt(v, 'bandpass', 700, 2);
      const b2 = filt(v, 'bandpass', 1700, 4);
      const g = gain(v, 0);
      sus(g.gain, r, 0.9, 0.03, rend - 0.15, 0.1);
      o.connect(flap);
      flap.connect(b1);
      flap.connect(b2);
      b1.connect(g);
      b2.connect(g);
      g.connect(v.in);
      const spit = noise(v, r, rend);
      const sb = filt(v, 'bandpass', 2600, 1.5);
      const sf = gain(v, 0.5);
      lfo(v, 28, 0.5, sf.gain, r, rend, 'triangle');
      const sg = gain(v, 0);
      sus(sg.gain, r, 0.25, 0.03, rend - 0.15, 0.1);
      spit.connect(sb);
      sb.connect(sf);
      sf.connect(sg);
      sg.connect(v.in);
    },

    sneeze(v, t, p) {
      const q = p * R1();
      // ACHOO! A giant cartoon sneeze: two big breaths in, "ah... AH...", rising, then a wet "CHOO!" burst.
      for (const [dt, f0, f1, a] of [[0, 110, 140, 0.5], [0.5, 130, 175, 0.7]]) {
        const s = t + dt;
        vox(v, v.in, [[s, f0 * q], [s + 0.38, f1 * q]], [[s, 650, 1100], [s + 0.38, 760, 1200]],
          [[s, 0], [s + 0.3, a], [s + 0.4, 0]], 0.02, 0.8);
      }
      const c = t + 1.05;
      const n = noise(v, c, c + 0.4);
      const bp = filt(v, 'bandpass', 2500 * q, 0.8);
      const g = gain(v, 0);
      perc(g.gain, c, 1.5, 0.005, 0.28);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      vox(v, v.in, [[c, 170 * q], [c + 0.35, 100 * q]], [[c, 380, 820], [c + 0.35, 350, 780]],
        [[c, 0], [c + 0.02, 0.9], [c + 0.25, 0.4], [c + 0.36, 0]], 0.03, 0);
      boom(v, v.in, c, 0.18, 85 * q, 0.15, 1.8);
      hiss(v, v.in, c, 0.4, 0.3, 'highpass', 4000, -3);
      roomSend(v, 0.25);
    },

    bell(v, t, p) {
      // DING-DING! The Riddle Bell rung twice: a brass bell's partials (hum, prime, tierce, quint, nominal...) from
      // each strike, the higher ones dying first, and the clapper's tick.
      for (const [s, a] of [[t, 1], [t + 0.22, 0.85]]) {
        for (const [r, amp, d] of [[0.5, 0.05, 2.2], [1, 0.14, 1.6], [1.19, 0.07, 1.2], [1.5, 0.05, 1.0], [2, 0.08, 0.9], [2.52, 0.04, 0.5], [3.01, 0.03, 0.35]]) {
          const g = gain(v, 0);
          const end = perc(g.gain, s, amp * a, 0.002, d);
          osc(v, 'sine', 880 * p * r, s, end).connect(g);
          g.connect(v.in);
        }
        hiss(v, v.in, s, 0.3 * a, 0.02, 'bandpass', 4000 * p, 2);
      }
      roomSend(v, 0.3);
    },

    bonk(v, t, p) {
      // Not quite! A soft wooden "bo-onk": two marimba notes stepping down, the second sagging a little (never a
      // buzzer).
      marimba(v, v.in, t, 392 * p, 0.35, 0.5);
      const s = t + 0.16;
      const f = 294 * p;
      const g = gain(v, 0);
      const end = perc(g.gain, s, 0.42, 0.004, 0.75);
      const o = osc(v, 'sine', f, s, end);
      o.frequency.exponentialRampToValueAtTime(f * 0.94, s + 0.5);
      o.connect(g);
      g.connect(v.in);
      const k = gain(v, 0);
      const kend = perc(k.gain, s, 0.12, 0.002, 0.07);
      osc(v, 'sine', f * 3.93, s, kend).connect(k);
      k.connect(v.in);
    },

    squawk(v, t, p) {
      const q = p * R1();
      // Quizzle the macaw: "rraawk! awk!" A raspy bird call, a buzzy tone (rattling fast) leaping up and dropping back
      // through a beak's bright formants.
      for (const [dt, d, a] of [[0, 0.24, 1], [0.3, 0.13, 0.8]]) {
        const s = t + dt;
        const f = 900 * q;
        const end = s + d + 0.02;
        const o = osc(v, 'sawtooth', f * 0.8, s, end);
        o.frequency.exponentialRampToValueAtTime(f * 1.35, s + d * 0.35);
        o.frequency.exponentialRampToValueAtTime(f * 0.9, s + d);
        const rattle = gain(v, 0.55);
        lfo(v, 55, 0.45, rattle.gain, s, end, 'triangle');
        const b1 = filt(v, 'bandpass', 1800, 3);
        const b2 = filt(v, 'bandpass', 3200, 5);
        const g2 = gain(v, 0.5);
        const g = gain(v, 0);
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.5 * a, s + 0.02);
        g.gain.linearRampToValueAtTime(0.35 * a, s + d * 0.7);
        g.gain.linearRampToValueAtTime(0, s + d);
        o.connect(rattle);
        rattle.connect(b1);
        rattle.connect(b2);
        b1.connect(g);
        b2.connect(g2);
        g2.connect(g);
        g.connect(v.in);
      }
    },

    build(v, t, p) {
      // A building going up (§8.3): a scaffold popping up in a puff of sawdust, four hammer knocks, a saw going at
      // it, and the building springing up with a rising "boing!" (the cheer after it is the 'cheer' sound).
      hiss(v, v.in, t, 0.4, 0.3, 'bandpass', 900 * p, 0.8);
      const po = osc(v, 'sine', 420 * p, t, t + 0.12);
      po.frequency.exponentialRampToValueAtTime(900 * p, t + 0.08);
      const pg = gain(v, 0);
      perc(pg.gain, t, 0.15, 0.004, 0.08);
      po.connect(pg);
      pg.connect(v.in);
      for (let k = 0; k < 4; k++) {
        const s = t + 0.45 + k * 0.2;
        const pn = panner(v, k % 2 ? 0.25 : -0.25);
        pn.connect(v.in);
        hiss(v, pn, s, 1.4, 0.08, 'bandpass', 750 * p, 5);
        drum(v, pn, s, 0.3, 160 * p, 0.07, 1.4);
        bell(v, pn, s + 0.004, 2600 * p, 0.05, 0.12, 2.76, 0.8);
      }
      for (const [s, up] of [[t + 1.2, true], [t + 1.42, false]]) {
        const n = noise(v, s, s + 0.22);
        const bp = filt(v, 'bandpass', 2000 * p, 2);
        bp.frequency.setValueAtTime((up ? 1700 : 2400) * p, s);
        bp.frequency.linearRampToValueAtTime((up ? 2400 : 1700) * p, s + 0.2);
        const chop = gain(v, 0.5);
        lfo(v, 70, 0.5, chop.gain, s, s + 0.22, 'sawtooth');
        const g = gain(v, 0);
        sus(g.gain, s, 0.5, 0.03, s + 0.16, 0.05);
        n.connect(bp);
        bp.connect(chop);
        chop.connect(g);
        g.connect(v.in);
      }
      const b = t + 1.65;
      const end = b + 0.65;
      const o = osc(v, 'sine', 200 * p, b, end);
      o.frequency.exponentialRampToValueAtTime(600 * p, b + 0.35);
      const vib = osc(v, 'sine', 13, b, end);
      const depth = gain(v, 0);
      depth.gain.setValueAtTime(60 * p, b);
      depth.gain.exponentialRampToValueAtTime(3 * p, end);
      vib.connect(depth);
      depth.connect(o.frequency);
      const g = gain(v, 0);
      perc(g.gain, b, 0.3, 0.01, 0.6);
      o.connect(g);
      g.connect(v.in);
      roomSend(v, 0.2);
    },

    crate(v, t, p) {
      // A powder crate hauled aboard: a wooden "tok-tok" as it bumps the hull, then a bright rising pickup chime.
      for (const s of [t, t + 0.08]) {
        hiss(v, v.in, s, 1.1, 0.07, 'bandpass', 620 * p, 5);
        drum(v, v.in, s, 0.25, 140 * p, 0.08, 1.4);
      }
      [1046.5, 1318.5, 1568, 2093].forEach((f, k) => bell(v, v.in, t + 0.16 + k * 0.06, f * p, 0.09, 0.3 + k * 0.08, 3, 0.25));
    },

    tentacle(v, t, p, o) {
      // A tentacle about to burst up (`duration` s of warning, 1.6 by default): bubbles boiling faster and faster,
      // and a watery tone rising under them into a surge.
      const dur = clamp(Number(o.duration) || 1.6, 0.4, 4);
      const end = t + dur;
      const w = osc(v, 'triangle', 140 * p, t, end + 0.15);
      w.frequency.exponentialRampToValueAtTime(560 * p, end);
      const wah = filt(v, 'bandpass', 400, 3);
      wah.frequency.setValueAtTime(320 * p, t);
      wah.frequency.exponentialRampToValueAtTime(1300 * p, end);
      lfo(v, 6, 90 * p, wah.frequency, t, end + 0.15);
      const g = gain(v, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, end - 0.05);
      g.gain.linearRampToValueAtTime(0, end + 0.15);
      w.connect(wah);
      wah.connect(g);
      g.connect(v.in);
      bubbleTrain(v, v.in, t, dur, 0.16, 280 * p, 900 * p, [0.16, 0.03]);
      const n = noise(v, end - 0.5, end + 0.2);
      const lp = filt(v, 'lowpass', 400, 1);
      lp.frequency.setValueAtTime(400 * p, end - 0.5);
      lp.frequency.exponentialRampToValueAtTime(2000 * p, end);
      const ng = gain(v, 0);
      ng.gain.setValueAtTime(0, end - 0.5);
      ng.gain.linearRampToValueAtTime(0.4, end);
      ng.gain.linearRampToValueAtTime(0, end + 0.2);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(v.in);
    },

    geyser(v, t, p, o) {
      // A sea geyser (`duration` s of warning, 2 by default, so the column lands on the impact): water bubbling and
      // grumbling as the ring boils, then FWOOSH, a column of water jetting up and raining back down.
      const dur = clamp(Number(o.duration) || 2, 0.4, 5);
      const f = t + dur;
      const q = p * R1();
      bubbleTrain(v, v.in, t, dur, 0.14, 200 * q, 600 * q, [0.12, 0.03]);
      const n = noise(v, t, f + 0.1);
      const bp = filt(v, 'bandpass', 300 * q, 2);
      const ng = gain(v, 0);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.5, f);
      ng.gain.linearRampToValueAtTime(0, f + 0.1);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(v.in);
      boom(v, v.in, f, 0.3, 60 * q, 0.35, 2);
      const j = noise(v, f, f + 1.3);
      const jb = filt(v, 'bandpass', 600, 1);
      jb.frequency.setValueAtTime(600 * q, f);
      jb.frequency.exponentialRampToValueAtTime(3500 * q, f + 0.15);
      jb.frequency.exponentialRampToValueAtTime(1400 * q, f + 1.1);
      const jg = gain(v, 0);
      perc(jg.gain, f, 1.0, 0.02, 1.1);
      j.connect(jb);
      jb.connect(jg);
      jg.connect(v.in);
      const c = sample(v, R.crackle, f + 0.4, f + 1.5, 1.5 * q, Math.random() * 2);
      const cb = filt(v, 'bandpass', 3200, 0.9);
      const cg = gain(v, 0);
      sus(cg.gain, f + 0.4, 0.4, 0.1, f + 0.9, 0.4);
      c.connect(cb);
      cb.connect(cg);
      cg.connect(v.in);
    },
  };

  // Canvas flapping: low-passed noise chopped at `rate` Hz (slowing down).
  function clothFlap(v, t, p, vel, rate, d) {
    const end = t + d + 0.1;
    const n = noise(v, t, end);
    const lp = filt(v, 'lowpass', 1100 * p, 2);
    const chop = gain(v, 0.5);
    const l = lfo(v, rate, 0.5, chop.gain, t, end);
    l.frequency.setValueAtTime(rate, t);
    l.frequency.linearRampToValueAtTime(rate * 0.55, t + d);
    const g = gain(v, 0);
    perc(g.gain, t, vel, 0.04, d);
    n.connect(lp);
    lp.connect(chop);
    chop.connect(g);
    g.connect(v.in);
  }

  // ---- public one-shot API
  const lastPlay = Object.create(null);
  const active = Object.create(null);
  for (const n of SFX_NAMES) active[n] = 0;
  let stinger = null;

  function play(name, o = EMPTY, when = 0) {
    const make = SFX[name];
    if (!make) return NOOP_HANDLE;
    const isStinger = name in STINGER;
    // Stingers skip the caps: there is only ever one, and a level-clear fanfare must not lose to a coin storm.
    if (!isStinger && (S.sfx >= MAX_SFX || active[name] >= (SFX_CAP[name] || 6))) return NOOP_HANDLE;
    const rec = recs.get(`sfx:${name}`);
    const trim = rec ? rec.gain : SFX_GAIN[name];
    const d = Math.max(0, Number(o.distance) || 0);
    const volume = o.volume == null ? 1 : Math.max(0, Number(o.volume) || 0);
    let vol = volume * distGain(d) * trim;
    const now = ctx.currentTime;
    // Thin out pile-ups of the same sound in the same instant (e.g. both broadsides at once).
    const lp = lastPlay[name] || (lastPlay[name] = { t: -1, n: 0 });
    if (now - lp.t < 0.05) {
      if (++lp.n > 2) return NOOP_HANDLE;
      vol *= 0.6;
    } else {
      lp.t = now;
      lp.n = 0;
    }
    if (vol < 0.002 && !LOOPS[name]) return NOOP_HANDLE;
    const pitch = clamp(Number(o.pitch) || 1, 0.25, 4);
    const pan = clamp(Number(o.pan) || 0, -1, 1);
    const t = Math.max(now, when);

    if (isStinger && stinger) stopVoice(stinger, 0.15);
    const v = voice(true);
    v.name = name;
    active[name]++;
    v.volume = volume;
    v.trim = trim;
    v.dist = d;
    if (isStinger) {
      stinger = v;
      const hold = rec ? rec.duck || 0 : STINGER[name];
      if (hold) {
        v.duck = true;
        duck(t, t + hold / pitch);
      }
    }
    v.in = gain(v, vol);
    v.lp = filt(v, 'lowpass', distCutoff(d), -3);
    v.pn = panner(v, pan);
    v.in.connect(v.lp);
    v.lp.connect(v.pn);
    v.pn.connect(sfxBus);
    if (rec) playRecording(v, t, pitch, o, rec);
    else make(v, t, pitch, o);
    return handleFor(v);
  }

  // A recorded one-shot into v.in. The bomb whistle is fitted to the bomb's flight: played a little faster or
  // slower, and started partway in (or a moment late) so that it ends on the impact.
  function playRecording(v, t, p, o, rec) {
    S.recPlays++;
    const buf = rec.buffer;
    const vary = VARY[v.name] || 0;
    let rate = p * (1 + vary * (Math.random() * 2 - 1));
    let offset = 0;
    let at = t;
    if (v.name === 'bombWhistle') {
      const want = clamp(Number(o.duration) || 2.5, 0.4, 6);
      rate = p * clamp(buf.duration / want, 0.8, 1.25);
      const len = buf.duration / rate;
      if (len > want) offset = (len - want) * rate;
      else at = t + (want - len);
    }
    const g = gain(v, 1);
    if (offset > 0) {
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + 0.12);
    }
    const s = sample(v, buf, at, at + (buf.duration - offset) / rate + 0.005, rate, offset);
    s.connect(g);
    g.connect(v.in);
  }

  function stopVoice(v, fade) {
    if (v.dead || v.stopped) return;
    v.stopped = true;
    const now = ctx.currentTime;
    if (v.duck) duck(now, now);
    const f = Math.max(0.005, Number(fade) || 0);
    const g = v.in.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0, now, f / 4);
    const end = now + f * 2 + 0.01;
    for (const s of v.src) if (s.t1 > end) stopAt(s, end);
    if (v.end > end) v.end = end;
  }

  function setVoice(v, o) {
    if (v.dead || v.stopped) return;
    const now = ctx.currentTime;
    if (o.volume != null) v.volume = Math.max(0, Number(o.volume) || 0);
    if (o.distance != null) {
      const d = Math.max(0, Number(o.distance) || 0);
      v.dist = d;
      v.lp.frequency.setTargetAtTime(distCutoff(d), now, 0.05);
    }
    if (o.volume != null || o.distance != null) v.in.gain.setTargetAtTime(v.volume * v.trim * distGain(v.dist), now, 0.05);
    if (o.pan != null && v.pn.pan) v.pn.pan.setTargetAtTime(clamp(Number(o.pan) || 0, -1, 1), now, 0.05);
  }

  // The game calls these directly from its loop, so they must never throw.
  function handleFor(v) {
    return {
      stop(fade = 0.06) {
        try {
          stopVoice(v, fade);
        } catch {
          // ignore: sound already gone
        }
      },
      set(o) {
        try {
          setVoice(v, o || EMPTY);
        } catch {
          // ignore: sound already gone
        }
      },
    };
  }

  function stopAll(fade = 0.1) {
    for (const v of live) if (v.sfx) stopVoice(v, fade);
  }

  // =========================================================================
  // Scenes: a music loop plus an ambience bed, faded in and out together
  // =========================================================================
  const scenes = [];
  let current = null;
  // Where the fight is, for music that follows it (the Kraken's, see SONGS.kraken): set by setMusicPhase().
  let musicPhase = 0;
  let phaseCalls = 0;

  // sc.music says what the scene's music is: 'rec' (a recording), 'synth' (the sequenced tune), or 'wait'
  // (silent until its recording arrives, at most until sc.waitUntil). `carry`: where the music of the scene being
  // left is, when this scene plays the same music (see musicPlace); it then goes on from there, not from the top.
  function makeScene(name, t0, instant, carry = null) {
    const cv = { end: Infinity, nodes: [], src: [], sfx: false, dead: false }; // the scene's long-lived nodes
    live.push(cv);
    const sc = { name, t0, st0: t0, stopAt: Infinity, cv, i: 0, song: null, em: [], kids: [], music: null, ambience: 'synth' };
    const fader = (to) => {
      const g = gain(cv, instant ? to : 0);
      if (!instant) g.gain.setTargetAtTime(to, t0, 0.5);
      return g;
    };
    const trim = SCENE_GAIN[name];
    sc.dry = fader(trim.music);
    sc.wet = fader(trim.music);
    sc.ambFade = fader(trim.amb);
    sc.dry.connect(musicBus);
    sc.wet.connect(musicVerb);
    sc.ambFade.connect(ambBus);
    // The synthesised ambience (its beds live in sc.av, its events are voices of their own) and the synthesised
    // tune have their own faders, so a recording that arrives mid-scene can take over from them.
    sc.amb = gain(cv, 1);
    sc.amb.connect(sc.ambFade);
    sc.av = longVoice(sc);
    sc.synthDry = gain(cv, 1);
    sc.synthWet = gain(cv, 1);
    sc.synthDry.connect(sc.dry);
    sc.synthWet.connect(sc.wet);
    // An instrument bus: panned, with an optional reverb send.
    sc.bus = (pan, send = 0) => {
      const p = panner(cv, pan);
      p.connect(sc.synthDry);
      if (send) {
        const s = gain(cv, send);
        p.connect(s);
        s.connect(sc.synthWet);
      }
      return p;
    };
    const music = recs.get(`music:${musicOf(name)}`);
    if (music) startRecordedMusic(sc, music, t0, false, carry && carry.rec === music.buffer ? carry.at(t0) : null);
    else if (pending(`music:${musicOf(name)}`)) {
      sc.music = 'wait';
      sc.waitUntil = t0 + MUSIC_WAIT;
    } else startSynth(sc, t0, carry && carry.tune === tuneOf(name) ? carry.st0 : null);
    const amb = recs.get(`amb:${name}`);
    if (amb) startRecordedAmbience(sc, amb, t0, false);
    else AMBIENCE[name](sc, t0);
    return sc;
  }

  // A voice for a scene's long-lived nodes (a bed, a drone): it ends with the scene, or earlier when cut short.
  function longVoice(sc) {
    const v = { end: Infinity, nodes: [], src: [], sfx: false, dead: false };
    live.push(v);
    sc.kids.push(v);
    return v;
  }

  // The sequenced tune, from t on. Its long-lived nodes (the volcano's drone) live in their own voice, sc.sv.
  // `from`: the start time of the same tune already playing in the scene being left; this one keeps its beat and
  // picks it up at the next step.
  function startSynth(sc, t, from = null) {
    sc.music = 'synth';
    sc.st0 = t;
    sc.i = 0;
    sc.sv = longVoice(sc);
    sc.song = SONGS[sc.name](sc);
    if (from != null && from <= t) {
      sc.st0 = from;
      sc.i = Math.ceil((t - from) / sc.song.dur - 1e-6);
    }
  }

  // A recording on a loop. `fade`: swell in (it is replacing silence or the synthesised tune mid-scene).
  // `offset`: where in the recording to start (default: musicOffset).
  function startRecordedMusic(sc, rec, t, fade, offset = null) {
    sc.music = 'rec';
    sc.recSeconds = rec.buffer.duration;
    sc.recBuffer = rec.buffer;
    sc.recAt = t;
    sc.recFrom = (offset == null ? musicOffset : offset) % rec.buffer.duration;
    const s = sample(sc.cv, rec.buffer, t, null, 1, sc.recFrom);
    s.loop = true;
    const g = gain(sc.cv, fade ? 0 : rec.gain);
    if (fade) {
      g.gain.setValueAtTime(0, t);
      g.gain.setTargetAtTime(rec.gain, t, 0.25);
    }
    s.connect(g);
    g.connect(sc.dry);
  }

  // A recorded ambience bed on a loop, entered at a random point so it does not always start the same way.
  function startRecordedAmbience(sc, rec, t, fade) {
    sc.ambience = 'rec';
    const s = sample(sc.cv, rec.buffer, t, null, 1, rng() * rec.buffer.duration);
    s.loop = true;
    const g = gain(sc.cv, fade ? 0 : rec.gain);
    if (fade) {
      g.gain.setValueAtTime(0, t);
      g.gain.setTargetAtTime(rec.gain, t, 0.4);
    }
    s.connect(g);
    g.connect(sc.ambFade);
  }

  // Fade a scene's synthesised part out over ~2 s and stop its long-lived nodes after that.
  function retire(faders, v, now) {
    for (const g of faders) g.setTargetAtTime(0, now, 0.25);
    const end = now + 2;
    for (const s of v.src) if (s.t1 > end) stopAt(s, end);
    v.end = end;
  }

  // A recording has been decoded (or dropped to save memory: buffer null). New scenes use it; the current scene
  // switches to newly arrived music or ambience, crossfading from the synthesised version if that had started.
  function setRecording(key, buffer, meta = EMPTY) {
    if (!buffer) {
      recs.delete(key);
      // A scene still waiting for this one (its file failed) plays the synthesised tune straight away.
      const sc = current;
      if (sc && sc.music === 'wait' && key === `music:${musicOf(sc.name)}` && sc.stopAt === Infinity) startSynth(sc, ctx.currentTime + 0.05);
      return;
    }
    const rec = { gain: 1, duck: 0, ...meta, buffer };
    recs.set(key, rec);
    const sc = current;
    if (!sc || sc.stopAt !== Infinity) return;
    const now = ctx.currentTime;
    if (key === `amb:${sc.name}` && sc.ambience !== 'rec') {
      // No more synthesised events; those already scheduled play out under the fade, then the beds stop.
      sc.em.length = 0;
      retire([sc.amb.gain], sc.av, now);
      startRecordedAmbience(sc, rec, now + 0.05, true);
      return;
    }
    if (key !== `music:${musicOf(sc.name)}` || sc.music === 'rec') return;
    if (sc.music === 'synth') {
      // Notes already scheduled (the lookahead) play out under the fade; then the drone stops.
      sc.song = null;
      retire([sc.synthDry.gain, sc.synthWet.gain], sc.sv, now);
    }
    startRecordedMusic(sc, rec, now + 0.05, true);
  }

  function fadeOutScene(sc, now) {
    for (const g of [sc.dry, sc.wet, sc.ambFade]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.4);
    }
    sc.stopAt = now + 2.8; // ≈ -60 dB
    for (const s of sc.cv.src) if (s.t1 > sc.stopAt) stopAt(s, sc.stopAt);
    sc.cv.end = sc.stopAt;
    endKids(sc);
  }

  // A fading scene's notes and events (a 6 s gong, a long rumble) end with it, not after it.
  function endKids(sc) {
    for (const k of sc.kids) {
      if (k.dead || k.end <= sc.stopAt) continue;
      for (const s of k.src) if (s.t1 > sc.stopAt) stopAt(s, sc.stopAt);
      k.end = sc.stopAt;
    }
  }

  // Where a scene's music is, for a scene `name` that would play the very same music (the town and the title screen
  // share a tune): { rec, at(t) } for a recording (the buffer, and the offset it plays at time t), { tune, st0 } for
  // the synthesised tune. null when the music differs, is still waiting, or the scene is already on its way out.
  function musicPlace(sc, name) {
    if (!sc || sc.stopAt !== Infinity) return null;
    if (sc.music === 'rec' && musicOf(sc.name) === musicOf(name)) {
      const { recBuffer: rec, recAt, recFrom } = sc;
      return { rec, at: (t) => (recFrom + Math.max(0, t - recAt)) % rec.duration };
    }
    if (sc.music === 'synth' && sc.song && tuneOf(sc.name) === tuneOf(name)) return { tune: tuneOf(name), st0: sc.st0 };
    return null;
  }

  function setScene(name, instant = false) {
    if (name != null && !SONGS[name]) return;
    // Without a recording of its own the shipyard keeps the title screen's scene (the jig plays on, no restart).
    if (name === 'dock' && !recs.has('music:dock') && !pending('music:dock')) name = 'menu';
    if ((current ? current.name : null) === name) return;
    const now = ctx.currentTime;
    const carry = name ? musicPlace(current, name) : null;
    if (current) {
      if (instant) {
        // Nothing is audible (muted or suspended): drop the old scene at once.
        for (const v of [current.cv, ...current.kids]) {
          if (v.dead) continue;
          for (const s of v.src) if (s.t1 > now) stopAt(s, now);
          kill(v);
        }
        scenes.splice(scenes.indexOf(current), 1);
      } else fadeOutScene(current, now);
    }
    current = name ? makeScene(name, now + 0.05, instant, carry) : null;
    if (current) scenes.push(current);
    pump(now + LOOKAHEAD);
  }

  // Schedule everything due before `horizon` (seconds on the audio clock).
  function pump(horizon) {
    const now = ctx.currentTime;
    for (let k = scenes.length - 1; k >= 0; k--) {
      const sc = scenes[k];
      if (now > sc.stopAt + 0.1) {
        scenes.splice(k, 1);
        continue;
      }
      const end = Math.min(horizon, sc.stopAt);
      owner = sc;
      try {
        // Waited long enough for the recording: play the synthesised tune after all.
        if (sc.music === 'wait' && now >= sc.waitUntil && sc.stopAt === Infinity) startSynth(sc, now + 0.05);
        const song = sc.song;
        // Each step's time comes from its index, so long loops never accumulate rounding drift.
        let t = song ? sc.st0 + sc.i * song.dur : Infinity;
        while (t < end) {
          if (t >= now - 0.02) song.step(sc.i, t); // skip notes we were too late for (stalled main thread)
          sc.i++;
          t = sc.st0 + sc.i * song.dur;
        }
        // No new ambience events once the scene is fading out.
        if (sc.stopAt === Infinity) {
          for (const e of sc.em) {
            if (e.next < now - 0.05) e.next = now + 0.05 + rng() * 0.5;
            while (e.next < end) e.next += Math.max(0.05, e.fire(e.next));
          }
        }
      } finally {
        owner = null;
      }
      if (sc.stopAt !== Infinity) endKids(sc); // notes written during the fade
      if (sc.kids.length > 256) sc.kids = sc.kids.filter((kid) => !kid.dead);
    }
    if (now - lastSweep > 0.1 || now < lastSweep) sweep(now);
  }

  // =========================================================================
  // Music
  // =========================================================================
  const SONGS = {
    menu(sc) {
      const { bar: BAR, dur: SD, scale } = MENU;
      const mel = parseScore(MENU.melody, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(MENU.chords);
      const lead = sc.bus(0.15, 0.3);
      const harm = sc.bus(-0.3, 0.3);
      const gtr = sc.bus(-0.25, 0.2);
      const bass = sc.bus(0.05, 0.08);
      const drums = sc.bus(0.1, 0.12);
      // Who plays the tune, per pass and section (A A' B A'').
      const roles = [
        ['reed', 'fiddle', 'reed', 'fiddle'],
        ['fiddle', 'reed', 'fiddle', 'reed'],
      ];
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const sec = bar >> 3;
          const ch = CHORD[chords[bar][0]];
          const role = roles[pass & 1][sec];
          const harmony = sec === 2 || (sec === 3 && pass & 1);
          const notes = at[pos];
          if (notes) {
            for (const n of notes) {
              const d = n.len * SD;
              const v = voice();
              if (role === 'reed') reed(v, lead, t, [n.m], d * 0.85, 0.075, 3000, 4);
              else fiddle(v, lead, t, mtof(n.m), d * 0.92, 0.05);
              if (harmony) {
                const h = diatonic(n.m, 2, scale);
                if (h != null) {
                  if (role === 'reed') fiddle(v, harm, t, mtof(h), d * 0.92, 0.03);
                  else reed(v, harm, t, [h], d * 0.85, 0.045, 2600, 4);
                }
              }
            }
          }
          const v = voice();
          const root = ch[0] % 12;
          const last = bar === mel.bars - 1;
          // Bass on 1 and 4, guitar strums on 3 and 6, bodhran underneath; a drum pickup into the next loop.
          if (s === 0) pluck(v, bass, t, mtof(36 + root), 0.45, 0.5);
          if (s === 3) pluck(v, bass, t, mtof(36 + root + 7), 0.32, 0.45);
          if (s === 2 || s === 5) strum(v, gtr, t, voicing(ch, 52, 67), s === 2 ? 0.14 : 0.11, 0.28);
          if (s === 4 && !last && rng() < 0.25) strum(v, gtr, t, voicing(ch, 52, 67).reverse(), 0.06, 0.15, 0.008);
          if (s === 0) drum(v, drums, t, 0.42, 82, 0.35);
          if (s === 3) drum(v, drums, t, 0.26, 86, 0.3);
          if (last && s >= 4) drum(v, drums, t, 0.14 + (s - 4) * 0.08, 120 - (s - 4) * 15, 0.15);
          else if ((s === 2 || s === 5) && rng() < 0.6) drum(v, drums, t, 0.1, 140, 0.12);
          if (s === 5) hiss(v, drums, t, 0.05, 0.05, 'highpass', 3500, -3);
        },
      };
    },

    // The shipyard has its own recording; synthesised, it gets the title-screen jig.
    dock(sc) {
      return SONGS.menu(sc);
    },

    europe(sc) {
      const { bar: BAR, dur: SD, scale } = EUROPE;
      const mel = parseScore(EUROPE.melody, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(EUROPE.chords);
      const lead = sc.bus(0.2, 0.28);
      const harm = sc.bus(-0.3, 0.28);
      const acc = sc.bus(-0.2, 0.18);
      const banjo = sc.bus(0.35, 0.15);
      const bass = sc.bus(0, 0.06);
      const drums = sc.bus(0.05, 0.1);
      // Lead / harmony per pass and section (A B A').
      const roles = [
        [['fiddle', null], ['reed', null], ['fiddle', 'reed']],
        [['reed', 'banjo'], ['fiddle', null], ['fiddle', 'reed8']],
      ];
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const sec = Math.floor(bar / 8);
          const cb = chords[bar];
          const ch = CHORD[cb.length > 1 && s >= BAR / 2 ? cb[1] : cb[0]];
          const [role, extra] = roles[pass & 1][sec];
          const notes = at[pos];
          if (notes) {
            for (const n of notes) {
              const d = n.len * SD;
              const v = voice();
              if (role === 'fiddle') {
                // A quick upper-neighbour flick now and then on longer notes.
                if (n.len >= 2 && rng() < 0.2) {
                  const g = diatonic(n.m, 1, scale);
                  if (g != null) fiddle(v, lead, t, mtof(g), 0.06, 0.045);
                  fiddle(v, lead, t + 0.06, mtof(n.m), d * 0.9 - 0.06, 0.05);
                } else fiddle(v, lead, t, mtof(n.m), d * 0.9, 0.05);
              } else reed(v, lead, t, [n.m], d * 0.85, 0.07, 3200, 6);
              if (extra === 'reed') {
                const h = diatonic(n.m, -2, scale);
                if (h != null) reed(v, harm, t, [h], d * 0.85, 0.045, 2400, 6);
              } else if (extra === 'reed8') reed(v, harm, t, [n.m - 12], d * 0.85, 0.045, 2000, 6);
            }
          }
          const v = voice();
          const root = ch[0] % 12;
          // Oom-pah: accordion bass on 1 and 3, chord stabs on 2 and 4.
          if (s === 0 || s === 4) {
            const m = 36 + root + (s === 4 && cb.length === 1 ? 7 : 0);
            reed(v, bass, t, [m], 0.22, 0.12, 700, 3);
            drum(v, drums, t, 0.3, 55, 0.25, 2);
          }
          if (s === 2 || s === 6) {
            reed(v, acc, t, voicing(ch, 55, 70), 0.15, 0.035, 2200, 7);
            hiss(v, drums, t, 0.06, 0.12, 'highpass', 2500, -3);
          }
          if (s & 1) hiss(v, drums, t, rng() < 0.3 ? 0.035 : 0.02, 0.05, 'bandpass', 7000, 1.2);
          if (extra === 'banjo') {
            const tones = voicing(ch, 62, 79).sort((a, b) => a - b);
            pluck(v, banjo, t, mtof(tones[[0, 1, 2, 1][s % 4]]), 0.08, 0.25);
          }
        },
      };
    },

    bali(sc) {
      const { dur: SD, base, cents } = BALI;
      const freq = (deg, b) => b * Math.pow(2, (1200 * Math.floor(deg / 5) + cents[((deg % 5) + 5) % 5]) / 1200);
      const len = 4 * 64;
      const polos = sc.bus(-0.35, 0.35);
      const sangsih = sc.bus(0.35, 0.35);
      const low = sc.bus(0, 0.3);
      const gongs = sc.bus(0, 0.4);
      const drums = sc.bus(0.15, 0.15);
      const suling = sc.bus(0.1, 0.4);
      const pokokOf = (g) => (g < 2 ? BALI.pokokA : BALI.pokokB);
      let run = null;
      let kpat = '....';
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const g = Math.floor(pos / 64); // gong cycle 0..3
          const k = Math.floor(pos / 4) % 16; // beat in the cycle
          const s = pos % 4;
          const pok = pokokOf(g);
          const c = pok[k];
          const n = k < 15 ? pok[k + 1] : pokokOf((g + 1) % 4)[0];
          const dense = g === 1 || g === 2;
          const v = voice();
          // Gangsa: shimmering figuration around the melody, split between two interlocking parts.
          if (s === 0) run = dense && Math.abs(n - c) >= 2 && rng() < 0.3 ? Math.sign(n - c) : null;
          let deg = null;
          if (run) deg = s < 3 ? c + run * s : n - run;
          else if (dense) deg = [c, c + 1, c, n === c ? c + 1 : n][s];
          else if (s === 0) deg = c;
          else if (s === 2) deg = k & 1 ? n : c + 1;
          if (deg != null) bell(v, s & 1 ? sangsih : polos, t, freq(deg, base * 2), 0.06, 0.55, 3.5, 0.55, 6);
          if (s === 0) {
            // Core melody, a low gong-chime every fourth beat, and the kempli keeping time.
            bell(v, low, t, freq(c, base), 0.075, 1.1, 2, 0.35, 2.5);
            if (k % 4 === 3) bell(v, low, t, freq(c, base / 2), 0.08, 2.4, 2, 0.3, 1.2);
            bell(v, drums, t, 720, k % 2 ? 0.018 : 0.03, 0.1, 1.48, 0.5);
            if (k === 7) gong(v, gongs, t, 110, 0.055, 3);
            if (k === 15) gong(v, gongs, t, 65, 0.09, 6);
          }
          // Kendang drums from the second cycle on.
          if (g > 0) {
            const fill = g === 3 && k >= 14;
            if (s === 0) kpat = fill ? 'tdtd' : pick(['d...', '..t.', 'd.t.', '.t.d', 't..t', '....']);
            const hit = kpat[s];
            if (hit === 'd') drum(v, drums, t, fill ? 0.18 : 0.13, 120, 0.22, 1.3);
            else if (hit === 't') hiss(v, drums, t, fill ? 0.09 : 0.06, 0.05, 'bandpass', 2400, 2);
          }
          // Suling over the B cycles.
          if (g >= 2 && s === 0) {
            const line = BALI.suling[g - 2];
            for (let j = 0; j < line.length; j++) {
              if (line[j][0] !== k) continue;
              const prev = line[j - 1];
              const from = prev && rng() < 0.5 ? freq(prev[1], base) : 0;
              flute(v, suling, t, freq(line[j][1], base), line[j][2] * 4 * SD - 0.08, 0.05, from);
            }
          }
        },
      };
    },

    volcano(sc) {
      const { bar: BAR, dur: SD } = VOLCANO;
      const mel = parseScore(VOLCANO.lead, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(VOLCANO.chords);
      const lead = sc.bus(0.15, 0.35);
      const stabs = sc.bus(-0.2, 0.25);
      const bass = sc.bus(0, 0.05);
      const drums = sc.bus(0, 0.15);
      const anvil = sc.bus(0.4, 0.3);
      // The drone: low detuned saws on D and A, slowly breathing through a low-pass.
      const t0 = sc.st0;
      const dv = sc.sv;
      const dl = filt(dv, 'lowpass', 340, 4);
      const dg = gain(dv, 0.045);
      for (const [m, dt] of [[38, -9], [38, 9], [45, 0]]) {
        const o = osc(dv, 'sawtooth', mtof(m), t0, null);
        o.detune.value = dt;
        o.connect(dl);
      }
      const sub = osc(dv, 'sine', mtof(26), t0, null);
      const subg = gain(dv, 0.3);
      sub.connect(subg);
      subg.connect(dg);
      lfo(dv, 0.05, 180, dl.frequency, t0);
      dl.connect(dg);
      dg.connect(sc.bus(0, 0.2));
      let pattern = 'a';
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const name = chords[bar][0];
          const ch = CHORD[name];
          const v = voice();
          // Taiko.
          if (s === 0) pattern = bar < 2 ? 'intro' : bar % 4 === 3 ? 'fill' : rng() < 0.6 ? 'a' : 'b';
          const hit = VOLCANO.drums[pattern][s];
          if (hit === 'X') {
            // Taiko "DON": a driven body (its harmonics carry on small speakers) plus the stick on the skin.
            boom(v, drums, t, 0.26, 62, 0.75, 1.8);
            hiss(v, drums, t, 2.2, 0.16, 'bandpass', 380, 1.4);
            hiss(v, drums, t, 0.1, 0.04, 'lowpass', 2000, 0);
          } else if (hit === 'x') {
            boom(v, drums, t, 0.14, 82, 0.45, 1.7);
            hiss(v, drums, t, 1.2, 0.1, 'bandpass', 480, 1.4);
          }
          else if (hit === 'k') hiss(v, drums, t, 0.1, 0.04, 'bandpass', 1900, 3);
          else if (hit === 't') drum(v, drums, t, 0.2 + s * 0.008, 130, 0.3);
          else if (hit === 'T') drum(v, drums, t, 0.26 + s * 0.008, 100, 0.35);
          // Ostinato: eighth notes from bar 3 (quarters at first), with a phrygian flat-2 and a leading tone on A.
          // In the baritone range, so it drives on laptop speakers; the drone holds the floor.
          if (bar >= 2 && s % 2 === 0 && (bar >= 4 || s % 4 === 0)) {
            const root = { Dm: 50, Bb: 46, A: 45, Gm: 43, Eb: 51 }[name];
            const iv = [0, 0, 12, 0, 1, 0, name === 'A' ? -1 : -2, 0][s / 2];
            bassPluck(v, bass, t, mtof(root + iv), SD * 1.6, s % 6 === 0 ? 0.15 : 0.105);
          }
          // Brass stabs from bar 5 (close-voiced around D3), heavier in the second half.
          const stab = voicing(ch, 45, 59);
          if (bar >= 4 && s === 0) for (const m of stab) brass(v, stabs, t, mtof(m), bar >= 8 ? SD * 10 : SD * 6, 0.05, 0.8);
          if (bar >= 8 && s === 10) for (const m of stab) brass(v, stabs, t, mtof(m), SD * 1.5, 0.045, 1);
          if (bar >= 8 && (s === 4 || s === 12)) bell(v, anvil, t, 1650, 0.05, 0.22, 2.76, 1.4);
          // A slow horn line in the second half (an octave down with a bell on odd passes).
          const notes = at[pos];
          if (notes) {
            for (const n of notes) {
              const m = pass & 1 ? n.m - 12 : n.m;
              brass(v, lead, t, mtof(m), n.len * SD * 0.92, pass & 1 ? 0.11 : 0.085, 0.8);
              if (pass & 1) bell(v, lead, t, mtof(n.m), 0.03, 1.4, 1.4, 0.6);
            }
          }
        },
      };
    },

    doubloon(sc) {
      const { bar: BAR, dur: SD, scale, spanish } = DOUBLOON;
      const mel = parseScore(DOUBLOON.melody, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(DOUBLOON.chords);
      const lead = sc.bus(0.15, 0.3);
      const second = sc.bus(-0.3, 0.3);
      const gtr = sc.bus(-0.25, 0.15);
      const gtr2 = sc.bus(0.35, 0.15);
      const bass = sc.bus(0, 0.05);
      const kit = sc.bus(0.15, 0.12);
      const bells = sc.bus(-0.1, 0.5);
      // Who has the tune per pass and section (A A' B A''): a trumpet, the guitar, or two trumpets in thirds.
      const roles = [
        ['trumpet', 'trumpet', 'pair', 'pair'],
        ['guitar', 'trumpet', 'pair', 'trumpet'],
      ];
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const sec = bar >> 3;
          const ch = CHORD[chords[bar][0]];
          const role = roles[pass & 1][sec];
          const six8 = bar & 1; // every other bar leans into 6/8 (accents on 1 and 4): the fandango's hemiola
          const notes = at[pos];
          if (notes) {
            for (const n of notes) {
              const d = n.len * SD;
              const v = voice();
              if (role === 'guitar') {
                // Tremolo picking: the tune re-plucked three times a step, so it sings over the strumming.
                for (let k = 0, m = Math.max(1, Math.round(n.len * 3 - 1)); k < m; k++) {
                  pluck(v, lead, t + (k * SD) / 3, mtof(n.m), k ? 0.2 : 0.3, SD * 0.45);
                }
              } else brass(v, lead, t, mtof(n.m), d * 0.88, 0.075, 1.15);
              if (role === 'pair') {
                const h = diatonic(n.m, -2, chords[bar][0] === 'E' ? spanish : scale);
                if (h != null) brass(v, second, t, mtof(h), d * 0.88, 0.05, 1);
              }
            }
          }
          const v = voice();
          const root = ch[0] % 12;
          const tones = voicing(ch, 52, 67);
          const sv = role === 'guitar' ? 0.6 : 1; // the rhythm guitars step back while a guitar has the tune
          // Guitars: a rasgueado roll on the downbeat, then strums on the 3/4 (or 6/8) accents, light up-strums between.
          if (s === 0) {
            strum(v, gtr, t, tones, 0.16 * sv, 0.3, 0.014);
            strum(v, gtr, t + 0.05, tones.slice().reverse(), 0.09 * sv, 0.25, 0.01);
          } else if (six8 ? s === 3 : s === 2 || s === 4) strum(v, gtr, t, tones, 0.12 * sv, 0.25, 0.012);
          else if (six8 ? s === 1 || s === 4 : s === 5) strum(v, gtr2, t, tones.slice().reverse(), 0.05 * sv, 0.15, 0.008);
          // Bass: the root on 1, the fifth on the next accent. Cajon: its bass tone on 1, slaps on the accents.
          if (s === 0) pluck(v, bass, t, mtof(36 + root), 0.45, 0.45);
          if (six8 ? s === 3 : s === 4) pluck(v, bass, t, mtof(43 + root), 0.3, 0.35);
          if (s === 0) drum(v, kit, t, 0.35, 78, 0.22, 1.5);
          if (six8 ? s === 3 : s === 2 || s === 4) hiss(v, kit, t, 0.12, 0.06, 'bandpass', 1900, 1.4);
          // Castanets on the off-beats, with a trill into the last bar of each phrase.
          if (bar % 4 === 3 && s >= 3) for (let k = 0; k < 3; k++) castanet(v, kit, t + (k * SD) / 3, 0.05 + k * 0.01);
          else if (s % 2 === 1 || (s === 4 && rng() < 0.5)) castanet(v, kit, t, s === 1 ? 0.05 : 0.035);
          // The harbour bell tolls each section in.
          if (s === 0 && bar % 8 === 0) {
            bell(v, bells, t, 220, 0.05, 3.2, 2.0, 0.55, 1.2);
            bell(v, bells, t, 220 * 2.4, 0.018, 2, 1.4, 0.3);
          }
        },
      };
    },

    frost(sc) {
      const { bar: BAR, dur: SD, scale } = FROST;
      const mel = parseScore(FROST.melody, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(FROST.chords);
      const lead = sc.bus(0.1, 0.35);
      const second = sc.bus(-0.35, 0.35);
      const pad = sc.bus(-0.1, 0.45);
      const cel = sc.bus(0.4, 0.45);
      const horns = sc.bus(-0.25, 0.4);
      const drums = sc.bus(0, 0.15);
      // The drone: open fifths on E, bowed (saws through a slowly breathing low-pass), under everything.
      const t0 = sc.st0;
      const dv = sc.sv;
      const dl = filt(dv, 'lowpass', 700, 1);
      for (const [m, dt] of [[40, -6], [47, 5], [52, 0]]) {
        const o = osc(dv, 'sawtooth', mtof(m), t0, null);
        o.detune.value = dt;
        o.connect(dl);
      }
      lfo(dv, 0.07, 250, dl.frequency, t0);
      const swell = gain(dv, 1);
      lfo(dv, 0.11, 0.25, swell.gain, t0);
      const dg = gain(dv, 0.014);
      dl.connect(swell);
      swell.connect(dg);
      dg.connect(sc.bus(0, 0.25));
      // Who has the tune per pass and section (A B A'): the fiddle, or a wooden flute; the fiddle gets a second
      // fiddle a third below it in the middle and the reprise.
      const roles = [
        ['fiddle', 'fiddle+', 'fiddle+'],
        ['flute', 'fiddle+', 'fiddle+'],
      ];
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const sec = Math.floor(bar / 8);
          const ch = CHORD[chords[bar][0]];
          const root = ch[0] % 12;
          const role = roles[pass & 1][sec];
          const notes = at[pos];
          if (notes) {
            for (const n of notes) {
              const d = n.len * SD;
              const v = voice();
              if (role === 'flute') flute(v, lead, t, mtof(n.m), d * 0.9, 0.075);
              else fiddle(v, lead, t, mtof(n.m), d * 0.92, 0.065);
              if (role === 'fiddle+') {
                const h = diatonic(n.m, -2, scale);
                if (h != null) fiddle(v, second, t, mtof(h), d * 0.92, 0.035);
              }
            }
          }
          const v = voice();
          // Rowing drum on 1 and 3 (a big skin, then a lighter stroke), a frame drum tapping 2 and 4.
          if (bar > 0 || pass > 0) {
            if (s === 0) {
              boom(v, drums, t, 0.22, 52, 0.6, 1.8);
              hiss(v, drums, t, 1.2, 0.12, 'bandpass', 330, 1.4);
            }
            if (s === 4) {
              boom(v, drums, t, 0.14, 58, 0.45, 1.7);
              hiss(v, drums, t, 0.7, 0.1, 'bandpass', 360, 1.4);
            }
            if (s === 2 || s === 6) drum(v, drums, t, 0.12, 150, 0.12, 1.3);
            if (sec === 1 && s === 7) drum(v, drums, t, 0.08, 170, 0.1, 1.3);
          }
          // A choir breathes each chord ("ooh", opening to "aah" in the middle).
          if (s === 0) choir(v, pad, t, voicing(ch, 52, 66), BAR * SD * 0.98, 0.016, sec === 1 ? 'aa' : 'oo');
          // Celesta frost from the middle on: the chord rippling high up.
          if (sec >= 1) {
            const tones = voicing(ch, 76, 90).sort((a, b) => a - b);
            const k = [0, 1, 2, 1, 2, 0, 1, 2][s] % tones.length;
            bell(v, cel, t, mtof(tones[k]), s % 2 ? 0.014 : 0.022, 0.9, 4, 0.25);
          }
          // Lur horns call across the fjord in the middle section.
          if (sec === 1 && s === 0 && bar % 2 === 0) horn(v, horns, t, mtof(48 + root), SD * 6, 0.06);
        },
      };
    },

    maelstrom(sc) {
      const { bar: BAR, dur: SD } = MAELSTROM;
      const mel = parseScore(MAELSTROM.melody, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(MAELSTROM.chords);
      const lead = sc.bus(0.15, 0.45);
      const bones = sc.bus(-0.35, 0.3);
      const org = sc.bus(-0.1, 0.4);
      const pizz = sc.bus(0.25, 0.2);
      const bass = sc.bus(0, 0.1);
      const drums = sc.bus(0, 0.25);
      const bells = sc.bus(0.1, 0.6);
      // Who sings the tune per pass and section (A A' B A''): the theremin, the bones, or both (bones an octave up).
      const roles = [
        ['ghost', 'ghost', 'bones', 'both'],
        ['bones', 'ghost', 'bones', 'ghost'],
      ];
      let prev = 0; // the theremin slides into each note from the last one
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const sec = bar >> 3;
          const ch = CHORD[chords[bar][0]];
          const root = ch[0] % 12;
          const role = roles[pass & 1][sec];
          const notes = at[pos];
          if (notes) {
            for (const n of notes) {
              const d = n.len * SD;
              const v = voice();
              if (role === 'bones') xylo(v, bones, t, mtof(n.m), 0.07);
              else {
                theremin(v, lead, t, mtof(n.m), d * 0.95, 0.07, prev);
                if (role === 'both') xylo(v, bones, t, mtof(n.m + 12), 0.035);
              }
              prev = mtof(n.m);
            }
          }
          const v = voice();
          // The waltz: a pizzicato bass on 1, plucked chords on 2 and 3.
          if (s === 0) pluck(v, bass, t, mtof(36 + root), 0.5, 0.35);
          if (s === 2 || s === 4) strum(v, pizz, t, voicing(ch, 55, 68), 0.1, 0.12, 0.006);
          // The organ holds the chords: two bars a breath, every bar in the last section.
          if (s === 0 && (sec === 3 || bar % 2 === 0)) {
            organ(v, org, t, voicing(ch, 48, 62), (sec === 3 ? 1 : 2) * BAR * SD * 0.96, sec === 3 ? 0.03 : 0.022);
          }
          // Timpani on the phrase starts and a roll into each section; a deep bell tolls every eight bars.
          if (s === 0 && bar % 4 === 0) {
            drum(v, drums, t, 0.45, mtof(36 + (root > 7 ? root - 12 : root)), 0.9, 1.15);
            hiss(v, drums, t, 0.35, 0.05, 'lowpass', 700, 0);
          }
          if (bar % 8 === 7 && s >= 3) {
            for (let k = 0; k < 2; k++) drum(v, drums, t + (k * SD) / 2, 0.12 + (s - 3) * 0.06 + k * 0.03, mtof(43), 0.25, 1.1);
          }
          if (s === 0 && bar % 8 === 0) bell(v, bells, t, 130.81, 0.05, 4.5, 1.4, 0.7, 1.3);
        },
      };
    },

    // Ashore: the title screen's jig (its recording when there is one, see MUSIC_OF).
    town(sc) {
      return SONGS.menu(sc);
    },

    // At Professor Barnacle's Riddle Bell: the town's tune carries on (see MUSIC_OF).
    quiz(sc) {
      return SONGS.menu(sc);
    },

    atolls(sc) {
      const { bar: BAR, dur: SD, scale } = ATOLLS;
      const mel = parseScore(ATOLLS.melody, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(ATOLLS.chords);
      const lead = sc.bus(0.2, 0.3);
      const mar = sc.bus(-0.3, 0.25);
      const uke = sc.bus(-0.15, 0.15);
      const bass = sc.bus(0, 0.05);
      const kit = sc.bus(0.1, 0.12);
      const congas = sc.bus(0.4, 0.1);
      // Who has the tune per pass and section (A B A'): a steel pan, the marimba, or both (the marimba a third below).
      const roles = [
        ['pan', 'marimba', 'both'],
        ['marimba', 'pan', 'both'],
      ];
      // The ukulele's calypso strum: down on 1, down-up on 2 and its "and", up on 3-and, down on 4 (- = up).
      const STRUM = { 0: 0.1, 2: 0.07, 3: -0.055, 5: -0.055, 6: 0.085 };
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const sec = Math.floor(bar / 8);
          const ch = CHORD[chords[bar][0]];
          const role = roles[pass & 1][sec];
          const notes = at[pos];
          if (notes) {
            for (const n of notes) {
              const d = n.len * SD;
              const v = voice();
              const f = mtof(n.m);
              if (role === 'marimba') {
                // A roll on the long notes (struck again every step), single strokes on the short ones.
                for (let k = 0; k < (n.len >= 3 ? n.len : 1); k++) marimba(v, lead, t + k * SD, f, k ? 0.075 : 0.12);
              } else steelpan(v, lead, t, f, 0.08, Math.min(1.1, d + 0.35));
              if (role === 'both') {
                const h = diatonic(n.m, -2, scale);
                if (h != null) marimba(v, mar, t, mtof(h), 0.07);
              }
            }
          }
          const v = voice();
          const root = ch[0] % 12;
          const tones = voicing(ch, 60, 72);
          if (s in STRUM) strum(v, uke, t, STRUM[s] > 0 ? tones : tones.slice().reverse(), Math.abs(STRUM[s]), 0.22, 0.01);
          // Bass on 1, 2-and and 3 (root, root, fifth), now and then a third leading on.
          if (s === 0) pluck(v, bass, t, mtof(36 + root), 0.5, 0.4);
          if (s === 3) pluck(v, bass, t, mtof(36 + root), 0.35, 0.25);
          if (s === 4) pluck(v, bass, t, mtof(43 + root), 0.42, 0.35);
          if (s === 6 && rng() < 0.5) pluck(v, bass, t, mtof(36 + root + ch[1] - ch[0]), 0.25, 0.2);
          // The marimba chimes the chord off the beat while a steel pan has the tune.
          if (role === 'pan' && s % 2 === 1) {
            const ts = voicing(ch, 64, 79).sort((a, b) => a - b);
            marimba(v, mar, t, mtof(ts[(s >> 1) % ts.length]), 0.045);
          }
          // Shaker every step (pushing the off-beats), a soft kick on 1 and 3, congas, a woodblock playing a 3-2 clave.
          hiss(v, kit, t, s % 2 ? 0.04 : 0.022, 0.045, 'highpass', 6500, -3);
          if (s === 0 || s === 4) drum(v, kit, t, 0.28, 60, 0.25, 1.6);
          if (s === 2 || s === 3) drum(v, congas, t, s === 2 ? 0.14 : 0.1, s === 2 ? 190 : 260, 0.16, 1.25);
          if (s === 6 || s === 7) drum(v, congas, t, 0.12, s === 6 ? 260 : 190, 0.14, 1.25);
          if ((bar % 2 ? [2, 4] : [0, 3, 6]).includes(s)) bell(v, kit, t, 1250, 0.035, 0.08, 1.48, 0.4);
          // A conga roll into the top of the loop.
          if (bar === mel.bars - 1 && s >= 4) drum(v, congas, t + SD / 2, 0.08 + (s - 4) * 0.02, 220, 0.1, 1.25);
        },
      };
    },

    cape(sc) {
      const { bar: BAR, dur: SD, scale, harmonic } = CAPE;
      const mel = parseScore(CAPE.melody, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(CAPE.chords);
      const lead = sc.bus(0.15, 0.3);
      const second = sc.bus(-0.3, 0.3);
      const conc = sc.bus(-0.25, 0.2);
      const str = sc.bus(0.3, 0.35);
      const bass = sc.bus(0, 0.06);
      const drums = sc.bus(0, 0.15);
      // Who has the tune per pass and section (A B A'): the horns, the concertina, or two horns in thirds.
      const roles = [
        ['horn', 'reed', 'pair'],
        ['reed', 'horn', 'pair'],
      ];
      const RUN = [62, 63, 66, 67, 69, 70, 72, 74]; // the strings' run up into each section (D to D, F#: the way home)
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const sec = Math.floor(bar / 8);
          const name = chords[bar][0];
          const ch = CHORD[name];
          const role = roles[pass & 1][sec];
          const notes = at[pos];
          if (notes) {
            for (const n of notes) {
              const d = n.len * SD;
              const v = voice();
              if (role === 'reed') reed(v, lead, t, [n.m], d * 0.85, 0.075, 3000, 6);
              else brass(v, lead, t, mtof(n.m), d * 0.88, 0.07, 1.05);
              if (role === 'pair') {
                const h = diatonic(n.m, -2, name === 'D' ? harmonic : scale);
                if (h != null) brass(v, second, t, mtof(h), d * 0.88, 0.045, 0.95);
              }
            }
          }
          const v = voice();
          const root = ch[0] % 12;
          // The concertina pumps the chords off the beat (stepping back while it has the tune).
          if (s === 2 || s === 6) reed(v, conc, t, voicing(ch, 55, 69), 0.22, role === 'reed' ? 0.018 : 0.03, 2200, 7);
          // Storm strings shiver under every bar, a little louder in the chorus, and run up into each section.
          if (s === 0) tremolo(v, str, t, voicing(ch, 50, 64), BAR * SD * 0.98, sec === 1 ? 0.015 : 0.011);
          if (bar % 8 === 7 && s >= 4) {
            for (let k = 0; k < 2; k++) fiddle(v, str, t + (k * SD) / 2, mtof(RUN[(s - 4) * 2 + k]), SD * 0.45, 0.03);
          }
          // Bass: the root on the heave (1), the fifth on 3.
          if (s === 0) pluck(v, bass, t, mtof(36 + root), 0.5, 0.5);
          if (s === 4) pluck(v, bass, t, mtof(43 + root), 0.35, 0.4);
          // The big drum on the heave, a slap on 2 and 4, and a timpani roll into each section.
          if (s === 0) {
            boom(v, drums, t, 0.24, 50, 0.6, 1.8);
            hiss(v, drums, t, 1.1, 0.12, 'bandpass', 330, 1.4);
          }
          if (s === 4) {
            boom(v, drums, t, 0.13, 56, 0.45, 1.7);
            hiss(v, drums, t, 0.6, 0.1, 'bandpass', 360, 1.4);
          }
          if (s === 2 || s === 6) hiss(v, drums, t, 0.09, 0.08, 'bandpass', 1800, 1.2);
          if (bar % 8 === 7 && s >= 4) {
            for (let k = 0; k < 2; k++) drum(v, drums, t + (k * SD) / 2, 0.12 + (s - 4) * 0.05 + k * 0.02, mtof(38), 0.25, 1.1);
          }
        },
      };
    },

    deep(sc) {
      const { bar: BAR, dur: SD } = DEEP;
      const mel = parseScore(DEEP.melody, BAR);
      const len = mel.bars * BAR;
      const at = byStep(mel.notes, len);
      const chords = parseChords(DEEP.chords);
      const cel = sc.bus(-0.15, 0.25);
      const gl = sc.bus(0.2, 0.6);
      const wh = sc.bus(0, 0.8);
      const pad = sc.bus(0, 0.5);
      const drums = sc.bus(0, 0.3);
      const ROCK = [0, 1, 2, 1, 0, 1, 2, 1]; // the ostinato rocks through the chord: low, middle, top, middle...
      return {
        dur: SD,
        len,
        step(i, t) {
          const pos = i % len;
          const pass = Math.floor(i / len);
          const bar = Math.floor(pos / BAR);
          const s = pos % BAR;
          const ch = CHORD[chords[bar][0]];
          const v = voice();
          const tones = voicing(ch, 40, 59).sort((a, b) => a - b);
          cello(v, cel, t, mtof(tones[ROCK[s]]), SD * 1.02, s % 4 === 0 ? 0.075 : 0.05);
          // The glass harmonica's tune; on the second pass it hums the chord through the opening bars too.
          for (const n of at[pos] || []) glass(v, gl, t, mtof(n.m), n.len * SD * 0.9, 0.05);
          if (pass & 1 && bar < 4 && s === 0) glass(v, gl, t, mtof(voicing(ch, 64, 75).sort((a, b) => a - b)[1]), BAR * SD * 0.9, 0.03);
          // A soft choir breathing the chords, and a distant drum every other bar.
          if (s === 0 && bar % 2 === 0) {
            choir(v, pad, t, voicing(ch, 52, 64), 2 * BAR * SD * 0.95, 0.008, 'oo');
            drum(v, drums, t, 0.2, 55, 1.0, 1.2);
            hiss(v, drums, t, 0.4, 0.3, 'bandpass', 160, 1.5);
          }
          // Whales calling far off, gliding up and down.
          if (s === 0 && bar % 4 === 2 && rng() < 0.85) {
            const w = t + rand(0, SD * 3);
            const f = rand(220, 330);
            const pts = rng() < 0.5
              ? [[w, f], [w + 0.9, f * 1.6], [w + 2.2, f * 1.25], [w + 3.2, f * 0.8]]
              : [[w, f * 1.4], [w + 1.2, f * 0.9], [w + 2.0, f * 1.1], [w + 3.0, f * 0.7]];
            whale(v, wh, pts, 0.05);
          }
        },
      };
    },

    // The Kraken: the dread, then the theme, following the fight through setMusicPhase(): 0 the dread (the drone,
    // the heartbeat quickening after 4 s), 1 and 2 the theme (stabs join in phase 2), 3 the theme faster, 4 driven
    // off (it breaks into a sunrise chord and falls silent). Changes land on a bar line. With nobody calling
    // setMusicPhase the theme starts by itself after KRAKEN_TUNE.autoStart seconds.
    kraken(sc) {
      const K = KRAKEN_TUNE;
      const BAR = K.bar;
      const mel = parseScore(K.melody, BAR);
      const tb = parseScore(K.tuba, BAR);
      const len = mel.bars * BAR;
      const atM = byStep(mel.notes, len);
      const atT = byStep(tb.notes, len);
      const chords = parseChords(K.chords);
      const lead = sc.bus(0.15, 0.35);
      const choirs = sc.bus(-0.2, 0.5);
      const low = sc.bus(0, 0.12);
      const str = sc.bus(-0.3, 0.3);
      const stabs = sc.bus(0.3, 0.25);
      const drums = sc.bus(0, 0.25);
      const beat = sc.bus(0, 0.1);
      // The drone runs all scene long in its own long-lived voice, heard only while the dread lasts.
      const t0 = sc.st0;
      const dv = sc.sv;
      const level = gain(dv, 0);
      const mix = gain(dv, 1);
      for (const [f, a] of K.drone) {
        const g = gain(dv, a);
        osc(dv, 'sine', f, t0, null).connect(g);
        g.connect(mix);
      }
      const swell = gain(dv, 0.85);
      lfo(dv, 0.23, 0.15, swell.gain, t0);
      mix.connect(swell);
      swell.connect(level);
      level.connect(sc.bus(0, 0.15));
      const drone = (t, on) => {
        level.gain.cancelScheduledValues(t);
        level.gain.setTargetAtTime(on ? K.droneLevel : 0, t, on ? 0.6 : 0.5);
      };
      const calls0 = phaseCalls;
      let k = 0; // steps since the current mode began
      let ph = 0;

      function dread(t) {
        const v = voice();
        // A heartbeat once a second, quicker once the rise begins (after the dread's 4 s); bubbles now and then.
        if (k % (k < 16 ? 4 : 3) === 0) heartbeat(v, beat, t, 0.5);
        if (rng() < 0.12) bubbleTrain(v, beat, t, 0.6, 0.05, 220, 520, [0.08, 0.15], rng);
      }

      function theme(t) {
        const SD = song.dur;
        const pos = k % len;
        const bar = Math.floor(pos / BAR);
        const s = pos % BAR;
        const sec = bar >> 3;
        const name = chords[bar][0];
        const ch = CHORD[name];
        const v = voice();
        // The tuba's motif, D-C#-A.
        for (const n of atT[pos] || []) brass(v, low, t, mtof(n.m), n.len * SD * 0.88, 0.11, 2.2);
        // Timpani, tonic or dominant on 1, lighter on 4; more of them as the fight goes on; a roll into each phrase.
        const tp = mtof(name === 'A' ? 33 : 38);
        if (s === 0) timpani(v, drums, t, tp, 0.55);
        if (s === 3) timpani(v, drums, t, tp, ph >= 2 ? 0.4 : 0.3, 0.7);
        if (ph >= 3 && (s === 2 || s === 5)) timpani(v, drums, t, tp, 0.22, 0.4);
        if (bar % 4 === 3 && s >= 4) {
          for (let r = 0; r < 3; r++) timpani(v, drums, t + (r * SD) / 3, mtof(38), 0.12 + (s - 4) * 0.06 + r * 0.02, 0.35);
        }
        // Storm strings under each bar, higher in the second half.
        if (s === 0) tremolo(v, str, t, voicing(ch, sec ? 57 : 50, sec ? 71 : 64), BAR * SD * 0.98, sec ? 0.013 : 0.01, ph >= 3 ? 13 : 11);
        // The tune: horns in the first half, bright trumpets in the second with the choir.
        for (const n of atM[pos] || []) brass(v, lead, t, mtof(n.m), n.len * SD * 0.9, sec ? 0.07 : 0.06, sec ? 1.15 : 0.8);
        if (sec === 1 && s === 0) choir(v, choirs, t, voicing(ch, 55, 67), BAR * SD * 0.98, 0.018, 'aa');
        // Brass stabs from phase 2.
        if (ph >= 2 && sec === 0 && (s === 0 || s === 3)) brassChord(v, stabs, t, voicing(ch, 50, 62).map(mtof), SD * 0.7, 0.045, 0.9);
      }

      function finale(t) {
        // Driven off: the theme breaks into a sunrise D major chord over a timpani roll, with bells.
        const v = voice();
        for (let r = 0; r < 8; r++) timpani(v, drums, t + r * 0.07, mtof(38), 0.1 + r * 0.03, 0.3);
        const c = t + 0.6;
        brassChord(v, lead, c, [62, 66, 69, 74].map(mtof), 2.2, 0.11, 1);
        brass(v, low, c, mtof(38), 2.2, 0.11, 2.2);
        timpani(v, drums, c, mtof(38), 0.6);
        choir(v, choirs, c, [62, 66, 69], 2.6, 0.022, 'aa');
        [86, 90, 93, 98].forEach((m, j) => bell(v, lead, c + 0.1 + j * 0.09, mtof(m), 0.04, 1.6, 3.5, 0.5));
      }

      const song = {
        dur: K.dur,
        len,
        mode: null, // 'dread' | 'theme' | 'done'
        step(i, t) {
          // On each beat (a dotted quarter), follow the fight: a new mode starts there, at its own bar 1.
          if (song.mode === null || k % K.beat === 0) {
            ph = musicPhase;
            if (phaseCalls === calls0 && t - t0 >= K.autoStart) ph = 1;
            const want = ph >= 4 ? 'done' : ph >= 1 ? 'theme' : 'dread';
            if (want !== song.mode && !(song.mode === 'done' && want === 'theme')) {
              drone(t, want === 'dread');
              if (want === 'done' && song.mode === 'theme') finale(t);
              song.mode = want;
              k = 0;
            }
          }
          // Phase 3 plays faster, from a bar line: the steps shrink and the clock is re-anchored on this step.
          if (k % BAR === 0) {
            const d = song.mode === 'theme' && ph === 3 ? K.dur * K.fast : K.dur;
            if (d !== song.dur) {
              sc.st0 = t - i * d;
              song.dur = d;
            }
          }
          if (song.mode === 'dread') dread(t);
          else if (song.mode === 'theme') theme(t);
          k++;
        },
      };
      return song;
    },
  };

  // =========================================================================
  // Ambience: continuous beds plus randomly timed events
  // =========================================================================
  const emit = (sc, first, fire) => sc.em.push({ next: sc.t0 + first, fire });

  // Open sea: stereo noise breathing through a low-pass at two unrelated slow rates.
  function seaBed(sc, t0, lvl, cutoff) {
    const v = sc.av;
    const n = noise(v, t0, null, R.noise2);
    const lp = filt(v, 'lowpass', cutoff, -3);
    const g = gain(v, lvl);
    lfo(v, 0.071, lvl * 0.35, g.gain, t0);
    lfo(v, 0.113, lvl * 0.25, g.gain, t0);
    lfo(v, 0.047, cutoff * 0.4, lp.frequency, t0);
    n.connect(lp);
    lp.connect(g);
    g.connect(sc.amb);
  }

  // One wave washing in and out.
  function wash(sc, t, peak, bright, att, dec) {
    const v = voice();
    const end = t + att + dec + 0.05;
    const n = noise(v, t, end, R.noise2);
    const lp = filt(v, 'lowpass', 260, 0);
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.exponentialRampToValueAtTime(bright, t + att);
    lp.frequency.exponentialRampToValueAtTime(320, t + att + dec);
    const g = gain(v, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + att + dec);
    g.gain.linearRampToValueAtTime(0, end);
    n.connect(lp);
    lp.connect(g);
    g.connect(sc.amb);
  }

  // A gull: 2-4 "kyow" calls from somewhere off to the side.
  function gull(sc, t, vel) {
    const v = voice();
    const calls = 2 + Math.floor(rng() * 3);
    let f0 = rand(850, 1250);
    const syl = [];
    let tt = t;
    for (let i = 0; i < calls; i++) {
      const d = rand(0.18, 0.3);
      syl.push([tt, d, f0]);
      tt += d + rand(0.1, 0.22);
      f0 *= 0.97;
    }
    const end = tt + 0.05;
    const o = osc(v, 'sawtooth', f0, t, end);
    const bp = filt(v, 'bandpass', 2200, 1.6);
    const g = gain(v, 0);
    syl.forEach(([s, d, f], i) => {
      const a = vel * (1 - i * 0.12);
      o.frequency.setValueAtTime(f * 0.85, s);
      o.frequency.exponentialRampToValueAtTime(f * 1.3, s + d * 0.3);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, s + d);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(a, s + 0.025);
      g.gain.linearRampToValueAtTime(a * 0.6, s + d * 0.7);
      g.gain.linearRampToValueAtTime(0, s + d);
    });
    o.connect(bp);
    bp.connect(g);
    g.connect(panner(v, rand(-0.8, 0.8))).connect(sc.amb);
  }

  // Timbers creaking somewhere on the ship.
  function creak(sc, t, vel) {
    const v = voice();
    const d = rand(0.4, 0.9);
    const end = t + d + 0.2;
    const f = rand(60, 95);
    const o = osc(v, 'sawtooth', f, t, end);
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * rand(1.05, 1.35), t + d * 0.4);
    o.frequency.linearRampToValueAtTime(f * rand(0.8, 1.0), t + d);
    const bp = filt(v, 'bandpass', rand(700, 1100), 6);
    const g = gain(v, 0);
    sus(g.gain, t, vel, 0.08, t + d, 0.15);
    o.connect(bp);
    bp.connect(g);
    g.connect(panner(v, rand(-0.5, 0.5))).connect(sc.amb);
  }

  // Tropical birds: trills, a rising "ko-el" call, chirp clusters and soft doves.
  function bird(sc, t, vel) {
    const v = voice();
    const kind = pick(['trill', 'koel', 'chirps', 'dove', 'trill', 'chirps']);
    const evs = []; // [start, dur, from, to, level]
    if (kind === 'trill') {
      const f = rand(2800, 4200);
      let s = t;
      for (let i = 0, n = 1 + Math.floor(rng() * 3); i < n; i++) {
        const d = rand(0.25, 0.5);
        evs.push([s, d, f, f * 0.92, vel]);
        s += d + rand(0.15, 0.35);
      }
    } else if (kind === 'koel') {
      const f = rand(900, 1200);
      let s = t;
      for (let i = 0, n = 3 + Math.floor(rng() * 3); i < n; i++) {
        const f1 = f * (1 + 0.05 * i);
        evs.push([s, 0.12, f1 * 0.95, f1, vel * 0.8]);
        evs.push([s + 0.17, 0.24, f1 * 1.2, f1 * 1.35, vel]);
        s += 0.75;
      }
    } else if (kind === 'chirps') {
      const f = rand(4200, 5600);
      let s = t;
      for (let i = 0, n = 4 + Math.floor(rng() * 5); i < n; i++) {
        evs.push([s, 0.045, f, f * 0.5, vel * 0.8]);
        s += rand(0.08, 0.13);
      }
    } else {
      const f = rand(480, 560);
      evs.push([t, 0.3, f * 0.96, f, vel * 0.7], [t + 0.45, 0.45, f * 1.04, f * 0.94, vel], [t + 1.05, 0.3, f, f * 0.96, vel * 0.7]);
    }
    const last = evs[evs.length - 1];
    const end = last[0] + last[1] + 0.05;
    const o = osc(v, 'sine', evs[0][2], t, end);
    if (kind === 'trill') lfo(v, rand(18, 28), evs[0][2] * 0.07, o.frequency, t, end);
    const g = gain(v, 0);
    for (const [s, d, a, b, l] of evs) {
      const atk = Math.min(0.02, d * 0.2);
      o.frequency.setValueAtTime(a, s);
      o.frequency.exponentialRampToValueAtTime(b, s + d);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(l, s + atk);
      g.gain.linearRampToValueAtTime(l * 0.7, s + d - atk);
      g.gain.linearRampToValueAtTime(0, s + d);
    }
    o.connect(g);
    g.connect(panner(v, rand(-0.9, 0.9))).connect(sc.amb);
  }

  // Cicadas swelling and fading in the jungle.
  function cicada(sc, t, vel) {
    const v = voice();
    const d = rand(3, 6);
    const n = noise(v, t, t + d + 0.1);
    const bp = filt(v, 'bandpass', rand(4200, 5600), 6);
    const am = gain(v, 0.5);
    lfo(v, rand(38, 55), 0.5, am.gain, t, t + d + 0.1);
    const g = gain(v, 0);
    sus(g.gain, t, vel, d * 0.35, t + d * 0.6, d * 0.38);
    n.connect(bp);
    bp.connect(am);
    am.connect(g);
    g.connect(panner(v, rand(-0.7, 0.7))).connect(sc.amb);
  }

  // Lava crackle bursts.
  function crackle(sc, t, vel) {
    const v = voice();
    const d = rand(0.3, 1.0);
    const rate = rand(0.8, 1.3);
    const s = sample(v, R.crackle, t, t + d + 0.12, rate, rng() * 1.5);
    const hp = filt(v, 'highpass', rand(1000, 2200), -3);
    const g = gain(v, 0);
    sus(g.gain, t, vel, 0.04, t + d, 0.08);
    s.connect(hp);
    hp.connect(g);
    g.connect(panner(v, rand(-0.8, 0.8))).connect(sc.amb);
  }

  // A thick lava bubble popping.
  function bloop(sc, t, vel) {
    const v = voice();
    const f = rand(70, 110);
    const o = osc(v, 'sine', f, t, t + 0.25);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 2.8, t + 0.12);
    const g = gain(v, 0);
    perc(g.gain, t, vel, 0.015, 0.2);
    o.connect(g);
    g.connect(panner(v, rand(-0.6, 0.6))).connect(sc.amb);
  }

  // The mountain grumbling.
  function rumble(sc, t, peak) {
    const v = voice();
    const att = rand(1, 2);
    const dec = rand(2, 3.5);
    const end = t + att + dec + 0.05;
    const n = noise(v, t, end, R.noise2);
    const lp = filt(v, 'lowpass', 60, 3);
    lp.frequency.setValueAtTime(55, t);
    lp.frequency.exponentialRampToValueAtTime(170, t + att);
    lp.frequency.exponentialRampToValueAtTime(60, t + att + dec);
    const g = gain(v, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + att + dec);
    g.gain.linearRampToValueAtTime(0, end);
    n.connect(lp);
    lp.connect(g);
    g.connect(sc.amb);
  }

  // A channel buoy's bell (or a moored boat's) clanging as the swell rocks it: two to four strokes.
  function buoyBell(sc, t, vel) {
    const v = voice();
    const f = rand(560, 700);
    const pn = panner(v, rand(-0.8, 0.8));
    pn.connect(sc.amb);
    let s = t;
    for (let k = 0, n = 2 + Math.floor(rng() * 3); k < n; k++) {
      bell(v, pn, s, f, vel * rand(0.6, 1), 1.8, 2.4, 0.7, 2);
      s += rand(0.5, 1.1);
    }
  }

  // The town's church bell tolling three times, far off across the water.
  function townBell(sc, t, vel) {
    const v = voice();
    const lp = filt(v, 'lowpass', 1400, -3);
    lp.connect(panner(v, rand(-0.4, 0.4))).connect(sc.amb);
    for (let k = 0; k < 3; k++) {
      bell(v, lp, t + k * 1.9, 293.66, vel, 4, 2.0, 0.5, 1.4);
      bell(v, lp, t + k * 1.9, 293.66 * 2.4, vel * 0.35, 2.5, 1.4, 0.3);
    }
  }

  // A ship's bell striking the half hours in pairs: "ding-ding, ding-ding".
  function shipBell(sc, t, vel) {
    const v = voice();
    const pn = panner(v, rand(-0.6, 0.6));
    pn.connect(sc.amb);
    for (let k = 0, n = 1 + Math.floor(rng() * 3); k < n; k++) {
      for (let j = 0; j < 2; j++) bell(v, pn, t + k * 1.1 + j * 0.32, 1250, vel, 1.6, 2.4, 0.6, 1.5);
    }
  }

  // Halyards slapping the masts of the boats in harbour: a few "tinks".
  function halyard(sc, t, vel) {
    const v = voice();
    const pn = panner(v, rand(-0.9, 0.9));
    pn.connect(sc.amb);
    const f = rand(1500, 2300);
    let s = t;
    for (let k = 0, n = 2 + Math.floor(rng() * 4); k < n; k++) {
      bell(v, pn, s, f * rand(0.97, 1.03), vel * rand(0.5, 1), 0.25, 2.9, 0.9);
      s += rand(0.15, 0.6);
    }
  }

  // Wind whistling through the rigging: noise through a resonant band-pass that wanders.
  function windBed(sc, t0, lvl, f, q) {
    const v = sc.av;
    const n = noise(v, t0, null, R.noise2);
    const bp = filt(v, 'bandpass', f, q);
    const g = gain(v, lvl);
    lfo(v, 0.061, f * 0.35, bp.frequency, t0);
    lfo(v, 0.137, f * 0.15, bp.frequency, t0);
    lfo(v, 0.083, lvl * 0.5, g.gain, t0);
    n.connect(bp);
    bp.connect(g);
    g.connect(sc.amb);
  }

  // A gust rising and falling.
  function gust(sc, t, peak, f) {
    const v = voice();
    const att = rand(1, 2.2);
    const dec = rand(1.5, 3);
    const end = t + att + dec + 0.05;
    const n = noise(v, t, end, R.noise2);
    const bp = filt(v, 'bandpass', f, 2.5);
    bp.frequency.setValueAtTime(f * 0.7, t);
    bp.frequency.exponentialRampToValueAtTime(f * rand(1.3, 1.8), t + att);
    bp.frequency.exponentialRampToValueAtTime(f * 0.8, t + att + dec);
    const g = gain(v, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + att + dec);
    g.gain.linearRampToValueAtTime(0, end);
    n.connect(bp);
    bp.connect(g);
    g.connect(panner(v, rand(-0.6, 0.6))).connect(sc.amb);
  }

  // Ice floes grinding against each other with a low groan; sometimes the ice cracks and "sings" (a crack in sheet
  // ice rings as a falling "pew", the highs racing ahead of the lows).
  function iceGroan(sc, t, vel) {
    const v = voice();
    const d = rand(0.8, 1.8);
    const end = t + d + 0.2;
    const f = rand(38, 60);
    const o = osc(v, 'sawtooth', f, t, end);
    o.frequency.linearRampToValueAtTime(f * rand(1.2, 1.6), t + d * 0.5);
    o.frequency.linearRampToValueAtTime(f * rand(0.8, 1.1), t + d);
    lfo(v, rand(9, 16), f * 0.06, o.frequency, t, end);
    const bp = filt(v, 'bandpass', rand(280, 450), 5);
    const g = gain(v, 0);
    sus(g.gain, t, vel, d * 0.3, t + d * 0.7, d * 0.3);
    const pn = panner(v, rand(-0.8, 0.8));
    o.connect(bp);
    bp.connect(g);
    g.connect(pn);
    pn.connect(sc.amb);
    if (rng() < 0.5) {
      const c = t + rand(0.2, d);
      const f0 = rand(2600, 3800);
      const z = osc(v, 'sine', f0, c, c + 0.32);
      z.frequency.exponentialRampToValueAtTime(f0 * 0.12, c + 0.25);
      const zg = gain(v, 0);
      perc(zg.gain, c, vel * 0.8, 0.004, 0.26);
      z.connect(zg);
      zg.connect(pn);
      hiss(v, pn, c, vel * 1.2, 0.1, 'bandpass', 1400, 1.5);
    }
  }

  // Ice shards tinkling together.
  function tinkle(sc, t, vel) {
    const v = voice();
    const pn = panner(v, rand(-0.9, 0.9));
    pn.connect(sc.amb);
    let s = t;
    for (let k = 0, n = 3 + Math.floor(rng() * 4); k < n; k++) {
      bell(v, pn, s, rand(2800, 5200), vel * rand(0.4, 1), rand(0.1, 0.3), 2.9, 0.4);
      s += rand(0.04, 0.2);
    }
  }

  // Rain on the sea: a steady hiss, and drops pattering on the deck (two loops of crackle that never line up).
  function rainBed(sc, t0, lvl) {
    const v = sc.av;
    const n = noise(v, t0, null, R.noise2);
    const hp = filt(v, 'highpass', 1200, -3);
    const lp = filt(v, 'lowpass', 7000, -3);
    const g = gain(v, lvl);
    lfo(v, 0.09, lvl * 0.3, g.gain, t0);
    n.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(sc.amb);
    for (const [rate, pan] of [[1.3, -0.5], [0.83, 0.5]]) {
      const c = sample(v, R.crackle, t0, null, rate, rng() * 2);
      c.loop = true;
      const chp = filt(v, 'highpass', 2500, -3);
      const cg = gain(v, lvl * 0.8);
      c.connect(chp);
      chp.connect(cg);
      cg.connect(panner(v, pan)).connect(sc.amb);
    }
  }

  // The whirlpool: a deep roar, and a hollow swirl circling round you.
  function whirlBed(sc, t0, lvl) {
    const v = sc.av;
    const n = noise(v, t0, null, R.noise2);
    const lp = filt(v, 'lowpass', 220, 2);
    lfo(v, 0.05, 90, lp.frequency, t0);
    const g = gain(v, lvl);
    n.connect(lp);
    lp.connect(g);
    g.connect(sc.amb);
    const m = noise(v, t0, null);
    const bp = filt(v, 'bandpass', 480, 3);
    lfo(v, 0.21, 160, bp.frequency, t0);
    const sg = gain(v, lvl * 0.6);
    const pn = panner(v, 0);
    if (pn.pan) lfo(v, 0.12, 0.8, pn.pan, t0);
    m.connect(bp);
    bp.connect(sg);
    sg.connect(pn);
    pn.connect(sc.amb);
  }

  // Something moaning out in the dark.
  function moan(sc, t, vel) {
    const v = voice();
    const d = rand(1.5, 2.6);
    const end = t + d + 0.1;
    const f = rand(220, 330);
    const o = osc(v, 'sine', f, t, end);
    o.frequency.exponentialRampToValueAtTime(f * rand(1.25, 1.5), t + d * 0.45);
    o.frequency.exponentialRampToValueAtTime(f * rand(0.75, 0.9), t + d);
    lfo(v, 5, f * 0.015, o.frequency, t, end);
    const g = gain(v, 0);
    sus(g.gain, t, vel, d * 0.4, t + d * 0.6, d * 0.35);
    o.connect(g);
    g.connect(panner(v, rand(-0.9, 0.9))).connect(sc.amb);
  }

  // Thunder far off over a storm: no crack, a soft roll in the low mids (small speakers carry it, the deep rumble
  // under it does not) that comes in uneven waves.
  function farThunder(sc, t, vel) {
    rumble(sc, t, vel * 1.5);
    const v = voice();
    const end = t + rand(2.5, 4);
    const n = noise(v, t, end, R.noise2);
    const bp = filt(v, 'bandpass', rand(220, 320), 0.9);
    const g = gain(v, 0);
    let tk = t + 0.3;
    let a = vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, tk);
    while (tk < end - 0.8) {
      const d = rand(0.3, 0.7);
      g.gain.linearRampToValueAtTime(a * rand(0.3, 0.6), tk + d * 0.5);
      a *= rand(0.6, 0.85);
      g.gain.linearRampToValueAtTime(a, tk + d);
      tk += d;
    }
    g.gain.linearRampToValueAtTime(0, end);
    n.connect(bp);
    bp.connect(g);
    g.connect(panner(v, rand(-0.8, 0.8))).connect(sc.amb);
  }

  // Bubbles rising from below.
  function bubbles(sc, t, vel) {
    const v = voice();
    const pn = panner(v, rand(-0.8, 0.8));
    pn.connect(sc.amb);
    bubbleTrain(v, pn, t, rand(0.4, 1.4), vel, rand(250, 450), rand(500, 900), [0.05, 0.15], rng);
  }

  // Something huge groaning far below: a slow buzz through two murky formants.
  function groan(sc, t, vel) {
    const v = voice();
    const d = rand(1.6, 2.6);
    const end = t + d + 0.2;
    const f = rand(55, 75);
    const o = osc(v, 'sawtooth', f, t, end);
    o.frequency.linearRampToValueAtTime(f * rand(1.2, 1.4), t + d * 0.4);
    o.frequency.linearRampToValueAtTime(f * rand(0.75, 0.9), t + d);
    const b1 = filt(v, 'bandpass', rand(280, 360), 4);
    const b2 = filt(v, 'bandpass', rand(600, 750), 6);
    const g = gain(v, 0);
    sus(g.gain, t, vel, d * 0.3, t + d * 0.7, d * 0.3);
    o.connect(b1);
    o.connect(b2);
    b1.connect(g);
    b2.connect(g);
    g.connect(panner(v, rand(-0.6, 0.6))).connect(sc.amb);
  }

  const AMBIENCE = {
    menu(sc, t0) {
      seaBed(sc, t0, 0.05, 520);
      emit(sc, 1, (t) => (wash(sc, t, 0.09, 1100, rand(1.2, 2), rand(2, 3)), rand(4, 8)));
      emit(sc, 3, (t) => (gull(sc, t, 0.02), rand(8, 18)));
      emit(sc, 6, (t) => (creak(sc, t, 0.02), rand(9, 20)));
    },
    dock(sc, t0) {
      // A harbour: small water slapping the piles, more gulls, the moored ship's timbers working.
      seaBed(sc, t0, 0.04, 480);
      emit(sc, 1, (t) => (wash(sc, t, 0.06, 900, rand(0.6, 1.1), rand(1.2, 2)), rand(2.5, 5)));
      emit(sc, 2, (t) => (gull(sc, t, 0.025), rand(5, 11)));
      emit(sc, 3, (t) => (creak(sc, t, 0.025), rand(6, 14)));
    },
    europe(sc, t0) {
      seaBed(sc, t0, 0.07, 620);
      emit(sc, 0.5, (t) => (wash(sc, t, 0.13, 1300, rand(1.2, 2), rand(2, 3)), rand(3, 6)));
      emit(sc, 2, (t) => (gull(sc, t, 0.03), rand(5, 12)));
      emit(sc, 5, (t) => (creak(sc, t, 0.025), rand(8, 18)));
    },
    bali(sc, t0) {
      seaBed(sc, t0, 0.035, 900);
      emit(sc, 0.5, (t) => (wash(sc, t, 0.07, 2200, rand(0.5, 0.8), rand(1.2, 1.8)), rand(2, 4)));
      emit(sc, 1.5, (t) => (bird(sc, t, 0.025), rand(2.5, 7)));
      emit(sc, 4, (t) => (cicada(sc, t, 0.012), rand(12, 25)));
    },
    volcano(sc, t0) {
      seaBed(sc, t0, 0.035, 380);
      // Constant low rumble.
      const v = sc.av;
      const n = noise(v, t0, null, R.noise2);
      const lp = filt(v, 'lowpass', 130, 3);
      const g = gain(v, 0.2);
      lfo(v, 0.09, 0.08, g.gain, t0);
      n.connect(lp);
      lp.connect(g);
      g.connect(sc.amb);
      emit(sc, 1, (t) => (wash(sc, t, 0.07, 800, rand(1.4, 2.2), rand(2.4, 3.4)), rand(5, 9)));
      emit(sc, 3, (t) => (rumble(sc, t, 0.4), rand(7, 15)));
      emit(sc, 0.3, (t) => (crackle(sc, t, 0.17), rand(0.25, 0.9)));
      emit(sc, 2, (t) => (bloop(sc, t, 0.13), rand(2.5, 7)));
    },
    doubloon(sc, t0) {
      // Golden hour off a harbour town: the swell over the sandbars, gulls, the channel buoys' bells, timbers, and
      // now and then the bell tower across the bay.
      seaBed(sc, t0, 0.06, 600);
      emit(sc, 0.5, (t) => (wash(sc, t, 0.11, 1400, rand(1, 1.8), rand(1.8, 2.8)), rand(3, 6)));
      emit(sc, 1.5, (t) => (gull(sc, t, 0.03), rand(4, 10)));
      emit(sc, 4, (t) => (buoyBell(sc, t, 0.012), rand(7, 14)));
      emit(sc, 6, (t) => (creak(sc, t, 0.022), rand(8, 18)));
      emit(sc, 12, (t) => (townBell(sc, t, 0.01), rand(35, 60)));
    },
    frost(sc, t0) {
      // A cold strait at dawn: wind whistling in the rigging, small waves lapping at the ice, floes groaning, shards
      // tinkling.
      seaBed(sc, t0, 0.045, 500);
      windBed(sc, t0, 0.05, 900, 3);
      emit(sc, 1, (t) => (wash(sc, t, 0.06, 900, rand(0.8, 1.4), rand(1.5, 2.4)), rand(3, 6)));
      emit(sc, 3, (t) => (gust(sc, t, 0.12, 700), rand(6, 12)));
      emit(sc, 2, (t) => (iceGroan(sc, t, 0.05), rand(5, 11)));
      emit(sc, 1.2, (t) => (tinkle(sc, t, 0.012), rand(3, 8)));
    },
    maelstrom(sc, t0) {
      // A storm at the end of the world: rain, the whirlpool's roar going round, wind, thunder rolling far off,
      // timbers straining, and now and then something moaning out in the dark.
      seaBed(sc, t0, 0.06, 450);
      rainBed(sc, t0, 0.03);
      whirlBed(sc, t0, 0.12);
      windBed(sc, t0, 0.04, 650, 2);
      emit(sc, 0.5, (t) => (wash(sc, t, 0.12, 1000, rand(1, 1.8), rand(2, 3)), rand(3, 5)));
      emit(sc, 2, (t) => (gust(sc, t, 0.14, 550), rand(4, 9)));
      emit(sc, 5, (t) => (rumble(sc, t, 0.35), rand(9, 18)));
      emit(sc, 4, (t) => (creak(sc, t, 0.03), rand(6, 13)));
      emit(sc, 15, (t) => (moan(sc, t, 0.012), rand(20, 40)));
    },
    town(sc, t0) {
      // Ashore on Sparrow's Floating Island: water slapping the piles, gulls, ships' timbers working, halyards
      // tinking against the masts, a ship's bell.
      seaBed(sc, t0, 0.05, 460);
      emit(sc, 1, (t) => (wash(sc, t, 0.075, 900, rand(0.5, 1), rand(1, 1.8)), rand(2, 4.5)));
      emit(sc, 2, (t) => (gull(sc, t, 0.035), rand(4, 10)));
      emit(sc, 3, (t) => (creak(sc, t, 0.035), rand(5, 12)));
      emit(sc, 1.5, (t) => (halyard(sc, t, 0.015), rand(3, 8)));
      emit(sc, 20, (t) => (shipBell(sc, t, 0.022), rand(40, 70)));
    },
    quiz(sc, t0) {
      // At the Riddle Bell on the lookout tower's raft: the same harbour round you.
      AMBIENCE.town(sc, t0);
    },
    atolls(sc, t0) {
      // A South Seas lagoon at noon: small waves lapping on the sandbars, the palms rustling, tropical birds and
      // gulls, and thunder grumbling now and then from the storm wall to the east (thunder only as sound).
      seaBed(sc, t0, 0.04, 800);
      windBed(sc, t0, 0.012, 2400, 1);
      emit(sc, 0.5, (t) => (wash(sc, t, 0.07, 1900, rand(0.5, 0.9), rand(1.0, 1.6)), rand(2, 4)));
      emit(sc, 1.5, (t) => (bird(sc, t, 0.022), rand(3, 8)));
      emit(sc, 3, (t) => (gull(sc, t, 0.025), rand(7, 15)));
      emit(sc, 8, (t) => (farThunder(sc, t, 0.06), rand(18, 35)));
    },
    cape(sc, t0) {
      // A stormy cape at sunset: a strong wind in the rigging and its gusts, big swells, surf breaking on the
      // cliffs, seabirds, timbers straining, and thunder rolling far out.
      seaBed(sc, t0, 0.07, 520);
      windBed(sc, t0, 0.055, 800, 2.5);
      emit(sc, 0.5, (t) => (wash(sc, t, 0.13, 1300, rand(1, 1.6), rand(2, 3)), rand(3, 5)));
      emit(sc, 2.5, (t) => (wash(sc, t, 0.1, 2200, rand(0.4, 0.7), rand(2.4, 3.4)), rand(6, 11)));
      emit(sc, 2, (t) => (gust(sc, t, 0.15, 650), rand(4, 9)));
      emit(sc, 3, (t) => (gull(sc, t, 0.022), rand(7, 14)));
      emit(sc, 4, (t) => (creak(sc, t, 0.03), rand(6, 12)));
      emit(sc, 12, (t) => (farThunder(sc, t, 0.07), rand(22, 40)));
    },
    deep(sc, t0) {
      // A moonlit night over the deep: a slow swell, bubbles rising, the wrecks' timbers groaning, a glassy
      // shimmer from the jellyfish and a low rumble now and then.
      seaBed(sc, t0, 0.04, 380);
      emit(sc, 1, (t) => (wash(sc, t, 0.05, 700, rand(1.4, 2.2), rand(2.4, 3.4)), rand(5, 9)));
      emit(sc, 2, (t) => (bubbles(sc, t, 0.03), rand(3, 7)));
      emit(sc, 5, (t) => (creak(sc, t, 0.022), rand(8, 16)));
      emit(sc, 3, (t) => (tinkle(sc, t, 0.006), rand(6, 12)));
      emit(sc, 8, (t) => (rumble(sc, t, 0.25), rand(12, 22)));
    },
    kraken(sc, t0) {
      // The Kraken's fight: the deep's night sea, bubbles boiling up all round, and the beast groaning below.
      seaBed(sc, t0, 0.05, 420);
      emit(sc, 1, (t) => (wash(sc, t, 0.07, 900, rand(1, 1.6), rand(2, 3)), rand(3, 6)));
      emit(sc, 0.5, (t) => (bubbles(sc, t, 0.04), rand(1.5, 4)));
      emit(sc, 4, (t) => (groan(sc, t, 0.05), rand(8, 15)));
      emit(sc, 6, (t) => (rumble(sc, t, 0.3), rand(9, 16)));
    },
  };

  return {
    play,
    stopAll,
    setScene,
    pump,
    setRecording,
    setMusicPhase(n) {
      const k = Math.round(Number(n));
      musicPhase = Number.isFinite(k) ? clamp(k, 0, 4) : 0;
      phaseCalls++;
    },
    names: { sfx: Object.keys(SFX), songs: Object.keys(SONGS), ambience: Object.keys(AMBIENCE) },
    hasRecording: (key) => recs.has(key),
    setMaster(on, instant = false) {
      const g = master.gain;
      g.cancelScheduledValues(ctx.currentTime);
      if (instant) g.value = on;
      else g.setTargetAtTime(on, ctx.currentTime, 0.03);
    },
    setMusicVolume(x) {
      const now = ctx.currentTime;
      for (const g of [musicBus, musicVerb]) g.gain.setTargetAtTime(LEVEL.music * x, now, 0.05);
    },
    get scene() {
      return current;
    },
    buses: { sfx: sfxBus, music: musicBus, amb: ambBus, verb: verbOut, musicVerb, comp },
    stats() {
      return {
        nodes: S.nodes,
        peakNodes: S.peak,
        created: S.made,
        voices: live.length,
        sfxVoices: S.sfx,
        scenes: scenes.length,
        scene: current ? current.name : null,
        music: current ? current.music : null,
        musicSeconds: current && current.recSeconds ? current.recSeconds : null,
        ambience: current ? current.ambience : null,
        emitters: current ? current.em.length : 0,
        recordedPlays: S.recPlays,
        recordings: [...recs.keys()],
        musicPhase,
        musicMode: current && current.song && current.song.mode ? current.song.mode : null,
        musicStep: current && current.song ? current.song.dur : null,
        time: ctx.currentTime,
        state: ctx.state,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function createAudio() {
  const win = typeof window !== 'undefined' ? window : null;
  const AC = win && (win.AudioContext || win.webkitAudioContext);
  const doc = typeof document !== 'undefined' ? document : null;
  let ctx = null;
  let eng = null;
  let failed = !AC;
  let unlocked = false;
  let muted = loadMuted();
  let musicVolume = 1;
  let musicPhase = null; // the last setMusicPhase(), handed to the engine when it starts
  let scene = null;
  let offTimer = 0;
  let resumeAt = -1e9; // wall-clock ms of the last resume request
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const shouldRun = () => unlocked && !muted && !(doc && doc.hidden);
  // One-shots are only accepted while the clock runs, or for a moment after we asked it to resume (the
  // click that unlocks audio should still click). Otherwise, e.g. autoplay-blocked or an iOS interruption,
  // sounds would pile up on a frozen clock and all burst out together when it resumes.
  const canPlay = () => shouldRun() && (ctx.state === 'running' || nowMs() - resumeAt < 500);

  // Run the context only while it can be heard; suspend it otherwise to save CPU and battery.
  function sync() {
    if (!ctx) return;
    if (shouldRun()) {
      clearTimeout(offTimer);
      offTimer = 0;
      eng.setMaster(1);
      if (ctx.state !== 'running') {
        resumeAt = nowMs();
        ctx.resume().catch(() => {});
      }
    } else {
      eng.setMaster(0);
      // Not re-armed while pending: key auto-repeat calls unlock() → sync() every ~30 ms.
      if (ctx.state === 'running' && !offTimer) {
        offTimer = setTimeout(() => {
          offTimer = 0;
          if (ctx && !shouldRun() && ctx.state === 'running') ctx.suspend().catch(() => {});
        }, 250);
      }
    }
  }

  function tick() {
    if (ctx && ctx.state === 'running') eng.pump(ctx.currentTime + LOOKAHEAD);
  }

  // Sound must never break the game, so engine errors are caught here. They are logged and
  // counted (see errors()), so a test can still tell that a sound call failed.
  let errorCount = 0;
  let lastError = null;
  const guard = (fn) => {
    try {
      return fn();
    } catch (err) {
      errorCount++;
      lastError = String(err);
      if (win && win.console) console.warn('audio:', err);
      return undefined;
    }
  };

  // ---- recordings: fetched from the start, decoded once there is a context (see RECORDED)
  const recordings = win && win.fetch && audioParam('audio') !== 'synth' ? RECORDINGS : [];
  const recState = new Map(recordings.map((r) => [r.key, 'fetching'])); // → fetched → ready (→ fetched if dropped) | failed
  const decoding = new Set();
  let recent = []; // scenes whose music stays decoded, most recent last
  const isPending = (key) => recState.has(key) && recState.get(key) !== 'failed';
  // A scene's own music and ambience, or the music it borrows (MUSIC_OF).
  const uses = (scene, rec) => rec.kind !== 'sfx' && (rec.name === scene || (rec.kind === 'music' && rec.name === musicOf(scene)));
  const wanted = (rec) => rec.kind === 'sfx' || recent.some((n) => uses(n, rec));

  function recFailed(rec, err) {
    recState.set(rec.key, 'failed');
    if (win && win.console) console.warn(`audio: no recording for ${rec.key} (${rec.file}), using the synthesised sound:`, String(err));
    if (eng) guard(() => eng.setRecording(rec.key, null));
  }

  function fetched(rec) {
    return fetchRecording(rec.file).then(
      () => {
        if (recState.get(rec.key) === 'fetching') recState.set(rec.key, 'fetched');
        if (wanted(rec)) decode(rec);
      },
      (err) => recState.get(rec.key) !== 'failed' && recFailed(rec, err),
    );
  }

  function decode(rec) {
    if (!eng || recState.get(rec.key) !== 'fetched' || decoding.has(rec.key)) return;
    decoding.add(rec.key);
    const e = eng;
    loadRecording(ctx, rec).then(
      (buf) => {
        decoding.delete(rec.key);
        if (!wanted(rec)) return; // the player has moved on twice since: not needed any more
        recState.set(rec.key, 'ready');
        guard(() => e.setRecording(rec.key, buf, rec));
      },
      (err) => {
        decoding.delete(rec.key);
        recFailed(rec, err);
      },
    );
  }

  // A scene starts: decode its music and ambience, drop the decoded music of scenes before the previous one.
  function want(name) {
    if (!name || !recordings.length) return;
    recent = recent.filter((n) => n !== name).concat(name);
    while (recent.length > KEEP_MUSIC) {
      const old = recent.shift();
      for (const rec of recordings) {
        // (still kept when the other scene in `recent` borrows it)
        if (!uses(old, rec) || wanted(rec) || recState.get(rec.key) !== 'ready') continue;
        recState.set(rec.key, 'fetched');
        if (eng) guard(() => eng.setRecording(rec.key, null));
      }
    }
    for (const rec of recordings) if (uses(name, rec)) fetched(rec);
  }

  if (recordings.length) {
    // The title music and the effects first (small, needed soonest), then the other tracks one at a time.
    const first = recordings.filter((r) => r.kind === 'sfx' || r.key === 'music:menu');
    const rest = recordings.filter((r) => !first.includes(r));
    Promise.all(first.map(fetched)).then(() => rest.reduce((p, r) => p.then(() => fetched(r)), Promise.resolve()));
  }

  return {
    unlock() {
      if (failed) return;
      guard(() => {
        if (!ctx) {
          try {
            ctx = new AC({ latencyHint: 'interactive' });
            eng = createEngine(ctx, { pending: isPending });
          } catch (err) {
            failed = true;
            ctx = eng = null;
            throw err;
          }
          eng.setMaster(0, true);
          eng.setMusicVolume(musicVolume);
          if (musicPhase != null) eng.setMusicPhase(musicPhase);
          if (scene) eng.setScene(scene); // fades in (nothing to fade out yet)
          for (const rec of recordings) if (rec.kind === 'sfx') decode(rec);
          want(scene);
          setInterval(tick, TICK_MS);
          if (doc) doc.addEventListener('visibilitychange', () => guard(sync));
          // iOS only opens the output once something has started inside a gesture.
          const b = ctx.createBufferSource();
          b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          b.connect(ctx.destination);
          b.onended = () => b.disconnect();
          b.start(0);
        }
        // Already playing, or muted / hidden (setMuted and visibility handle those): nothing to do.
        if (unlocked && (ctx.state === 'running' || !shouldRun())) return;
        unlocked = true;
        sync();
      });
    },

    play(name, opts = EMPTY) {
      if (!eng || !canPlay()) return NOOP_HANDLE;
      return guard(() => eng.play(name, opts || EMPTY)) || NOOP_HANDLE;
    },

    setScene(name) {
      if (name != null && !SCENE_NAMES.includes(name)) return;
      scene = name || null;
      if (eng) guard(() => eng.setScene(scene, !shouldRun() || ctx.state !== 'running'));
      guard(() => want(scene));
    },

    setMuted(m) {
      muted = !!m;
      saveMuted(muted);
      guard(sync);
    },

    get muted() {
      return muted;
    },

    setMusicVolume(v) {
      musicVolume = clamp(Number(v) || 0, 0, 1);
      if (eng) guard(() => eng.setMusicVolume(musicVolume));
    },

    // Music that follows a fight (only the 'kraken' scene does; the others ignore it): 0 the dread (the drone and a
    // heartbeat), 1 and 2 the Kraken's theme, 3 the theme faster, 4 driven off (a sunrise chord, then quiet). Cheap
    // enough to call every frame with the Kraken's phase; a change lands on the music's next bar line.
    setMusicPhase(n) {
      musicPhase = n;
      if (eng) guard(() => eng.setMusicPhase(n));
    },

    // Optional per-frame top-up of the scheduler (the timer also does it). `dt` is not needed:
    // all timing comes from the audio clock.
    update() {
      if (ctx && ctx.state === 'running') guard(() => eng.pump(ctx.currentTime + LOOKAHEAD));
    },

    // Extras: fade out every one-shot (e.g. bomb whistles when leaving a level), and debug counters.
    stopAll(fade = 0.1) {
      if (eng) guard(() => eng.stopAll(fade));
    },

    stats() {
      return eng ? { ...eng.stats(), files: Object.fromEntries(recState) } : null;
    },

    // Errors caught by guard() so far (they are only logged otherwise).
    errors() {
      return { count: errorCount, last: lastError };
    },
  };
}

// ---------------------------------------------------------------------------
// Test-only helpers (offline rendering for automated checks)
// ---------------------------------------------------------------------------
async function renderOffline({
  seconds = 3,
  sampleRate = 44100,
  sfx = null,
  opts = EMPTY,
  at = 0.02,
  stopAt = null,
  scene = null,
  fade = false,
  then = null,
  music = true,
  ambience = true,
  seed = 7,
  progressive = false,
  events = null, // [{ at, name, opts }]: several one-shots through the same engine (game-like mixes)
  recorded = false, // true: load the files in RECORDED for this render (the scene's music and ambience, the sfx)
  inject = null, // { key: { channels: [Float32Array, ...], sampleRate, gain, duck } }: stand-in recordings
  musicOffset = 0, // seconds into the recorded music to start at
  linear = false, // bypass the master compressor (level measurements)
  sfxOff = false, // mute the effects (fanfares still duck the music)
  late = null, // { key: seconds }: injected recordings that only arrive at that time (mid-scene takeovers)
  phases = null, // [{ at, phase }]: setMusicPhase(phase) at that time (the Kraken's music following the fight)
  phase = null, // setMusicPhase(phase) before the scene starts
} = {}) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const eng = createEngine(ctx, { seed, musicOffset });
  if (recorded) {
    const keys = [`music:${musicOf(scene)}`, `amb:${scene}`, `sfx:${sfx}`, ...(events || []).map((e) => `sfx:${e.name}`)];
    if (then) keys.push(`music:${musicOf(then.scene)}`, `amb:${then.scene}`);
    for (const rec of RECORDINGS) {
      if (keys.includes(rec.key)) eng.setRecording(rec.key, await loadRecording(ctx, rec), rec);
    }
  }
  for (const [key, r] of Object.entries(inject || EMPTY)) {
    const buf = ctx.createBuffer(r.channels.length, r.channels[0].length, r.sampleRate || sampleRate);
    r.channels.forEach((d, c) => buf.getChannelData(c).set(d));
    const at = late && late[key];
    if (at == null) eng.setRecording(key, buf, r);
    else {
      ctx.suspend(Math.round(at * 128) / 128).then(() => {
        eng.setRecording(key, buf, r);
        ctx.resume();
      });
    }
  }
  if (linear) {
    eng.buses.comp.ratio.value = 1;
    eng.buses.comp.threshold.value = 0;
  }
  if (!music) {
    eng.buses.music.gain.value = 0;
    eng.buses.musicVerb.gain.value = 0;
  }
  if (!ambience) eng.buses.amb.gain.value = 0;
  if (sfxOff) eng.buses.sfx.gain.value = 0;
  if (phase != null) eng.setMusicPhase(phase);
  for (const p of phases || []) {
    // (a render quantum off the progressive scheduler's 0.25 s grid: one suspend per frame)
    const k = Math.round(p.at * 128);
    ctx.suspend((k % 32 ? k : k + 1) / 128).then(() => {
      eng.setMusicPhase(p.phase);
      eng.pump(ctx.currentTime + LOOKAHEAD);
      ctx.resume();
    });
  }
  let handle = null;
  if (scene) eng.setScene(scene, !fade);
  const sc = eng.scene;
  const loop = sc && sc.song ? { start: sc.st0, stepDur: sc.song.dur, steps: sc.song.len } : null;
  if (sfx) handle = eng.play(sfx, opts, at);
  let peakSfx = 0;
  if (events) {
    // Fire each event from a suspend point, like the game would (caps and throttles see real time).
    const byTime = new Map();
    for (const e of events) {
      const k = Math.round(e.at * 128) / 128; // suspend() needs render-quantum aligned times
      if (!byTime.has(k)) byTime.set(k, []);
      byTime.get(k).push(e);
    }
    for (const [k, list] of byTime) {
      ctx.suspend(k).then(() => {
        for (const e of list) eng.play(e.name, e.opts || EMPTY);
        peakSfx = Math.max(peakSfx, eng.stats().sfxVoices);
        eng.pump(ctx.currentTime + LOOKAHEAD);
        ctx.resume();
      });
    }
  }
  if (stopAt != null && handle) {
    ctx.suspend(stopAt).then(() => {
      handle.stop();
      ctx.resume();
    });
  }
  if (then) {
    ctx.suspend(then.at).then(() => {
      eng.setScene(then.scene);
      eng.pump(seconds + 1);
      ctx.resume();
    });
  }
  const t0 = performance.now();
  const trace = [];
  if (progressive) {
    // Mirror the real-time scheduler: wake every 0.25 s, top up the lookahead window, sweep finished voices.
    eng.pump(LOOKAHEAD);
    for (let k = 1; k * 0.25 < seconds - 0.25; k++) {
      ctx.suspend(k * 0.25).then(() => {
        eng.pump(ctx.currentTime + LOOKAHEAD);
        const st = eng.stats();
        trace.push([+ctx.currentTime.toFixed(2), st.nodes, st.voices]);
        ctx.resume();
      });
    }
  } else eng.pump(seconds + 1);
  const statsBefore = eng.stats();
  const t1 = performance.now();
  const buf = await ctx.startRendering();
  return {
    sampleRate,
    channels: [buf.getChannelData(0), buf.getChannelData(1)],
    loop,
    stats: statsBefore,
    statsAfter: eng.stats(),
    peakSfx,
    trace,
    buildMs: t1 - t0,
    renderMs: performance.now() - t1,
  };
}

function validateScores() {
  return [
    ...parseScore(MENU.melody, MENU.bar).errors.map((e) => `menu ${e}`),
    ...parseScore(EUROPE.melody, EUROPE.bar).errors.map((e) => `europe ${e}`),
    ...parseScore(VOLCANO.lead, VOLCANO.bar).errors.map((e) => `volcano ${e}`),
    ...(parseChords(MENU.chords).length !== 32 ? ['menu chords'] : []),
    ...(parseChords(EUROPE.chords).length !== 24 ? ['europe chords'] : []),
    ...(parseChords(VOLCANO.chords).length !== 16 ? ['volcano chords'] : []),
    ...parseScore(DOUBLOON.melody, DOUBLOON.bar).errors.map((e) => `doubloon ${e}`),
    ...parseScore(FROST.melody, FROST.bar).errors.map((e) => `frost ${e}`),
    ...parseScore(MAELSTROM.melody, MAELSTROM.bar).errors.map((e) => `maelstrom ${e}`),
    ...(parseChords(DOUBLOON.chords).length !== parseScore(DOUBLOON.melody, DOUBLOON.bar).bars ? ['doubloon chords'] : []),
    ...(parseChords(FROST.chords).length !== parseScore(FROST.melody, FROST.bar).bars ? ['frost chords'] : []),
    ...(parseChords(MAELSTROM.chords).length !== parseScore(MAELSTROM.melody, MAELSTROM.bar).bars ? ['maelstrom chords'] : []),
    ...[DOUBLOON, FROST, MAELSTROM].flatMap((x) => parseChords(x.chords).flat().filter((c) => !CHORD[c]).map((c) => `unknown chord ${c}`)),
    ...Object.values(VOLCANO.drums).filter((p) => p.length !== 16).map((p) => `drum pattern ${p}`),
    // The Kraken Seas: each score's bars add up, each has a chord per bar, and every chord is known.
    ...[['atolls', ATOLLS, 'melody'], ['cape', CAPE, 'melody'], ['deep', DEEP, 'melody'], ['kraken', KRAKEN_TUNE, 'melody'], ['kraken tuba', KRAKEN_TUNE, 'tuba']]
      .flatMap(([name, x, part]) => {
        const sc = parseScore(x[part], x.bar);
        const n = parseChords(x.chords).length;
        return [...sc.errors.map((e) => `${name} ${e}`), ...(n !== sc.bars ? [`${name}: ${n} chords for ${sc.bars} bars`] : [])];
      }),
    ...[ATOLLS, CAPE, DEEP, KRAKEN_TUNE].flatMap((x) => parseChords(x.chords).flat().filter((c) => !CHORD[c]).map((c) => `unknown chord ${c}`)),
  ];
}

// Every sound and scene is wired up: a sound in SFX_NAMES has its synthesis, a level trim and (unless it is a
// fanfare) a voice cap, and nothing is synthesised that is not listed; a scene has music, ambience and trims.
function validateTables() {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const eng = createEngine(new OAC(2, 128, 44100), { seed: 1 });
  const errors = [];
  for (const n of SFX_NAMES) {
    if (!eng.names.sfx.includes(n)) errors.push(`no synthesis for the sound ${n}`);
    if (!(SFX_GAIN[n] > 0)) errors.push(`no SFX_GAIN for ${n}`);
    if (!(n in STINGER) && !(SFX_CAP[n] >= 1)) errors.push(`no SFX_CAP for ${n}`);
  }
  for (const n of eng.names.sfx) if (!SFX_NAMES.includes(n)) errors.push(`the sound ${n} is not in SFX_NAMES`);
  for (const n of SCENE_NAMES) {
    if (!eng.names.songs.includes(n)) errors.push(`no music for the scene ${n}`);
    if (!eng.names.ambience.includes(n)) errors.push(`no ambience for the scene ${n}`);
    if (!(SCENE_GAIN[n] && SCENE_GAIN[n].music > 0 && SCENE_GAIN[n].amb > 0)) errors.push(`no SCENE_GAIN for ${n}`);
  }
  for (const n of Object.keys(LOOPS)) if (!SFX_NAMES.includes(n)) errors.push(`the loop ${n} is not a sound`);
  return errors;
}

export const __audioTest = { renderOffline, validateScores, validateTables, distGain, distCutoff, fitLength, loadRecording, RECORDINGS };
