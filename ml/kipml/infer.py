"""Run the handling filter on any recording from any device.

    uv run python -m kipml.infer path/to/recording.m4a [--out cleaned.wav] [--threshold 0.5]

Writes the cleaned audio (default: next to the input, `<name>.clean.wav`) and prints the
moments the model flagged as phone-handling noise.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from .audio import HOP, RATE, load_any, write_wav
from .audio import ML_ROOT
from .evaluate import load_model
from .model import enhance


def segments(prob: np.ndarray, threshold: float, min_s: float = 0.15, gap_s: float = 0.1):
    on = prob > threshold
    spans, start = [], None
    for i, v in enumerate(np.append(on, False)):
        if v and start is None:
            start = i
        elif not v and start is not None:
            spans.append([start, i]); start = None
    merged = []
    for s, e in spans:
        if merged and (s - merged[-1][1]) * HOP / RATE <= gap_s:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    return [(s * HOP / RATE, e * HOP / RATE) for s, e in merged if (e - s) * HOP / RATE >= min_s]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out")
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--min-ms", type=float, default=30, help="shortest event to report; drops last about 50 to 150 ms")
    ap.add_argument("--checkpoint", default=str(ML_ROOT / "models" / "handling-poc.pt"), help="default: the shipped model")
    args = ap.parse_args(argv)
    x = load_any(args.audio)
    clean, prob = enhance(load_model(args.checkpoint), x)
    out = Path(args.out) if args.out else Path(args.audio).with_suffix(".clean.wav")
    write_wav(out, clean)
    segs = segments(prob, args.threshold, min_s=args.min_ms / 1000)
    flagged = sum(e - s for s, e in segs)
    print(f"{Path(args.audio).name}: {len(x) / RATE:.1f} s, handling noise in {flagged:.1f} s ({100 * flagged / max(len(x) / RATE, 1e-9):.0f}%)")
    for s, e in segs:
        print(f"  handling {s:6.2f} to {e:6.2f} s  (peak p={prob[int(s * RATE / HOP):int(e * RATE / HOP) + 1].max():.2f})")
    print(f"cleaned audio: {out}")


if __name__ == "__main__":
    main()
