"""Figures for ml/MODEL.md, from a real held-out take and the shipped model.

    cd ml && uv run python scripts/make_doc_figures.py
"""
import sys
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))

import matplotlib.pyplot as plt
import numpy as np
import torch

from kipml import report as r                       # chart style and validated colours
from kipml.audio import AUDIO, HOP, RATE, frame_db, read_wav
from kipml.data import Clip, handling_labels, load_sources
from kipml.evaluate import load_model
from kipml.infer import segments
from kipml.model import features, stft

OUT = ML / "docs" / "img"
OUT.mkdir(parents=True, exist_ok=True)
TAKE = AUDIO / "ours" / "venue_pickup_01.wav"       # held out: never trained on

x = read_wav(TAKE)
model = load_model(ML / "checkpoints" / "handling-gpu.pt")
spec = stft(torch.from_numpy(x)[None])
with torch.no_grad():
    mask, logit = model(features(spec.abs()))
removed = 1.0 - mask[0].numpy().T                   # [freq, time]: 1 = fully removed
prob = torch.sigmoid(logit)[0].numpy()
venue = load_sources()["handling"]["test"]["ours"][0].venue_floor_db
labels = handling_labels(x, Clip(TAKE.name, x, float(np.percentile(frame_db(x), 10)), venue, True))
dur = len(x) / RATE

# 1. What the model sees
fig, axes = plt.subplots(2, 1, figsize=(10, 5), sharex=True, constrained_layout=True, gridspec_kw={"height_ratios": [1, 1.6]})
r._envelope(axes[0], x, r.INPUT)
axes[0].set_yticks([]); axes[0].set_title("Waveform: a phone set down five times in a noisy room")
r._spectrogram(axes[1], x, "Log-magnitude spectrogram (the model's input): each drop is a short, full-height stripe", r._spec_db(x).max())
axes[1].set_xlabel("seconds")
fig.savefig(OUT / "input.png", dpi=110); plt.close(fig)

# 2. What the model learned to remove
fig, axes = plt.subplots(2, 1, figsize=(10, 5), sharex=True, constrained_layout=True, gridspec_kw={"height_ratios": [1.6, 1]})
im = axes[0].imshow(removed, origin="lower", aspect="auto", cmap=r.SEQ, vmin=0, vmax=1, extent=[0, dur, 0, RATE / 2000])
axes[0].set_title("Mask: share of each time-frequency cell removed (dark = removed)"); axes[0].set_ylabel("kHz"); axes[0].grid(False)
cb = fig.colorbar(im, ax=axes[0], fraction=0.03, pad=0.01); cb.set_ticks([0, 0.5, 1]); cb.outline.set_visible(False)
for s, e in segments(labels.astype(float), 0.5, min_s=0.0, gap_s=0.0):
    axes[1].axvspan(s, e, color=r.GRID, linewidth=0)
axes[1].plot(np.arange(len(prob)) * HOP / RATE, prob, color=r.MODEL, linewidth=1.6)
axes[1].axhline(0.5, color=r.INK2, linewidth=0.8, linestyle=(0, (3, 3)))
axes[1].set_ylim(0, 1.02); axes[1].set_xlabel("seconds")
axes[1].set_title("Handling probability per 10 ms (grey: where the label says handling)")
fig.savefig(OUT / "mask.png", dpi=110); plt.close(fig)
print("wrote", OUT / "input.png", "and", OUT / "mask.png")
