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

# 3. Before and after in one picture: grey is the recording, blue is what the model kept.
#    Any grey left showing is what was suppressed.
REP = ML / "reports" / "handling-gpu" / "audio"


def overlay(ax, before, after, title, after_color=r.MODEL, after_label="after"):
    r._envelope(ax, before, r.INPUT)
    r._envelope(ax, after, after_color)
    lim = np.abs(before).max() * 1.08
    ax.set_ylim(-lim, lim); ax.set_yticks([]); ax.set_title(title)
    ax.annotate("before", (1.002, 0.62), xycoords="axes fraction", color=r.INK2, va="center")
    ax.annotate(after_label, (1.002, 0.38), xycoords="axes fraction", color=after_color, va="center")


pick_in, pick_out = read_wav(REP / "venue_pickup_01_input.wav"), read_wav(REP / "venue_pickup_01_kip.wav")
pock_in, pock_out = read_wav(REP / "venue_pocket_02_input.wav"), read_wav(REP / "venue_pocket_02_kip.wav")
fig, axes = plt.subplots(3, 1, figsize=(10, 7.6), constrained_layout=True, gridspec_kw={"height_ratios": [1, 1, 1]})
overlay(axes[0], pick_in, pick_out, "Phone set down five times (held out): the grey spikes are what the model removed")
axes[0].set_xlabel("seconds")
t0 = 3.78                                                   # zoom on the third drop
a, b = int(t0 * RATE), int((t0 + 0.30) * RATE)
tz = np.arange(b - a) / RATE * 1000
axes[1].plot(tz, pick_in[a:b], color=r.INPUT, linewidth=0.9)
axes[1].plot(tz, pick_out[a:b], color=r.MODEL, linewidth=1.2)
lim = np.abs(pick_in[a:b]).max() * 1.08
axes[1].set_ylim(-lim, lim); axes[1].set_yticks([]); axes[1].set_xlim(0, tz[-1])
axes[1].set_title("Zoom on one drop (300 ms of raw samples): the impact goes, the room underneath stays")
axes[1].set_xlabel("milliseconds")
axes[1].annotate("before", (1.002, 0.62), xycoords="axes fraction", color=r.INK2, va="center")
axes[1].annotate("after", (1.002, 0.38), xycoords="axes fraction", color=r.MODEL, va="center")
overlay(axes[2], pock_in, pock_out, "Phone in a pocket while walking (held out): rustle bursts thinned, room kept")
axes[2].set_xlabel("seconds")
fig.savefig(OUT / "before_after.png", dpi=110); plt.close(fig)

# 4. Model against a spectral gate on the same held-out mixture, with the right answer underneath
mix, kip = read_wav(REP / "mixture_input.wav"), read_wav(REP / "mixture_kip.wav")
gate, target = read_wav(REP / "mixture_gate.wav"), read_wav(REP / "mixture_true_background.wav")
scores = __import__("json").loads((ML / "reports" / "handling-gpu" / "summary.json").read_text())["mixture_example_si_sdr_db"]
fig, axes = plt.subplots(3, 1, figsize=(10, 6.4), sharex=True, constrained_layout=True)
overlay(axes[0], mix, kip, f"Kip model: drops removed, room kept (SI-SDR {scores['input']:+.1f} to {scores['model']:+.1f} dB)")
overlay(axes[1], mix, gate, f"Spectral gate: drops left in, room thinned (SI-SDR {scores['input']:+.1f} to {scores['gate']:+.1f} dB)",
        after_color=r.GATE)
r._envelope(axes[2], target, r.TRUTH)
lim = np.abs(mix).max() * 1.08
axes[2].set_ylim(-lim, lim); axes[2].set_yticks([])
axes[2].set_title("The right answer: background plus the quiet parts of the take")
axes[2].annotate("target", (1.002, 0.5), xycoords="axes fraction", color=r.INK2, va="center")
axes[2].set_xlabel("seconds")
fig.savefig(OUT / "model_vs_gate.png", dpi=110); plt.close(fig)
print("wrote", OUT / "before_after.png", "and", OUT / "model_vs_gate.png")
