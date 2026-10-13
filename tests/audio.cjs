// Recorded audio (assets/audio/, listed in RECORDED in src/audio.js): the files, the loops, the levels, and how
// the game falls back to the synthesised sound. Runs in headless Chromium with Playwright, like the other suites.
//
//   node tests/audio.cjs              run the checks
//   node tests/audio.cjs --calibrate  print the RECORDED gains that make each recording as loud as the synthesised
//                                     sound it replaces (paste them into src/audio.js)
const { chromium } = require('playwright');
const path = require('path');
const { serve } = require('./server.cjs');

const ROOT = path.join(__dirname, '..');
const CALIBRATE = process.argv.includes('--calibrate');
const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const LEVEL_TOLERANCE = 1; // LU: how far a recording's loudness may stray from the synthesised version's

let failures = 0;
function check(ok, msg) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Page-side helpers: integrated loudness (ITU-R BS.1770 / EBU R128: K-weighting, 400 ms blocks with 75% overlap,
// absolute gate at -70 LUFS and relative gate at -10 LU), and sample-step statistics for click detection.
function pageHelpers() {
  function biquad(x, b0, b1, b2, a1, a2) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  function kWeight(x, fs) {
    let K = Math.tan((Math.PI * 1681.974450955533) / fs);
    const Vh = Math.pow(10, 3.999843853973347 / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    let Q = 0.7071752369554196;
    let a0 = 1 + K / Q + K * K;
    const s1 = biquad(x, (Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
    K = Math.tan((Math.PI * 38.13547087602444) / fs);
    Q = 0.5003270373238773;
    a0 = 1 + K / Q + K * K;
    return biquad(s1, 1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  }
  window.__lufs = (channels, fs, from = 0, to = Infinity) => {
    const a = Math.floor(from * fs);
    const b = Math.min(channels[0].length, Math.floor(to * fs));
    const w = channels.map((c) => kWeight(c.subarray(a, b), fs));
    const block = Math.round(0.4 * fs);
    const hop = Math.round(0.1 * fs);
    const z = [];
    for (let s = 0; s + block <= b - a; s += hop) {
      let sum = 0;
      for (const c of w) {
        let m = 0;
        for (let i = s; i < s + block; i++) m += c[i] * c[i];
        sum += m / block;
      }
      z.push(sum);
    }
    const L = (v) => -0.691 + 10 * Math.log10(v);
    const abs = z.filter((v) => L(v) > -70);
    if (!abs.length) return -Infinity;
    const rel = L(abs.reduce((p, v) => p + v, 0) / abs.length) - 10;
    const gated = abs.filter((v) => L(v) > rel);
    return L(gated.reduce((p, v) => p + v, 0) / gated.length);
  };
  // Click detector. A click is one sample-to-sample step far bigger than the steps just around it; the attack of a
  // drum or a bow (which a loop point may well fall on) builds over many samples. Returns the largest step at
  // sample `at` (+-2) against the largest within 1 ms either side of it.
  window.__click = (channels, fs, at) => {
    const near = Math.round(0.001 * fs);
    let seam = 0;
    let around = 0;
    for (const c of channels) {
      for (let i = at - near; i <= at + near; i++) {
        const d = Math.abs(c[i] - c[i - 1]);
        if (Math.abs(i - at) <= 2) seam = Math.max(seam, d);
        else around = Math.max(around, d);
      }
    }
    return { seam, around, ratio: seam / Math.max(around, 1e-6) };
  };
  window.__rms = (channels, fs, from, to) => {
    let s = 0, n = 0;
    for (const c of channels) for (let i = Math.floor(from * fs); i < Math.min(c.length, to * fs); i++) { s += c[i] * c[i]; n++; }
    return 20 * Math.log10(Math.sqrt(s / Math.max(1, n)) + 1e-12);
  };
}

async function openGame(browser, url, setup) {
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  const warnings = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'warning' && /^audio:/.test(m.text())) warnings.push(m.text());
    if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  const requests = [];
  page.on('request', (r) => /\/assets\/audio\//.test(r.url()) && requests.push(r.url().split('/').pop()));
  if (setup) await setup(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.env, null, { timeout: 120000 });
  await page.keyboard.press('Shift'); // a user gesture: unlocks the audio
  return { page, warnings, errors, requests };
}

const stats = (page) => page.evaluate(() => window.__game.audio.stats());
async function until(page, fn, arg, seconds = 20) {
  for (let i = 0; i < seconds * 10; i++) {
    if (await page.evaluate(fn, arg)) return true;
    await sleep(100);
  }
  return false;
}

// Levels: each recording against the synthesised version it replaces, through the same mix with the master
// compressor bypassed. Music over a whole loop of the synthesised tune (up to 50 s), fanfares over their length.
async function measureLevels(page) {
  return page.evaluate(async () => {
    const { __audioTest: T, RECORDED } = await import('/src/audio.js');
    const out = [];
    for (const [scene, r] of Object.entries(RECORDED.music)) {
      const synth = await T.renderOffline({ scene, seconds: 52, ambience: false, linear: true, sampleRate: 48000 });
      const rec = await T.renderOffline({ scene, seconds: 52, ambience: false, linear: true, sampleRate: 48000, recorded: true });
      out.push({
        key: `music:${scene}`,
        gain: r.gain,
        synth: window.__lufs(synth.channels, 48000, 3),
        rec: window.__lufs(rec.channels, 48000, 3),
        used: rec.statsAfter.music,
      });
    }
    for (const [name, r] of Object.entries(RECORDED.sfx)) {
      const opts = { sfx: name, seconds: 8, music: false, ambience: false, linear: true, sampleRate: 48000 };
      const synth = await T.renderOffline(opts);
      const rec = await T.renderOffline({ ...opts, recorded: true });
      out.push({
        key: `sfx:${name}`,
        gain: r.gain,
        synth: window.__lufs(synth.channels, 48000),
        rec: window.__lufs(rec.channels, 48000),
        used: rec.statsAfter.recordedPlays === 1 && synth.statsAfter.recordedPlays === 0 ? 'rec' : 'synth',
      });
    }
    return out;
  });
}

(async () => {
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  try {
    // ---- Offline checks on a page of the site (no game: the module is imported directly).
    const page = await browser.newPage();
    await page.goto(base + 'package.json');
    await page.evaluate(pageHelpers);

    if (CALIBRATE) {
      const levels = await measureLevels(page);
      for (const l of levels) {
        const gain = l.gain * Math.pow(10, (l.synth - l.rec) / 20);
        console.log(`${l.key}: synthesised ${l.synth.toFixed(2)} LUFS, recorded ${l.rec.toFixed(2)} LUFS at gain ${l.gain} -> gain ${gain.toFixed(3)}`);
      }
      return;
    }

    // The files: served, decodable, stereo, finite, not silent, not clipping.
    const files = await page.evaluate(async () => {
      const { __audioTest: T } = await import('/src/audio.js');
      const ctx = new OfflineAudioContext(2, 48000, 48000);
      const out = [];
      for (const rec of T.RECORDINGS) {
        const res = await fetch(`/assets/audio/${rec.file}`);
        const r = { key: rec.key, status: res.status, type: res.headers.get('content-type') };
        try {
          const raw = await ctx.decodeAudioData(await res.arrayBuffer());
          const buf = rec.frames ? T.fitLength(ctx, raw, rec.frames) : raw;
          let peak = 0, finite = true;
          for (let c = 0; c < buf.numberOfChannels; c++) {
            for (const v of buf.getChannelData(c)) { if (!Number.isFinite(v)) finite = false; else if (Math.abs(v) > peak) peak = Math.abs(v); }
          }
          Object.assign(r, { seconds: +buf.duration.toFixed(3), channels: buf.numberOfChannels, peak: +peak.toFixed(3), finite, decoded: raw.length, frames: rec.frames });
          if (rec.kind !== 'sfx') {
            // Seam: the last 50 ms followed by the first 50 ms, as the loop plays them.
            const n = 2400;
            const wrapped = [];
            for (let c = 0; c < buf.numberOfChannels; c++) {
              const d = buf.getChannelData(c);
              const w = new Float32Array(2 * n);
              w.set(d.subarray(d.length - n), 0);
              w.set(d.subarray(0, n), n);
              wrapped.push(w);
            }
            r.seam = window.__click(wrapped, buf.sampleRate, n);
          }
        } catch (e) {
          r.error = String(e);
        }
        out.push(r);
      }
      return out;
    });
    check(files.length >= 5, `there are recordings (${files.map((f) => f.key).join(', ')})`);
    for (const f of files) {
      check(f.status === 200 && f.type === 'audio/mpeg' && !f.error, `${f.key}: served as audio/mpeg and decodes (${f.status} ${f.type}${f.error ? ` ${f.error}` : ''})`);
      if (f.error) continue;
      check(f.channels === 2 && f.finite && f.peak > 0.1 && f.peak < 0.99, `${f.key}: stereo, finite, not silent and not clipping (${f.seconds} s, peak ${f.peak})`);
      if (f.seam) {
        check(f.decoded === f.frames, `${f.key}: decodes to exactly the length listed in RECORDED (${f.decoded} of ${f.frames} samples)`);
        check(f.seam.ratio <= 3, `${f.key}: the loop's end runs into its start without a click (step ${f.seam.seam.toFixed(4)} at the seam vs ${f.seam.around.toFixed(4)} around it)`);
      }
    }

    // Decoder padding: a decoder that ignores the encoder's gapless info returns the priming (1105 samples of
    // low-level pre-echo, not silence) and end padding. fitLength must give back exactly the music, also from a
    // 44.1 kHz context (decodes are resampled) and when only one end is padded.
    const fit = await page.evaluate(async () => {
      const { __audioTest: T } = await import('/src/audio.js');
      const out = {};
      for (const sr of [48000, 44100]) {
        const ctx = new OfflineAudioContext(2, sr, sr);
        const frames = 96000; // at 48 kHz
        const n = Math.round((frames * sr) / 48000);
        const prime = Math.round((1105 * sr) / 48000);
        const music = [0, 1].map((c) => Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin(i * 0.05 + 0.2 + c) + 0.1 * Math.sin(i * 0.31)));
        const junk = (len, seed) => Float32Array.from({ length: len }, (_, i) => 0.004 * Math.sin(i * 1.7 + seed));
        const make = (lead, tail) => {
          const b = ctx.createBuffer(2, lead + n + tail, sr);
          for (let c = 0; c < 2; c++) {
            const d = b.getChannelData(c);
            d.set(junk(lead, c), 0);
            d.set(music[c], lead);
            d.set(junk(tail, c + 5), lead + n);
          }
          return b;
        };
        const exact = (b) => b.length === n && [0, 1].every((c) => b.getChannelData(c).every((v, i) => v === music[c][i]));
        const plain = make(0, 0);
        out[sr] = {
          both: exact(T.fitLength(ctx, make(prime, 900), frames)),
          endOnly: exact(T.fitLength(ctx, make(0, 864), frames)),
          startOnly: exact(T.fitLength(ctx, make(prime, 0), frames)),
          untouched: T.fitLength(ctx, plain, frames) === plain,
        };
      }
      return out;
    });
    check(Object.values(fit).every((r) => r.both && r.endOnly && r.startOnly && r.untouched), `decoder padding is cut to the exact music: both ends, the end only or the start only padded, at 48 and 44.1 kHz; an exact decode is left alone (${JSON.stringify(fit)})`);

    // Levels: each recording plays at the loudness of the synthesised sound it replaces.
    const levels = await measureLevels(page);
    for (const l of levels) {
      const d = l.rec - l.synth;
      check(Math.abs(d) <= LEVEL_TOLERANCE && l.used === 'rec', `${l.key}: recording ${l.rec.toFixed(1)} LUFS vs synthesised ${l.synth.toFixed(1)} LUFS (${d >= 0 ? '+' : ''}${d.toFixed(1)} LU; played: ${l.used})`);
    }

    // The engine's loop: start a second before the end of each recorded track and listen across the seam.
    const seams = await page.evaluate(async () => {
      const { __audioTest: T, RECORDED } = await import('/src/audio.js');
      const sr = 48000;
      const out = {};
      // Regression first: the detector must single out a real click. A stand-in loop of a tone whose cycles do not
      // fit the loop, so its end jumps back to a different phase at the start. The scene starts 0.05 s in (not
      // faded in here) and the mix adds a little latency (the master compressor looks ahead), measured here from
      // the tone's first sample, so a seam 1 s into the music passes at sample 50400 + lat.
      const tone = [0, 1].map(() => Float32Array.from({ length: 2 * sr }, (_, i) => 0.25 * Math.sin((2 * Math.PI * 221.3 * i) / sr)));
      const b = await T.renderOffline({ scene: 'menu', seconds: 3, ambience: false, sampleRate: sr, musicOffset: 1, inject: { 'music:menu': { channels: tone, sampleRate: sr, gain: 1 } } });
      const lat = b.channels[0].findIndex((v) => Math.abs(v) > 1e-4) - 2400;
      out.broken = { lat, ...window.__click(b.channels, sr, 50400 + lat) };
      for (const scene of Object.keys(RECORDED.music)) {
        const probe = await T.renderOffline({ scene, seconds: 0.1, ambience: false, recorded: true, sampleRate: sr });
        const len = probe.statsAfter.musicSeconds;
        const r = await T.renderOffline({ scene, seconds: 3, ambience: false, recorded: true, sampleRate: sr, musicOffset: len - 1 });
        out[scene] = { len, steps: window.__click(r.channels, sr, 50400 + lat), before: window.__rms(r.channels, sr, 0.5, 1.0), at: window.__rms(r.channels, sr, 1.0, 1.1), after: window.__rms(r.channels, sr, 1.1, 1.6) };
      }
      return out;
    });
    const broken = seams.broken;
    delete seams.broken;
    check(broken.lat >= 0 && broken.lat < 1000 && broken.ratio > 5, `regression: a loop that clicks is caught by the seam check (step ${broken.seam.toFixed(3)} at the seam vs ${broken.around.toFixed(3)} around it; mix latency ${broken.lat} samples)`);
    for (const [scene, s] of Object.entries(seams)) {
      check(s.len > 30 && s.steps.ratio <= 3 && s.at > Math.min(s.before, s.after) - 6, `${scene}: the recorded music loops without a click or a gap (${s.len.toFixed(1)} s loop; step ${s.steps.seam.toFixed(4)} at the seam vs ${s.steps.around.toFixed(4)} around it; ${s.before.toFixed(1)} / ${s.at.toFixed(1)} / ${s.after.toFixed(1)} dB before / at / after)`);
    }

    // Fanfares duck the music while they play, then let it back up.
    const duck = await page.evaluate(async () => {
      const { __audioTest: T, RECORDED } = await import('/src/audio.js');
      const hold = RECORDED.sfx.levelClear.duck;
      const opts = { scene: 'menu', seconds: hold + 4, ambience: false, recorded: true, sampleRate: 48000, events: [{ at: 1, name: 'levelClear' }] };
      const r = await T.renderOffline({ ...opts, sfxOff: true });
      return {
        hold,
        before: window.__rms(r.channels, 48000, 0.3, 0.9),
        during: window.__rms(r.channels, 48000, 1.5, 1 + hold - 0.2),
        end: window.__rms(r.channels, 48000, 1 + hold - 0.4, 1 + hold - 0.1),
        after: window.__rms(r.channels, 48000, 1 + hold + 2.5, hold + 4),
      };
    });
    check(duck.during < duck.before - 6 && duck.end < duck.before - 6 && duck.after > duck.before - 2, `the recorded level-clear fanfare ducks the recorded music for ${duck.hold} s and lets it back (${duck.before.toFixed(1)} -> ${duck.during.toFixed(1)}, ${duck.end.toFixed(1)} just before the end -> ${duck.after.toFixed(1)} dB)`);

    // Stand-in recordings for sounds that have none yet: a bomb whistle fitted to the flight, an ambience bed.
    const stand = await page.evaluate(async () => {
      const { __audioTest: T } = await import('/src/audio.js');
      const sr = 48000;
      const tone = (sec, f) => [0, 1].map(() => Float32Array.from({ length: sec * sr }, (_, i) => 0.3 * Math.sin((2 * Math.PI * f * i) / sr)));
      const whistle = { channels: tone(2.5, 900), sampleRate: sr, gain: 1 };
      const fit = async (duration) => {
        const r = await T.renderOffline({ sfx: 'bombWhistle', opts: { duration }, at: 0.5, seconds: 5, music: false, ambience: false, sampleRate: sr, inject: { 'sfx:bombWhistle': whistle } });
        const env = [];
        for (let t = 0; t < 5; t += 0.05) env.push(window.__rms(r.channels, sr, t, t + 0.05));
        const loud = env.map((v, i) => [i * 0.05, v]).filter(([, v]) => v > -50);
        return { first: +loud[0][0].toFixed(2), last: +(loud[loud.length - 1][0] + 0.05).toFixed(2) };
      };
      const amb = await T.renderOffline({ scene: 'bali', seconds: 2, music: false, sampleRate: sr, inject: { 'amb:bali': { channels: tone(3, 300), sampleRate: sr, gain: 1 } } });
      // Arriving 2 s into a scene that started synthesised: how much of the output is the stand-in tone (power at
      // its frequency against all of the power), well before the arrival and once the crossfade is over. 339 Hz
      // falls between E4 and F4, a note the synthesised tunes never play.
      const share = (r, f, a, b) => {
        let re = 0, im = 0, all = 0;
        const d = r.channels[0];
        for (let i = Math.floor(a * sr); i < b * sr; i++) {
          re += d[i] * Math.cos((2 * Math.PI * f * i) / sr);
          im += d[i] * Math.sin((2 * Math.PI * f * i) / sr);
          all += d[i] * d[i];
        }
        const n = (b - a) * sr;
        return (2 * (re * re + im * im)) / n / Math.max(all, 1e-12);
      };
      const lateMusic = await T.renderOffline({ scene: 'europe', seconds: 6, ambience: false, sampleRate: sr, inject: { 'music:europe': { channels: tone(4, 339), sampleRate: sr, gain: 1 } }, late: { 'music:europe': 2 } });
      const lateAmb = await T.renderOffline({ scene: 'volcano', seconds: 6, music: false, sampleRate: sr, inject: { 'amb:volcano': { channels: tone(4, 339), sampleRate: sr, gain: 1 } }, late: { 'amb:volcano': 2 } });
      return {
        short: await fit(1.0),
        long: await fit(3.5),
        amb: { level: window.__rms(amb.channels, sr, 1, 2), emitters: amb.statsAfter.emitters },
        lateMusic: { before: +share(lateMusic, 339, 0.8, 1.8).toFixed(3), after: +share(lateMusic, 339, 4.5, 5.9).toFixed(3), music: lateMusic.statsAfter.music },
        lateAmb: { before: +share(lateAmb, 339, 0.8, 1.8).toFixed(3), after: +share(lateAmb, 339, 4.5, 5.9).toFixed(3), ambience: lateAmb.statsAfter.ambience, emitters: lateAmb.statsAfter.emitters },
      };
    });
    check(stand.short.first <= 0.55 && Math.abs(stand.short.last - 1.5) <= 0.1, `a recorded bomb whistle for a 1 s flight starts at once and ends on the impact (${JSON.stringify(stand.short)})`);
    check(Math.abs(stand.long.last - 4.0) <= 0.1 && stand.long.first > 0.6, `a recorded bomb whistle for a 3.5 s flight starts a little late and ends on the impact (${JSON.stringify(stand.long)})`);
    check(stand.amb.level > -40 && stand.amb.emitters === 0, `a recorded ambience bed replaces the synthesised one (${JSON.stringify(stand.amb)})`);
    check(stand.lateMusic.before < 0.05 && stand.lateMusic.after > 0.95 && stand.lateMusic.music === 'rec', `recorded music arriving mid-scene takes over from the synthesised tune, which fades out completely (share of the output: ${stand.lateMusic.before} before, ${stand.lateMusic.after} after)`);
    check(stand.lateAmb.before < 0.05 && stand.lateAmb.after > 0.95 && stand.lateAmb.ambience === 'rec' && stand.lateAmb.emitters === 0, `a recorded ambience bed arriving mid-scene takes over from the synthesised beds and events (share of the output: ${stand.lateAmb.before} before, ${stand.lateAmb.after} after; ${stand.lateAmb.emitters} emitters left)`);
    await page.close();

    // ---- The game, with the files as they are.
    {
      const g = await openGame(browser, base);
      const ready = await until(g.page, () => window.__game.audio.stats() && window.__game.audio.stats().music === 'rec');
      let s = await stats(g.page);
      check(ready && s.scene === 'menu', `title screen: plays its recorded music (${s && s.scene}: ${s && s.music})`);
      check(g.requests[0] === 'music-menu.mp3' && Object.values(s.files).every((v) => v === 'ready' || v === 'fetched'), `the title music is fetched first, then the rest (${g.requests.join(', ')}; ${JSON.stringify(s.files)})`);
      await g.page.click('#menu-dock-btn');
      await until(g.page, () => window.__game.audio.stats().scene === 'dock' && window.__game.audio.stats().music === 'rec');
      s = await stats(g.page);
      check(s.scene === 'dock' && s.music === 'rec', `the shipyard has its own recorded music (${s.scene}: ${s.music})`);
      const levels = [];
      const decoded = [];
      const expect = { 1: 'rec', 2: 'synth', 3: 'rec' };
      for (const n of [1, 2, 3]) {
        await g.page.evaluate((k) => window.__game.startLevel(k), n);
        await until(g.page, (want) => window.__game.audio.stats().music === want, expect[n], 10);
        await sleep(300);
        s = await stats(g.page);
        levels.push(`${s.scene}: ${s.music}`);
        decoded.push(s.recordings.filter((k) => k.startsWith('music:')).sort().join('+'));
      }
      check(levels.join(', ') === 'europe: rec, bali: synth, volcano: rec', `levels play their recorded music, and the synthesised tune where there is none (${levels.join(', ')})`);
      // Title -> shipyard -> Europe -> Bali -> Volcano: the last two scenes' music stays decoded, older tracks go.
      check(decoded.join(', ') === 'music:dock+music:europe, music:europe, music:volcano', `only the current and the previous scene's music stay decoded (after each level: ${decoded.join(', ')})`);
      check(!g.warnings.length && !g.errors.length, `no sound warnings or page errors (${[...g.warnings, ...g.errors].join(' | ')})`);
      await g.page.close();
    }

    // ---- ?audio=synth: nothing is fetched, everything is synthesised.
    {
      const g = await openGame(browser, base + '?audio=synth');
      await until(g.page, () => window.__game.audio.stats() && window.__game.audio.stats().music === 'synth', null, 10);
      const s = await stats(g.page);
      check(s.music === 'synth' && !g.requests.length && !s.recordings.length, `?audio=synth: the synthesised soundtrack, no files fetched (${s.music}, ${g.requests.length} requests)`);
      await g.page.click('#menu-dock-btn');
      await sleep(500);
      const dock = await stats(g.page);
      check(dock.scene === 'menu' && dock.scenes === 1, `?audio=synth: the shipyard keeps the title screen's jig going instead of restarting it (scene ${dock.scene}, ${dock.scenes} scene(s) playing)`);
      await g.page.close();
    }

    // ---- Files missing: the synthesised sound takes over at once, with a warning.
    {
      const g = await openGame(browser, base, (p) => p.route('**/assets/audio/**', (r) => r.fulfill({ status: 404, body: 'not found' })));
      await until(g.page, () => {
        const st = window.__game.audio.stats();
        return st && st.music === 'synth' && Object.values(st.files).every((v) => v === 'failed');
      }, null, 10);
      const s = await stats(g.page);
      const fanfare = await g.page.evaluate(() => {
        const a = window.__game.audio;
        const before = a.stats();
        a.play('levelClear');
        const after = a.stats();
        return { voices: after.sfxVoices - before.sfxVoices, recorded: after.recordedPlays - before.recordedPlays };
      });
      check(s.music === 'synth' && Object.values(s.files).every((v) => v === 'failed') && fanfare.voices === 1 && fanfare.recorded === 0, `missing files: the synthesised music and fanfare play instead (${s.music}; fanfare ${JSON.stringify(fanfare)}; ${JSON.stringify(s.files)})`);
      check(g.warnings.length === Object.keys(s.files).length && g.warnings.every((w) => /no recording for/.test(w)) && !g.errors.length, `missing files: one "audio:" warning each, no errors (${g.warnings.length} warnings)`);
      await g.page.close();
    }

    // ---- A file that fails while its scene is waiting for it: the synthesised tune starts at once.
    {
      let fail;
      const gate = new Promise((r) => (fail = r));
      const g = await openGame(browser, base, (p) =>
        p.route('**/assets/audio/music-menu.mp3', async (r) => {
          await gate;
          r.fulfill({ status: 404, body: 'not found' });
        }),
      );
      await until(g.page, () => window.__game.audio.stats() && window.__game.audio.stats().music === 'wait', null, 10);
      const waiting = await stats(g.page);
      fail();
      await until(g.page, () => window.__game.audio.stats().music === 'synth', null, 10);
      const s = await stats(g.page);
      // pump() would only give up waiting 2 s (MUSIC_WAIT) after the scene started.
      check(waiting.music === 'wait' && s.music === 'synth' && s.time - waiting.time < 1, `a file failing while its scene waits: the synthesised tune starts straight away (${(s.time - waiting.time).toFixed(2)} s after the scene was seen waiting)`);
      check(g.warnings.length === 1 && /music:menu/.test(g.warnings[0]) && !g.errors.length, `a file failing while its scene waits: one warning, no errors (${g.warnings.join(' | ')})`);
      await g.page.close();
    }

    // ---- A slow download: the title waits a moment, plays the synthesised jig, then switches to the recording.
    {
      let release;
      const gate = new Promise((r) => (release = r));
      const g = await openGame(browser, base, (p) =>
        p.route('**/assets/audio/music-menu.mp3', async (r) => {
          await gate;
          r.continue();
        }),
      );
      const seen = [];
      for (let i = 0; i < 40; i++) {
        const s = await stats(g.page);
        if (s && seen[seen.length - 1] !== s.music) seen.push(s.music);
        if (s && s.music === 'synth' && s.time > 2.5) break;
        await sleep(100);
      }
      release();
      await until(g.page, () => window.__game.audio.stats().music === 'rec', null, 20);
      const s = await stats(g.page);
      if (seen[seen.length - 1] !== s.music) seen.push(s.music);
      check(seen.join(' -> ') === 'wait -> synth -> rec', `slow download: silence for a moment, then the synthesised jig, then the recording (${seen.join(' -> ')})`);
      check(!g.warnings.length && !g.errors.length, `slow download: no warnings or errors (${[...g.warnings, ...g.errors].join(' | ')})`);
      await g.page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall audio checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
