# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy"]
# ///
"""Make PLACEHOLDER phone-handling noise until real recordings arrive.

Procedural fabric rustle, scrapes and bumps, seeded so it is reproducible. Writes 16 kHz mono
16-bit WAV clips plus labels.json (handling intervals in seconds) to ml/audio/synthetic/handling/.
Training should weight real recordings in ml/audio/ours/ above these.

    uv run ml/scripts/make_synthetic_handling.py [--count 24] [--seconds 5]
"""
import argparse, json, wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

RATE = 16000
OUT = Path(__file__).resolve().parents[1] / "audio" / "synthetic" / "handling"


def band(x, lo, hi):
    return sosfilt(butter(4, [lo, hi], btype="band", fs=RATE, output="sos"), x)


def smooth_env(rng, n, rate_hz):
    """Random positive envelope that varies at about rate_hz."""
    k = max(2, int(n / RATE * rate_hz))
    pts = np.abs(rng.normal(size=k + 1))
    return np.interp(np.arange(n), np.linspace(0, n - 1, k + 1), pts)


def event(rng, kind, n):
    if kind == "rustle":    # fabric sliding over the mic: broadband, slow swells
        return band(rng.normal(size=n), 700, 6500) * smooth_env(rng, n, rng.uniform(3, 12))
    if kind == "scrape":    # fingernail or seam scraping: brighter, fast flutter
        return band(rng.normal(size=n), 2000, 7500) * smooth_env(rng, n, rng.uniform(20, 60))
    t = np.arange(n) / RATE  # bump: phone knocked or set down
    f = rng.uniform(60, 220)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * rng.uniform(15, 40)) + 0.3 * band(rng.normal(size=n), 200, 2000) * np.exp(-t * 60)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=24)
    ap.add_argument("--seconds", type=float, default=5.0)
    ap.add_argument("--seed", type=int, default=14)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    OUT.mkdir(parents=True, exist_ok=True)
    total, labels = int(args.seconds * RATE), {}
    for i in range(args.count):
        clip, spans = np.zeros(total), []
        for _ in range(rng.integers(1, 4)):
            kind = rng.choice(["rustle", "rustle", "scrape", "bump"])
            dur = rng.uniform(0.3, 0.6) if kind == "bump" else rng.uniform(0.4, 2.0)
            n = int(dur * RATE)
            start = int(rng.uniform(0, args.seconds - dur) * RATE)
            e = event(rng, kind, n)
            e *= np.hanning(n) ** 0.25 * rng.uniform(0.3, 1.0) / (np.abs(e).max() + 1e-9)
            clip[start:start + n] += e
            spans.append({"start": round(start / RATE, 3), "end": round((start + n) / RATE, 3), "kind": str(kind)})
        clip += rng.normal(scale=0.002, size=total)  # faint hiss so silence is not digital zero
        clip *= 10 ** (-12 / 20) / (np.abs(clip).max() + 1e-9)  # peak -12 dBFS
        name = f"synthetic_handling_{i:02d}.wav"
        with wave.open(str(OUT / name), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes((clip * 32767).astype("<i2").tobytes())
        labels[name] = sorted(spans, key=lambda s: s["start"])
    (OUT / "labels.json").write_text(json.dumps({"rate": RATE, "note": "PLACEHOLDER synthetic handling noise", "clips": labels}, indent=1))
    print(f"{args.count} placeholder clips in {OUT}")


if __name__ == "__main__":
    main()
