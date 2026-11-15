"""Export the handling filter to ONNX and check it matches PyTorch.

    uv run python -m kipml.export [--checkpoint models/handling-poc.pt] [--out models/handling-v1.onnx]
    uv run python -m kipml.export --features-in --out <path>    # the older graph (handling-poc.onnx)

`handling-v1.onnx`, the default, is the whole filter with the STFT and inverse STFT inside the graph:
  input  `pcm`      float32 [1, N]       16 kHz mono in [-1, 1], N >= 512 (zero-pad shorter clips)
  output `clean`    float32 [1, N]       the clip with handling noise removed
  output `handling` float32 [1, frames]  probability of handling noise per 10 ms frame, frames = 1 + N // 160
The STFT is a strided convolution with fixed DFT weights and the inverse STFT is a transposed
convolution with overlap-add normalisation, so ONNX Runtime needs no FFT op. Both match `torch.stft`
and `torch.istft` as `kipml.model` calls them: n_fft 512, hop 160, Hann window 400 zero-padded to
512, centred with reflect padding.

`--features-in` writes the older graph, where the caller computes the STFT:
  input  `features` float32 [1, T, 257] = log1p(10 * |STFT|)
  output `mask`     float32 [1, T, 257] multiply the complex STFT, then inverse STFT
  output `logit`    float32 [1, T]      sigmoid gives the handling probability per 10 ms frame
"""
from __future__ import annotations

import argparse, json, math, os

import numpy as np
import onnxruntime as ort
import torch
import torch.nn.functional as F
from torch import nn

from .audio import HOP, ML_ROOT, N_BINS, N_FFT, RATE, WIN
from .evaluate import load_model
from .model import HandlingNet, count_params, enhance, features

OPSET = 17
MIN_SAMPLES = N_FFT     # kipml.model.enhance zero-pads anything shorter to 512 samples first
THRESHOLD = 0.5         # a frame is handling noise when its probability is above this
TOLERANCE = 1e-3        # largest difference allowed between ONNX Runtime and PyTorch
STFT = {"rate": RATE, "n_fft": N_FFT, "hop": HOP, "win": WIN, "window": "hann", "center": True}


class HandlingFilter(nn.Module):
    """HandlingNet between a convolutional STFT and inverse STFT: raw audio in, clean audio out."""

    def __init__(self, net: HandlingNet):
        super().__init__()
        self.net = net
        offset = (N_FFT - WIN) // 2      # torch.stft centres the 400-sample window in the 512-point frame
        n = torch.arange(WIN, dtype=torch.float64) + offset
        k = torch.arange(N_BINS, dtype=torch.float64)[:, None]
        window = torch.hann_window(WIN, dtype=torch.float64)
        angle = 2 * math.pi * k * n / N_FFT
        # Rows 0 to 256 give each bin's real part, rows 257 to 513 its imaginary part. The same
        # weights serve the forward transform (conv1d) and the inverse (conv_transpose1d).
        basis = torch.cat([torch.cos(angle), -torch.sin(angle)]) * window
        self.register_buffer("basis", basis[:, None].float())
        # irfft: the DC and Nyquist bins count once, every other bin twice (it stands for its mirror)
        weight = torch.full((N_BINS,), 2.0 / N_FFT, dtype=torch.float64)
        weight[0] = weight[-1] = 1.0 / N_FFT
        self.register_buffer("irfft_weight", torch.cat([weight, weight])[None, :, None].float())
        self.register_buffer("window_sq", (window ** 2)[None, None].float())

    def spectrum(self, pcm: torch.Tensor) -> torch.Tensor:
        """[1, N] audio to [1, 514, frames]: the real parts of the 257 bins, then the imaginary parts."""
        # torch.stft reflects 256 samples at each end; the window's first 56 taps are zero, so 200 do
        return F.conv1d(F.pad(pcm[:, None], (WIN // 2, WIN // 2), mode="reflect"), self.basis, stride=HOP)

    def forward(self, pcm: torch.Tensor):
        spec = self.spectrum(pcm)
        re, im = spec[:, :N_BINS], spec[:, N_BINS:]
        mask, logit = self.net(features(torch.sqrt(re * re + im * im)).transpose(1, 2))
        mask = mask.transpose(1, 2)
        frames = F.conv_transpose1d(spec * torch.cat([mask, mask], dim=1) * self.irfft_weight, self.basis, stride=HOP)
        envelope = F.conv_transpose1d(torch.ones_like(spec[:, :1]), self.window_sq, stride=HOP)
        start, n = WIN // 2, pcm.shape[1]
        clean = frames[:, 0, start:start + n] / envelope[:, 0, start:start + n]
        return clean, torch.sigmoid(logit)


def probe_signal(n: int, seed: int = 0) -> np.ndarray:
    """Quiet noise with a loud burst, so masks and probabilities move away from their resting values."""
    rng = np.random.default_rng(seed)
    x = 0.05 * rng.standard_normal(n)
    burst = slice(n // 3, n // 3 + min(n // 4, RATE // 2))
    x[burst] += 0.5 * rng.standard_normal(burst.stop - burst.start)
    return np.clip(x, -1, 1).astype(np.float32)


def export_pcm(net: HandlingNet, out: str) -> dict:
    """Write the raw-audio graph and measure it against PyTorch and against kipml.model.enhance."""
    model = HandlingFilter(net).eval()
    torch.onnx.export(model, (torch.from_numpy(probe_signal(RATE))[None],), out,
                      input_names=["pcm"], output_names=["clean", "handling"],
                      dynamic_axes={"pcm": {1: "samples"}, "clean": {1: "samples"}, "handling": {1: "frames"}},
                      opset_version=OPSET, dynamo=False)
    sess = ort.InferenceSession(out, providers=["CPUExecutionProvider"])
    vs_pytorch = vs_enhance = 0.0
    for n in (MIN_SAMPLES, 4001, 3 * RATE + 7):
        x = probe_signal(n, seed=n)
        clean_o, prob_o = sess.run(None, {"pcm": x[None]})
        with torch.no_grad():
            clean_t, prob_t = (y[0].numpy() for y in model(torch.from_numpy(x)[None]))
        clean_e, prob_e = enhance(net, x)
        vs_pytorch = max(vs_pytorch, float(np.abs(clean_o[0] - clean_t).max()), float(np.abs(prob_o[0] - prob_t).max()))
        vs_enhance = max(vs_enhance, float(np.abs(clean_t - clean_e).max()), float(np.abs(prob_t - prob_e).max()))
    if max(vs_pytorch, vs_enhance) > TOLERANCE:
        raise SystemExit(f"{out}: ONNX differs from PyTorch by {vs_pytorch:.2e} and from enhance() by {vs_enhance:.2e}")
    return {"model": "handling-v1", "version": 1,
            "input": {"pcm": f"float32 [1, N], 16 kHz mono in [-1, 1], N >= {MIN_SAMPLES}"},
            "outputs": {"clean": "float32 [1, N], the clip with handling noise removed",
                        "handling": "float32 [1, frames], frames = 1 + N // 160; > threshold means handling noise"},
            "frames_per_second": RATE // HOP, "min_samples": MIN_SAMPLES, "stft": STFT, "threshold": THRESHOLD,
            "opset": OPSET, "max_abs_diff_vs_pytorch": vs_pytorch, "max_abs_diff_vs_enhance": vs_enhance}


def export_features(net: HandlingNet, out: str) -> dict:
    """Write the older graph that takes STFT features, as handling-poc.onnx was made."""
    torch.onnx.export(net, (torch.rand(1, 200, N_BINS),), out, input_names=["features"], output_names=["mask", "logit"],
                      dynamic_axes={"features": {1: "frames"}, "mask": {1: "frames"}, "logit": {1: "frames"}},
                      opset_version=OPSET, dynamo=False)
    sess = ort.InferenceSession(out, providers=["CPUExecutionProvider"])
    test = torch.rand(1, 537, N_BINS) * 3
    with torch.no_grad():
        m_t, l_t = net(test)
    m_o, l_o = sess.run(None, {"features": test.numpy()})
    diff = max(float(np.abs(m_o - m_t.numpy()).max()), float(np.abs(l_o - l_t.numpy()).max()))
    if diff > TOLERANCE:
        raise SystemExit(f"{out}: ONNX and PyTorch disagree by {diff:.2e}")
    return {"model": "handling-poc", "version": 1, "input": "features = log1p(10 * |STFT|), float32 [1, T, 257]",
            "outputs": {"mask": "[1, T, 257] in 0..1", "logit": "[1, T]; sigmoid > threshold means handling noise"},
            "stft": STFT, "threshold": THRESHOLD, "max_abs_diff_vs_pytorch": diff}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Export the handling filter to ONNX and check it against PyTorch.")
    ap.add_argument("--checkpoint", default=str(ML_ROOT / "models" / "handling-poc.pt"),
                    help="a train.py checkpoint, trained or not (default: the committed weights)")
    ap.add_argument("--out", help="default: models/handling-v1.onnx, or models/handling-poc.onnx with --features-in")
    ap.add_argument("--features-in", action="store_true", help="the older graph: STFT features in, mask and logit out")
    ap.add_argument("--metrics", help="evaluate.py JSON output to store next to the model")
    args = ap.parse_args(argv)
    net = load_model(args.checkpoint)
    out = args.out or str(ML_ROOT / "models" / ("handling-poc.onnx" if args.features_in else "handling-v1.onnx"))
    meta = export_features(net, out) if args.features_in else export_pcm(net, out)
    meta.update(checkpoint=os.path.basename(args.checkpoint), parameters=count_params(net),
                config={"ch": net.enc[0].out_channels, "hidden": net.rnn.hidden_size})
    if args.metrics:
        with open(args.metrics) as f:
            meta["metrics"] = json.load(f)
    with open(os.path.splitext(out)[0] + ".json", "w") as f:
        json.dump(meta, f, indent=1)
    print(f"exported {out} ({os.path.getsize(out) / 1024:.0f} KB), "
          f"ONNX vs PyTorch max diff {meta['max_abs_diff_vs_pytorch']:.2e}")


if __name__ == "__main__":
    main()
