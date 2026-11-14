"""Export HandlingNet to ONNX and check it matches PyTorch.

    uv run python -m kipml.export [--checkpoint ...] [--out ml/models/handling-poc.onnx]

The ONNX graph takes features, not raw audio (the STFT stays outside, see ml/models/README.md):
  input  `features` float32 [1, T, 257] = log1p(10 * |STFT|)
  output `mask`     float32 [1, T, 257] multiply the complex STFT, then inverse STFT
  output `logit`    float32 [1, T]      sigmoid gives the handling probability per 10 ms frame
STFT: 16 kHz mono, n_fft 512, hop 160, Hann window 400 (zero-padded to 512), centred (reflect padding).
"""
from __future__ import annotations

import argparse, json

import numpy as np
import onnxruntime as ort
import torch

from .audio import HOP, ML_ROOT, N_BINS, N_FFT, RATE, WIN
from .evaluate import load_model
from .model import count_params


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=str(ML_ROOT / "checkpoints" / "handling-poc.pt"))
    ap.add_argument("--out", default=str(ML_ROOT / "models" / "handling-poc.onnx"))
    ap.add_argument("--metrics", help="evaluate.py JSON output to store next to the model")
    args = ap.parse_args(argv)
    model = load_model(args.checkpoint)
    dummy = torch.rand(1, 200, N_BINS)
    torch.onnx.export(model, (dummy,), args.out, input_names=["features"], output_names=["mask", "logit"],
                      dynamic_axes={"features": {1: "frames"}, "mask": {1: "frames"}, "logit": {1: "frames"}},
                      opset_version=17, dynamo=False)
    sess = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
    test = torch.rand(1, 537, N_BINS) * 3
    with torch.no_grad():
        m_t, l_t = model(test)
    m_o, l_o = sess.run(None, {"features": test.numpy()})
    diff = max(float(np.abs(m_o - m_t.numpy()).max()), float(np.abs(l_o - l_t.numpy()).max()))
    assert diff < 1e-3, f"ONNX and PyTorch disagree by {diff}"
    meta = {"model": "handling-poc", "version": 1, "input": "features = log1p(10 * |STFT|), float32 [1, T, 257]",
            "outputs": {"mask": "[1, T, 257] in 0..1", "logit": "[1, T]; sigmoid > threshold means handling noise"},
            "stft": {"rate": RATE, "n_fft": N_FFT, "hop": HOP, "win": WIN, "window": "hann", "center": True},
            "threshold": 0.5, "max_abs_diff_vs_pytorch": diff,
            "checkpoint": __import__("os").path.basename(args.checkpoint), "parameters": count_params(model),
            "config": __import__("torch").load(args.checkpoint, map_location="cpu")["config"]}
    if args.metrics:
        meta["metrics"] = json.load(open(args.metrics))
    json.dump(meta, open(args.out.replace(".onnx", ".json"), "w"), indent=1)
    print(f"exported {args.out} ({__import__('os').path.getsize(args.out) / 1024:.0f} KB), ONNX vs PyTorch max diff {diff:.2e}")


if __name__ == "__main__":
    main()
