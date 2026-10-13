#!/usr/bin/env python3
"""Cut the raw ElevenLabs downloads into the game's audio files (assets/audio/).

    python3 tools/audio/build.py RAW_DIR               # build every asset whose raw download is in RAW_DIR
    python3 tools/audio/build.py RAW_DIR KEY [KEY...]  # build only these (e.g. music:bali sfx:cannon)
    python3 tools/audio/build.py --check               # only measure the files already in assets/audio/

RAW_DIR holds the untouched downloads, named as in each entry's "src" (the raw files are not kept in the repo: the
flow and generation in assets.json say where to download them again). Needs ffmpeg (with libmp3lame) and numpy.
For each file it builds it prints the measurements and the line to put in RECORDED in src/audio.js (set the gain
with `node tests/audio.cjs --calibrate`).

Each entry in assets.json is one of:
  "kind": "loop"     music that repeats: "loop": [A, B] are sample positions in the 48 kHz source. The file is the
                     source from A to B, and its last 80 ms are crossfaded with the 80 ms just before A, so the end
                     flows straight back into the start. (A and B were picked with tools/audio/loopfind.py: the
                     music before B matches the music before A, in rhythm and in waveform.)
  "kind": "oneshot"  a sound or fanfare: starts at "start" seconds (default: the first sound), ends where the
                     sound has died away, with short fades so it never clicks.
Every file is normalised to its "lufs" target (integrated loudness), with true peaks kept under -1 dBTP,
and encoded as 48 kHz stereo MP3. Chromium and Firefox decode these to their exact length; for a decoder that keeps
the encoder's priming and padding, the game cuts the decode to the loop's "frames" (see fitLength in src/audio.js).
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'audio')
XFADE = 0.08  # seconds of crossfade at a loop's seam


def load(path, sr):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def write_wav(path, x, sr):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '2', '-i', '-',
                    '-c:a', 'pcm_f32le', path], input=x.astype(np.float32).tobytes(), check=True)


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBTP) from ffmpeg's EBU R128 meter."""
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true',
                          '-f', 'null', '-'], capture_output=True, text=True).stderr
    tail = err[err.rfind('Summary:'):]
    vals = {}
    for line in tail.splitlines():
        line = line.strip()
        for key, name in (('I:', 'lufs'), ('Peak:', 'tp')):
            if line.startswith(key):
                vals[name] = float(line.split(':')[1].split()[0])
    return vals


def make_loop(x, a, b, sr):
    c = int(XFADE * sr)
    body = x[a:b].copy()
    t = (np.arange(c, dtype=np.float32) + 0.5) / c
    fade_out = np.cos(t * np.pi / 2)[:, None]
    fade_in = np.sin(t * np.pi / 2)[:, None]
    body[-c:] = x[b - c:b] * fade_out + x[a - c:a] * fade_in
    return body


def make_oneshot(x, sr, start=None, floor_db=-66):
    level = np.abs(x).max(axis=1)
    loud = np.nonzero(level > 10 ** (floor_db / 20))[0]
    s = int(start * sr) if start is not None else max(0, loud[0] - int(0.002 * sr))
    e = min(len(x), loud[-1] + int(0.02 * sr))
    y = x[s:e].copy()
    fi = int(0.003 * sr)
    fo = int(0.03 * sr)
    y[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    y[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None]
    return y


def duck_time(y, sr, drop_db=24):
    """Seconds until the sound has fallen `drop_db` below its loudest moment (how long to duck the music)."""
    win = int(0.05 * sr)
    k = len(y) // win
    env = np.sqrt((y[: k * win].mean(axis=1).reshape(k, win) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(env)
    above = np.nonzero(db > db.max() - drop_db)[0]
    return round(float((above[-1] + 1) * win / sr), 2)


def seam_report(y, sr):
    """How the jump from the last sample back to the first compares with ordinary sample-to-sample steps."""
    steps = np.abs(np.diff(y, axis=0)).max(axis=1)
    seam = float(np.abs(y[0] - y[-1]).max())
    return {'seam_step': round(seam, 4), 'p99_step': round(float(np.percentile(steps, 99)), 4)}


def encode(x, sr, path, bitrate):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'x.wav')
        write_wav(wav, x, sr)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', bitrate,
                        '-ar', str(sr), '-ac', '2', '-map_metadata', '-1', path], check=True)


def normalise(x, sr, target):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'x.wav')
        write_wav(wav, x, sr)
        m = loudness(wav)
    gain_db = target - m['lufs']
    gain_db = min(gain_db, -1.0 - m['tp'])  # keep true peaks under -1 dBTP
    return x * np.float32(10 ** (gain_db / 20)), round(gain_db, 2)


def build(spec, raw_dir, only):
    sr = spec['rate']
    os.makedirs(OUT, exist_ok=True)
    report = []
    unknown = set(only) - {a['key'] for a in spec['assets']}
    if unknown:
        sys.exit(f'not in assets.json: {", ".join(sorted(unknown))}')
    for a in spec['assets']:
        if only and a['key'] not in only:
            continue
        src = os.path.join(raw_dir, a['src'])
        if not os.path.exists(src):
            if only:
                sys.exit(f'{a["key"]}: no raw download at {src}')
            print(f'# skipped {a["key"]}: no raw download at {src}', file=sys.stderr)
            continue
        x = load(src, sr)
        if a['kind'] == 'loop':
            y = make_loop(x, a['loop'][0], a['loop'][1], sr)
        else:
            y = make_oneshot(x, sr, a.get('start'))
        y, gain = normalise(y, sr, a['lufs'])
        path = os.path.join(OUT, a['out'])
        encode(y, sr, path, spec['bitrate'])
        report.append(check_file(a, path, sr, expect=len(y), gain=gain))
    return report


def check_file(a, path, sr, expect=None, gain=None):
    y = load(path, sr)
    info = {'key': a['key'], 'out': a['out'], 'kind': a['kind'], 'seconds': round(len(y) / sr, 3), 'frames': len(y),
            'bytes': os.path.getsize(path), **loudness(path)}
    if expect is not None:
        info['frames_expected'] = expect
    if gain is not None:
        info['gain_db'] = gain
    kind, name = a['key'].split(':')
    if a['kind'] == 'loop':
        info.update(seam_report(y, sr))
        info['recorded'] = f"RECORDED.{kind}.{name}: {{ file: '{a['out']}', gain: 1, frames: {len(y)} }}"
    else:
        info['duck'] = duck_time(y, sr)
        duck = f", duck: {info['duck']}" if name in ('levelClear', 'victory', 'defeat') else ''
        info['recorded'] = f"RECORDED.{kind}.{name}: {{ file: '{a['out']}', gain: 1{duck} }}"
    return info


def main():
    args = [v for v in sys.argv[1:] if not v.startswith('--')]
    spec = json.load(open(os.path.join(HERE, 'assets.json')))
    if '--check' in sys.argv:
        report = [check_file(a, os.path.join(OUT, a['out']), spec['rate']) for a in spec['assets']]
    else:
        if not args:
            sys.exit(__doc__)
        report = build(spec, args[0], args[1:])
    for r in report:
        print(json.dumps(r))


if __name__ == '__main__':
    main()
