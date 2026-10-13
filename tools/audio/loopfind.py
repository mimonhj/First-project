#!/usr/bin/env python3
"""Find a seamless loop in a music track: two points A < B where the music just before B sounds like the music
just before A, so playback can jump from B back to A without the listener noticing.

    python3 tools/audio/loopfind.py TRACK.mp3 [MIN_SECONDS]

Prints the loop as sample positions at 48 kHz (paste them into tools/audio/assets.json as "loop": [A, B]) and
how well it matches: sim (spectral and harmonic likeness of the 3 s before each point, 1 = identical),
wave_corr (waveform match of the 0.4 s before each point) and onset_lag_ms (0 = the beat carries on in step).

How: frame features (48 log bands + chroma) are compared along every diagonal of the self-similarity matrix to
score all (A, B) pairs at once, preferring longer loops slightly. B is then moved within a quarter beat, first so
the onsets line up and then so the waveform phase does.
"""
import json
import subprocess
import sys

import numpy as np

SR = 48000


def load(path, sr=SR):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def envelope(x, win=0.5):
    n = int(SR * win)
    mono = x.mean(axis=1)
    k = len(mono) // n
    e = np.sqrt((mono[: k * n].reshape(k, n) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(e)


def spectrogram(mono, n_fft=2048, hop=512):
    win = np.hanning(n_fft).astype(np.float32)
    frames = 1 + (len(mono) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(frames)[:, None]
    S = np.abs(np.fft.rfft(mono[idx] * win, axis=1)).astype(np.float32)
    return S  # frames x bins


def band_matrix(n_bins, n_bands=48, fmin=40, fmax=12000, n_fft=2048):
    freqs = np.fft.rfftfreq(n_fft, 1 / SR)
    edges = np.geomspace(fmin, fmax, n_bands + 1)
    M = np.zeros((n_bins, n_bands), dtype=np.float32)
    for b in range(n_bands):
        sel = (freqs >= edges[b]) & (freqs < edges[b + 1])
        if sel.any():
            M[sel, b] = 1.0 / sel.sum()
    return M


def chroma_matrix(n_bins, n_fft=2048):
    freqs = np.fft.rfftfreq(n_fft, 1 / SR)
    M = np.zeros((n_bins, 12), dtype=np.float32)
    ok = (freqs > 60) & (freqs < 5000)
    pc = np.round(12 * np.log2(freqs[ok] / 440.0)).astype(int) % 12
    M[np.nonzero(ok)[0], pc] = 1.0
    return M


def tempo(onset, hop_s):
    o = onset - onset.mean()
    ac = np.correlate(o, o, mode='full')[len(o) - 1:]
    lo, hi = int(60 / 200 / hop_s), int(60 / 55 / hop_s)
    lag = lo + int(np.argmax(ac[lo:hi]))
    return 60 / (lag * hop_s), lag


def find_loop(x, min_len=30.0, head=1.0, tail=4.0, ctx=3.0):
    """Best (A, B): the music just before B sounds like the music just before A, so B can jump back to A."""
    mono = x.mean(axis=1)
    hop = 512
    S = spectrogram(mono, hop=hop)
    hop_s = hop / SR
    bands = np.log1p(S @ band_matrix(S.shape[1]) * 50)
    chroma = S @ chroma_matrix(S.shape[1])
    chroma = chroma / (np.linalg.norm(chroma, axis=1, keepdims=True) + 1e-9)
    flux = np.maximum(0, np.diff(bands, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    bpm, beat = tempo(flux, hop_s)
    # Feature per frame: band shape (normalised) + chroma, smoothed over ~0.1 s.
    f = np.concatenate([bands / (np.linalg.norm(bands, axis=1, keepdims=True) + 1e-9), chroma], axis=1)
    k = max(1, int(0.1 / hop_s))
    ker = np.ones(k) / k
    f = np.stack([np.convolve(f[:, j], ker, mode='same') for j in range(f.shape[1])], axis=1)
    f = f / (np.linalg.norm(f, axis=1, keepdims=True) + 1e-9)
    n = len(f)
    W = int(ctx / hop_s)
    env = envelope(x, hop_s)[: n]
    # Loud enough: avoid choosing a fade-in/fade-out region.
    loud_ref = np.percentile(env, 75)
    loud = env >= loud_ref - 9
    a_lo, b_hi = int(head / hop_s) + W, n - int(tail / hop_s)
    best = (-1, 0, 0, 0)
    # For each lag L = B - A, the window similarity for every A is a moving sum along that diagonal.
    for L in range(int(min_len / hop_s), b_hi - a_lo):
        diag = (f[:-L] * f[L:]).sum(axis=1)  # diag[t] = sim(f[t], f[t+L])
        cs = np.concatenate([[0.0], np.cumsum(diag)])
        a = np.arange(a_lo, min(n // 2, b_hi - L))
        if not len(a):
            continue
        s = (cs[a] - cs[a - W]) / W  # mean over t in [a-W, a)
        ok = loud[a] & loud[a + L]
        if not ok.any():
            continue
        s = np.where(ok, s, -1)
        i = int(np.argmax(s))
        # Longer loops are nicer: small bonus per second of length.
        s2 = s[i] + 0.0004 * L * hop_s
        if s2 > best[0]:
            best = (s2, int(a[i]), int(a[i] + L), float(s[i]))
    _, a, b, sim = best
    A, B = a * hop, b * hop
    B, corr = refine(mono, A, B, bpm)
    return {'bpm': round(bpm, 1), 'A': A / SR, 'B': B / SR, 'len': (B - A) / SR, 'sim': round(sim, 4),
            'wave_corr': round(corr, 4), 'onset_lag_ms': onset_lag(mono, A, B), 'A_samples': int(A), 'B_samples': int(B)}


def refine(mono, A, B, bpm):
    """Line up B with A: first the rhythm (onsets over 4 s), then the waveform phase (0.4 s), so the jump is in step."""
    hop = 128
    w = int(4.0 * SR)
    oa = onset_env(mono[A - w: A], hop)
    best, lag = -1e18, 0
    q = int(0.25 * 60 / bpm * SR / hop)
    for l in range(-q, q + 1):
        Bl = B - l * hop
        if Bl > len(mono) or Bl - w < 0:
            continue
        ob = onset_env(mono[Bl - w: Bl], hop)
        m = min(len(oa), len(ob))
        c = float(np.dot(oa[:m], ob[:m]))
        if c > best:
            best, lag = c, l
    B1 = B - lag * hop
    seg = int(0.4 * SR)
    ref = mono[A - seg: A]
    def corr(l):
        cand = mono[B1 + l - seg: B1 + l]
        return float(np.dot(ref, cand) / (np.linalg.norm(ref) * np.linalg.norm(cand) + 1e-9))
    lags = [l for l in range(-hop, hop + 1) if seg <= B1 + l <= len(mono)]
    l = max(lags, key=corr)
    return B1 + l, corr(l)


def onset_env(mono, hop=256):
    S = spectrogram(mono, n_fft=1024, hop=hop)
    b = np.log1p(S * 10)
    o = np.maximum(0, np.diff(b, axis=0)).sum(axis=1)
    return o - o.mean()


def onset_lag(mono, A, B, win=4.0, hop=256):
    """Rhythm check: lag (ms) that best aligns the onsets of the 4 s before B with the 4 s before A (0 = in step)."""
    w = int(win * SR)
    oa = onset_env(mono[A - w: A], hop)
    ob = onset_env(mono[B - w: B], hop)
    m = min(len(oa), len(ob))
    oa, ob = oa[:m], ob[:m]
    best, lag = -1e18, 0
    for l in range(-20, 21):  # +-20 frames of 5.3 ms
        if l >= 0:
            c = float(np.dot(oa[l:], ob[: m - l]))
        else:
            c = float(np.dot(oa[: m + l], ob[-l:]))
        if c > best:
            best, lag = c, l
    return round(lag * hop / SR * 1000, 1)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    x = load(sys.argv[1])
    min_len = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
    print(json.dumps(find_loop(x, min_len=min_len), default=float))


if __name__ == '__main__':
    main()
