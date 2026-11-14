"""HandlingNet: a small STFT mask model (about 0.2M parameters).

Input: log-magnitude spectrogram [B, T, 257] (16 kHz, 512-point FFT, 10 ms hop, 25 ms Hann window).
Outputs: a mask in [0, 1] per time-frequency bin that removes handling noise, and a per-frame logit
saying whether the frame contains handling noise. The STFT stays outside the network so the ONNX
export is plain convolutions and a GRU.
"""
from __future__ import annotations

import numpy as np
import torch
from torch import nn

from .audio import HOP, N_BINS, N_FFT, WIN


class HandlingNet(nn.Module):
    def __init__(self, ch: int = 16, hidden: int = 96):
        super().__init__()
        self.enc = nn.Sequential(
            nn.Conv2d(1, ch, (3, 5), stride=(1, 2), padding=(1, 2)), nn.ReLU(),   # 257 -> 129 bins
            nn.Conv2d(ch, ch, 3, stride=(1, 2), padding=1), nn.ReLU(),            # 129 -> 65 bins
            nn.Conv2d(ch, ch, 3, stride=(1, 2), padding=1), nn.ReLU(),            # 65 -> 33 bins
        )
        self.proj = nn.Linear(ch * 33, hidden)
        self.rnn = nn.GRU(hidden, hidden, batch_first=True, bidirectional=True)
        self.mask = nn.Linear(2 * hidden, N_BINS)
        self.frame = nn.Linear(2 * hidden, 1)

    def forward(self, feats: torch.Tensor):
        x = self.enc(feats.unsqueeze(1))                       # [B, C, T, 33]
        b, c, t, f = x.shape
        x = torch.relu(self.proj(x.permute(0, 2, 1, 3).reshape(b, t, c * f)))
        x, _ = self.rnn(x)
        return torch.sigmoid(self.mask(x)), self.frame(x).squeeze(-1)


_WINDOWS: dict = {}


def _window(device):
    if device not in _WINDOWS:
        _WINDOWS[device] = torch.hann_window(WIN, device=device)
    return _WINDOWS[device]


def stft(x: torch.Tensor) -> torch.Tensor:
    """[B, N] waveform to complex [B, T, F]."""
    return torch.stft(x, N_FFT, HOP, WIN, _window(x.device), center=True, return_complex=True).transpose(1, 2)


def istft(spec: torch.Tensor, length: int) -> torch.Tensor:
    return torch.istft(spec.transpose(1, 2), N_FFT, HOP, WIN, _window(spec.device), center=True, length=length)


def features(mag: torch.Tensor) -> torch.Tensor:
    return torch.log1p(mag * 10.0)


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


@torch.no_grad()
def enhance(model: HandlingNet, x: np.ndarray, chunk_s: float = 30.0):
    """Clean a whole recording. Returns (clean waveform, per-frame handling probability)."""
    model.eval()
    dev = next(model.parameters()).device
    n = int(chunk_s * 16000)
    outs, probs = [], []
    for start in range(0, max(len(x), 1), n):
        seg = torch.from_numpy(np.ascontiguousarray(x[start:start + n])).float().to(dev)[None]
        if seg.shape[1] < N_FFT:
            seg = torch.nn.functional.pad(seg, (0, N_FFT - seg.shape[1]))
        spec = stft(seg)
        mask, logit = model(features(spec.abs()))
        y = istft(spec * mask, seg.shape[1])[0, : len(x[start:start + n])]
        outs.append(y.cpu().numpy())
        frames = 1 + len(x[start:start + n]) // HOP
        probs.append(torch.sigmoid(logit)[0, :frames].cpu().numpy())
    return np.concatenate(outs), np.concatenate(probs)
