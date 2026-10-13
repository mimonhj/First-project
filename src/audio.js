// Sound for Pirates Ahoy!: sound effects, ambience beds and music, played with the Web Audio API.
// Recorded tracks (made with ElevenLabs, see RECORDED and tools/audio/) are used where there is one; everything
// else, and anything whose file has not arrived, is synthesised live (no libraries).
//
//   const audio = createAudio();
//   addEventListener('pointerdown', () => audio.unlock()); // sound may only start after a user gesture
//   audio.setScene('europe');                               // crossfades music + ambience
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
// Fanfares (levelClear / victory / defeat) duck the music while they play; stingers never stack.
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
const SFX_CAP = { cannon: 10, splash: 8, hit: 8, coin: 6, bombWhistle: 6, bombBoom: 4, sink: 4, reef: 2, sailUp: 2, sailDown: 2, click: 4 };
// Stingers: one at a time (a new one replaces the old); the fanfares also duck the music while they play.
const STINGER = { wave: 0, levelClear: 2.4, victory: 6.9, defeat: 3.6 };
const LEVEL = { sfx: 0.85, music: 0.5, amb: 0.75, verb: 0.9 };
// Per-sound and per-scene trims, balanced with K-weighted loudness measurements of offline renders.
const SFX_GAIN = {
  cannon: 1.8, splash: 1.4, hit: 2.1, sink: 1.4, coin: 1.3, bombWhistle: 0.4, bombBoom: 1.2, wave: 0.47,
  levelClear: 0.45, victory: 0.52, defeat: 0.42, click: 4, reef: 1.4, sailUp: 1.4, sailDown: 1.8,
};
const SCENE_GAIN = {
  menu: { music: 0.95, amb: 1.3 },
  dock: { music: 0.95, amb: 1.3 },
  europe: { music: 1.5, amb: 1 },
  bali: { music: 1.3, amb: 1.3 },
  volcano: { music: 0.6, amb: 0.75 },
};

export const SFX_NAMES = [
  'cannon', 'splash', 'hit', 'sink', 'coin', 'bombWhistle', 'bombBoom', 'wave',
  'levelClear', 'victory', 'defeat', 'click', 'reef', 'sailUp', 'sailDown',
];
export const SCENE_NAMES = ['menu', 'dock', 'europe', 'bali', 'volcano'];

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
    if (type === 'reed') o.setPeriodicWave(R.reed);
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
    if (vol < 0.002) return NOOP_HANDLE;
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

  // sc.music says what the scene's music is: 'rec' (a recording), 'synth' (the sequenced tune), or 'wait'
  // (silent until its recording arrives, at most until sc.waitUntil).
  function makeScene(name, t0, instant) {
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
    const music = recs.get(`music:${name}`);
    if (music) startRecordedMusic(sc, music, t0, false);
    else if (pending(`music:${name}`)) {
      sc.music = 'wait';
      sc.waitUntil = t0 + MUSIC_WAIT;
    } else startSynth(sc, t0);
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
  function startSynth(sc, t) {
    sc.music = 'synth';
    sc.st0 = t;
    sc.i = 0;
    sc.sv = longVoice(sc);
    sc.song = SONGS[sc.name](sc);
  }

  // A recording on a loop. `fade`: swell in (it is replacing silence or the synthesised tune mid-scene).
  function startRecordedMusic(sc, rec, t, fade) {
    sc.music = 'rec';
    sc.recSeconds = rec.buffer.duration;
    const s = sample(sc.cv, rec.buffer, t, null, 1, musicOffset % rec.buffer.duration);
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
      if (sc && sc.music === 'wait' && key === `music:${sc.name}` && sc.stopAt === Infinity) startSynth(sc, ctx.currentTime + 0.05);
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
    if (key !== `music:${sc.name}` || sc.music === 'rec') return;
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

  function setScene(name, instant = false) {
    if (name != null && !SONGS[name]) return;
    // Without a recording of its own the shipyard keeps the title screen's scene (the jig plays on, no restart).
    if (name === 'dock' && !recs.has('music:dock') && !pending('music:dock')) name = 'menu';
    if ((current ? current.name : null) === name) return;
    const now = ctx.currentTime;
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
    current = name ? makeScene(name, now + 0.05, instant) : null;
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
  };

  return {
    play,
    stopAll,
    setScene,
    pump,
    setRecording,
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
  const wanted = (rec) => rec.kind === 'sfx' || recent.includes(rec.name);

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
        if (rec.name !== old || rec.kind === 'sfx' || recState.get(rec.key) !== 'ready') continue;
        recState.set(rec.key, 'fetched');
        if (eng) guard(() => eng.setRecording(rec.key, null));
      }
    }
    for (const rec of recordings) if (rec.name === name && rec.kind !== 'sfx') fetched(rec);
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
} = {}) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const eng = createEngine(ctx, { seed, musicOffset });
  if (recorded) {
    const keys = [`music:${scene}`, `amb:${scene}`, `sfx:${sfx}`, ...(events || []).map((e) => `sfx:${e.name}`)];
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
    ...Object.values(VOLCANO.drums).filter((p) => p.length !== 16).map((p) => `drum pattern ${p}`),
  ];
}

export const __audioTest = { renderOffline, validateScores, distGain, distCutoff, fitLength, loadRecording, RECORDINGS };
