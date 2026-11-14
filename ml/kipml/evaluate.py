"""Score the model on held-out mixtures against a spectral-gating baseline.

    uv run python -m kipml.evaluate [--checkpoint ml/checkpoints/handling-poc.pt] [--n 200]

Metrics on mixtures that contain handling noise:
- SI-SDR improvement (dB) of the output over the input, measured against the clean background
- handling-frame precision, recall and F1 at probability 0.5
and, on mixtures without handling noise, the share of frames wrongly flagged.
"""
from __future__ import annotations

import argparse, json

import numpy as np
import torch

from .audio import ML_ROOT
from .data import make_example, load_sources
from .model import HandlingNet, enhance, istft, stft


def si_sdr(est: np.ndarray, ref: np.ndarray) -> float:
    ref = ref - ref.mean(); est = est - est.mean()
    a = np.dot(est, ref) / (np.dot(ref, ref) + 1e-9)
    target = a * ref
    return float(10 * np.log10((np.sum(target ** 2) + 1e-9) / (np.sum((est - target) ** 2) + 1e-9)))


def spectral_gate(x: np.ndarray) -> np.ndarray:
    """Classic stationary-noise gate: subtract each bin's 20th-percentile level."""
    spec = stft(torch.from_numpy(x)[None])
    mag = spec.abs()
    noise = torch.quantile(mag, 0.2, dim=1, keepdim=True)
    gain = (1 - 1.5 * noise / mag.clamp_min(1e-8)).clamp(0, 1)
    return istft(spec * gain, len(x))[0].numpy()


def load_model(path) -> HandlingNet:
    ck = torch.load(path, map_location="cpu")
    model = HandlingNet(**ck["config"])
    model.load_state_dict(ck["state_dict"])
    return model.eval()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=str(ML_ROOT / "checkpoints" / "handling-poc.pt"))
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--seconds", type=float, default=4.0)
    args = ap.parse_args(argv)
    model, src, rng = load_model(args.checkpoint), load_sources(), np.random.default_rng(2026)

    imp_model, imp_gate, tp, fp, fn, fa_frames, fa_total = [], [], 0, 0, 0, 0, 0
    for _ in range(args.n):
        mix, clean, labels, has = make_example(rng, src, "test", args.seconds)
        out, prob = enhance(model, mix)
        pred = prob[: len(labels)] > 0.5
        if has:
            base = si_sdr(mix, clean)
            imp_model.append(si_sdr(out, clean) - base)
            imp_gate.append(si_sdr(spectral_gate(mix), clean) - base)
            lab = labels.astype(bool)
            tp += int((pred & lab).sum()); fp += int((pred & ~lab).sum()); fn += int((~pred & lab).sum())
        else:
            fa_frames += int(pred.sum()); fa_total += len(pred)
    prec = tp / max(tp + fp, 1); rec = tp / max(tp + fn, 1)
    res = {
        "mixtures": args.n,
        "si_sdr_improvement_db": {"model": round(float(np.median(imp_model)), 2), "spectral_gate": round(float(np.median(imp_gate)), 2)},
        "handling_frames": {"precision": round(prec, 3), "recall": round(rec, 3), "f1": round(2 * prec * rec / max(prec + rec, 1e-9), 3)},
        "false_alarm_rate_without_handling": round(fa_frames / max(fa_total, 1), 3),
    }
    print(json.dumps(res, indent=1))
    return res


if __name__ == "__main__":
    main()
