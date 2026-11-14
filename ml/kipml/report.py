"""Charts and listening examples for a trained HandlingNet.

    uv run python -m kipml.report [--checkpoint ...] [--run ml/runs/<latest>] [--n 150]

Writes to ml/reports/handling-poc/:
  training.png               loss curves from the training run
  suppression.png            quality gain and how much each method removes, model vs spectral gate
  mixture_waveforms.png      a held-out mixture with ground truth: waveforms and detection
  mixture_spectrograms.png   the same mixture as spectrograms: input, model, gate, true background
  real_<take>.png            our held-out real takes: before, after, what was removed
  audio/*.wav                before and after files to listen to
  REPORT.md                  the numbers and the charts
Colours follow the dataviz reference palette (validated): blue = model, orange = spectral gate,
aqua = true background (always text-labelled), grey = input.
"""
from __future__ import annotations

import argparse, json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
import numpy as np
import torch

from .audio import AUDIO, HOP, ML_ROOT, RATE, frame_db, read_wav, write_wav
from .data import Clip, _crop, frames_to_samples, handling_labels, load_sources, make_example
from .evaluate import load_model, si_sdr, spectral_gate
from .infer import segments
from .model import enhance, stft

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e1"
MODEL, GATE, TRUTH, INPUT = "#2a78d6", "#eb6834", "#1baf7a", "#8a8984"
SEQ = LinearSegmentedColormap.from_list("blue_seq", [SURFACE, "#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"])
OUT = ML_ROOT / "reports" / "handling-poc"

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "text.color": INK, "axes.labelcolor": INK2, "axes.edgecolor": GRID, "xtick.color": INK2, "ytick.color": INK2,
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6,
    "axes.titlesize": 10.5, "axes.titleweight": "bold", "axes.titlelocation": "left", "font.size": 9, "legend.frameon": False,
})


def _envelope(ax, x, color, label=None):
    """Min/max envelope per 10 ms: readable at any length, unlike plotting every sample."""
    n = len(x) // HOP
    seg = x[: n * HOP].reshape(n, HOP)
    t = np.arange(n) * HOP / RATE
    ax.fill_between(t, seg.min(1), seg.max(1), color=color, linewidth=0, label=label)
    ax.set_xlim(0, len(x) / RATE)


def _spec_db(x):
    mag = stft(torch.from_numpy(np.ascontiguousarray(x))[None]).abs()[0].numpy().T
    return 20 * np.log10(mag + 1e-6)


def _spectrogram(ax, x, title, vmax):
    ax.imshow(_spec_db(x), origin="lower", aspect="auto", cmap=SEQ, vmin=vmax - 70, vmax=vmax,
              extent=[0, len(x) / RATE, 0, RATE / 2000])
    ax.set_title(title); ax.set_ylabel("kHz"); ax.grid(False)


def training_chart(run_dir: Path):
    hist = json.load(open(run_dir / "metrics.json"))["history"]
    steps = [h["step"] for h in hist]
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.4), constrained_layout=True)
    ax = axes[0]
    for key, color, name in (("train", MODEL, "train"), ("val", GATE, "held-out")):
        ax.plot(steps, [h[key] for h in hist], color=color, linewidth=1.8, label=name)
        ax.annotate(name, (steps[-1], hist[-1][key]), xytext=(4, 0), textcoords="offset points", color=INK2, va="center")
    ax.set_title("Total loss"); ax.set_xlabel("training step"); ax.legend(loc="upper right")
    for ax, key, title in ((axes[1], "val_spec", "Suppression loss (held-out)"), (axes[2], "val_frame_bce", "Detection loss (held-out)")):
        ax.plot(steps, [h[key] for h in hist], color=MODEL, linewidth=1.8)
        ax.set_title(title); ax.set_xlabel("training step")
    for ax in axes:
        ax.set_ylim(bottom=0)
    fig.suptitle("HandlingNet training (held-out = mixtures it never trained on)", x=0.01, ha="left", fontsize=11.5, fontweight="bold")
    fig.savefig(OUT / "training.png", dpi=115)
    plt.close(fig)


def suppression_stats(model, src, n):
    rng = np.random.default_rng(2026)
    imp = {"model": [], "gate": []}
    red = {("model", "handling"): [], ("model", "background"): [], ("gate", "handling"): [], ("gate", "background"): []}
    tp = fp = fn = 0
    for _ in range(n):
        mix, clean, labels, has = make_example(rng, src, "test", 4.0)
        out, prob = enhance(model, mix)
        gate = spectral_gate(mix)
        f_in = frame_db(mix)
        lab = labels.astype(bool) if has else np.zeros(len(f_in), bool)
        for name, y in (("model", out), ("gate", gate)):
            drop = f_in - frame_db(y)
            if lab.any():
                red[(name, "handling")].append(float(np.mean(drop[lab])))
            if (~lab).any():
                red[(name, "background")].append(float(np.mean(drop[~lab])))
        if has:
            base = si_sdr(mix, clean)
            imp["model"].append(si_sdr(out, clean) - base)
            imp["gate"].append(si_sdr(gate, clean) - base)
            pred = prob[: len(lab)] > 0.5
            tp += int((pred & lab).sum()); fp += int((pred & ~lab).sum()); fn += int((~pred & lab).sum())
    prec, rec = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
    return {"si_sdr_improvement_db": {k: round(float(np.median(v)), 2) for k, v in imp.items()},
            "energy_removed_db": {f"{m}_{k}": round(float(np.mean(v)), 2) for (m, k), v in red.items()},
            "detection": {"precision": round(prec, 3), "recall": round(rec, 3), "f1": round(2 * prec * rec / max(prec + rec, 1e-9), 3)},
            "mixtures": n}


def suppression_chart(stats):
    fig, axes = plt.subplots(1, 2, figsize=(11, 3.6), constrained_layout=True)
    ax = axes[0]
    vals = [stats["si_sdr_improvement_db"]["model"], stats["si_sdr_improvement_db"]["gate"]]
    bars = ax.bar(["Kip model", "Spectral gate"], vals, color=[MODEL, GATE], width=0.5, edgecolor=SURFACE, linewidth=2)
    for b, v in zip(bars, vals):
        ax.annotate(f"{v:+.1f} dB", (b.get_x() + b.get_width() / 2, v), xytext=(0, 4 if v >= 0 else -12),
                    textcoords="offset points", ha="center", color=INK)
    ax.axhline(0, color=INK2, linewidth=0.8)
    lo, hi = min(vals + [0]), max(vals + [0])
    ax.set_ylim(lo - 0.25 * (hi - lo + 1), hi + 0.25 * (hi - lo + 1))
    ax.grid(axis="x", visible=False)
    ax.set_title("Quality gain on held-out mixtures"); ax.set_ylabel("SI-SDR improvement (dB, median)")
    ax = axes[1]
    groups = ["Handling-noise frames", "Background-only frames"]
    x = np.arange(len(groups)); w = 0.34
    er = stats["energy_removed_db"]
    for i, (name, color, label) in enumerate((("model", MODEL, "Kip model"), ("gate", GATE, "Spectral gate"))):
        v = [er[f"{name}_handling"], er[f"{name}_background"]]
        bs = ax.bar(x + (i - 0.5) * w, v, width=w, color=color, edgecolor=SURFACE, linewidth=2, label=label)
        for b, val in zip(bs, v):
            ax.annotate(f"{val:.1f}", (b.get_x() + b.get_width() / 2, val), xytext=(0, 3), textcoords="offset points", ha="center", color=INK)
    ax.set_xticks(x, groups); ax.axhline(0, color=INK2, linewidth=0.8)
    top = max([0] + [abs(v) for v in er.values()])
    ax.set_ylim(min([0] + list(er.values())) * 1.2, top * 1.45 + 0.5)
    ax.grid(axis="x", visible=False)
    ax.set_title("How much each method removes"); ax.set_ylabel("energy removed (dB, mean)")
    ax.legend(loc="upper center", ncol=2)
    fig.suptitle("Suppression on held-out mixtures: Kip model vs a spectral noise gate",
                 x=0.01, ha="left", fontsize=11.5, fontweight="bold")
    fig.savefig(OUT / "suppression.png", dpi=115)
    plt.close(fig)


def mixture_example(model, src):
    """A held-out mixture built from one of our real test takes, with its true background."""
    rng = np.random.default_rng(7)
    ours = src["handling"]["test"]["ours"]
    clip = next(c for c in ours if "pickup" in c.name)
    bg_clip = next(c for c in src["background"]["test"] if "traffic" in c.name or "engine" in c.name) if any(
        "engine" in c.name for c in src["background"]["test"]) else src["background"]["test"][0]
    n = min(len(clip.x), 6 * RATE)
    h, _ = _crop(rng, clip.x, n)
    bg, _ = _crop(rng, bg_clip.x, n)
    labels = handling_labels(h, clip)                      # on the unscaled take, as in training
    keep = 1.0 - frames_to_samples(labels.astype(np.float32), n)
    h *= np.sqrt(np.mean(bg ** 2) * 10 ** (5 / 10) / (np.mean(h ** 2) + 1e-12))
    mix, bg = bg + h, bg + h * keep                        # bg becomes the true target: background plus quiet parts
    g = 0.3 / (np.abs(mix).max() + 1e-9)
    mix, bg = (mix * g).astype(np.float32), (bg * g).astype(np.float32)
    out, prob = enhance(model, mix)
    gate = spectral_gate(mix)
    scores = {k: si_sdr(y, bg) for k, y in (("input", mix), ("model", out), ("gate", gate))}

    fig, axes = plt.subplots(5, 1, figsize=(11, 8.2), sharex=True, constrained_layout=True,
                             gridspec_kw={"height_ratios": [1, 1, 1, 1, 0.9]})
    lim = np.abs(mix).max() * 1.05
    for ax, y, color, title in ((axes[0], mix, INPUT, f"Input: background plus our real drop take ({scores['input']:.1f} dB SI-SDR)"),
                                (axes[1], out, MODEL, f"Kip model output ({scores['model']:.1f} dB)"),
                                (axes[2], gate, GATE, f"Spectral gate output ({scores['gate']:.1f} dB)"),
                                (axes[3], bg, TRUTH, "Target: background plus the take's quiet parts (what a perfect filter returns)")):
        _envelope(ax, y, color); ax.set_ylim(-lim, lim); ax.set_title(title); ax.set_yticks([])
    ax = axes[4]
    t = np.arange(len(prob)) * HOP / RATE
    for s, e in segments(labels.astype(float), 0.5):
        ax.axvspan(s, e, color=GRID, linewidth=0)
    ax.plot(t, prob, color=MODEL, linewidth=1.5)
    ax.axhline(0.5, color=INK2, linewidth=0.8, linestyle=(0, (3, 3)))
    ax.annotate("threshold 0.5", (t[-1], 0.5), xytext=(-4, 4), textcoords="offset points", ha="right", color=INK2)
    ax.set_ylim(0, 1); ax.set_title("Handling probability per 10 ms (grey bands: where handling noise really is)")
    ax.set_xlabel("seconds")
    fig.savefig(OUT / "mixture_waveforms.png", dpi=115); plt.close(fig)

    vmax = _spec_db(mix).max()
    fig, axes = plt.subplots(4, 1, figsize=(11, 8), sharex=True, constrained_layout=True)
    for ax, y, title in ((axes[0], mix, "Input"), (axes[1], out, "Kip model output"),
                         (axes[2], gate, "Spectral gate output"), (axes[3], bg, "True background")):
        _spectrogram(ax, y, title, vmax)
    axes[-1].set_xlabel("seconds")
    fig.suptitle("Spectrograms on one colour scale (darker = louder)",
                 x=0.01, ha="left", fontsize=11.5, fontweight="bold")
    fig.savefig(OUT / "mixture_spectrograms.png", dpi=115); plt.close(fig)
    for name, y in (("mixture_input", mix), ("mixture_kip", out), ("mixture_gate", gate), ("mixture_true_background", bg)):
        write_wav(OUT / "audio" / f"{name}.wav", y)
    return {k: round(v, 2) for k, v in scores.items()}


def real_take(model, path: Path, venue_floor_db):
    x = read_wav(path)
    out, prob = enhance(model, x)
    removed = x - out
    segs = segments(prob, 0.5, min_s=0.03)
    clip = Clip(path.name, x, float(np.percentile(frame_db(x), 10)), venue_floor_db, True)
    lab = handling_labels(x, clip)                      # the same rule training used
    pred = prob[: len(lab)] > 0.5
    drop = frame_db(x) - frame_db(out)
    fig, axes = plt.subplots(6, 1, figsize=(11, 10), sharex=True, constrained_layout=True,
                             gridspec_kw={"height_ratios": [1, 1, 1, 0.8, 1.3, 1.3]})
    lim = np.abs(x).max() * 1.05
    for ax, y, color, title in ((axes[0], x, INPUT, "Recorded on the iPhone (held out: never trained on)"),
                                (axes[1], out, MODEL, "After the Kip model"),
                                (axes[2], removed, GATE, "What the model removed")):
        _envelope(ax, y, color); ax.set_ylim(-lim, lim); ax.set_title(title); ax.set_yticks([])
    ax = axes[3]
    for s, e in segments(lab.astype(float), 0.5, min_s=0.0, gap_s=0.0):
        ax.axvspan(s, e, color=GRID, linewidth=0)
    ax.plot(np.arange(len(prob)) * HOP / RATE, prob, color=MODEL, linewidth=1.5)
    ax.axhline(0.5, color=INK2, linewidth=0.8, linestyle=(0, (3, 3)))
    ax.set_ylim(0, 1)
    ax.set_title(f"Handling probability (grey: louder than the venue, the training label): {len(segs)} events flagged")
    vmax = _spec_db(x).max()
    _spectrogram(axes[4], x, "Spectrogram before", vmax)
    _spectrogram(axes[5], out, "Spectrogram after", vmax)
    axes[-1].set_xlabel("seconds")
    fig.suptitle(f"{path.stem}: real phone-handling noise, before and after", x=0.01, ha="left", fontsize=11.5, fontweight="bold")
    fig.savefig(OUT / f"real_{path.stem}.png", dpi=115); plt.close(fig)
    write_wav(OUT / "audio" / f"{path.stem}_input.wav", x)
    write_wav(OUT / "audio" / f"{path.stem}_kip.wav", out)
    tp, fp, fn = int((pred & lab).sum()), int((pred & ~lab).sum()), int((~pred & lab).sum())
    return {"seconds": round(len(x) / RATE, 1), "handling_s": round(lab.mean() * len(x) / RATE, 2),
            "flagged_events": len(segs), "flagged_s": round(float(pred.mean()) * len(x) / RATE, 2),
            "precision": round(tp / max(tp + fp, 1), 2), "recall": round(tp / max(tp + fn, 1), 2),
            "removed_on_handling_db": round(float(drop[lab].mean()), 1) if lab.any() else None,
            "removed_elsewhere_db": round(float(drop[~lab].mean()), 1)}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=str(ML_ROOT / "checkpoints" / "handling-poc.pt"))
    ap.add_argument("--run", help="training run dir (default: latest with metrics.json)")
    ap.add_argument("--n", type=int, default=150)
    ap.add_argument("--name", default="handling-poc", help="report folder under ml/reports/")
    args = ap.parse_args(argv)
    global OUT
    OUT = ML_ROOT / "reports" / args.name
    (OUT / "audio").mkdir(parents=True, exist_ok=True)
    run = Path(args.run) if args.run else max((p.parent for p in (ML_ROOT / "runs").glob("*/metrics.json")), key=lambda p: p.name)
    model, src = load_model(args.checkpoint), load_sources()
    training_chart(run)
    stats = suppression_stats(model, src, args.n)
    suppression_chart(stats)
    example = mixture_example(model, src)
    vf = src["handling"]["test"]["ours"][0].venue_floor_db
    takes = {p.stem: real_take(model, p, vf) for p in sorted((AUDIO / "ours").glob("*.wav"))
             if any(t in p.name for t in ("sleeve_03", "pickup_01", "pocket_02"))}
    summary = {"run": run.name, **stats, "mixture_example_si_sdr_db": example, "real_takes": takes}
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1))
    hist = json.load(open(run / "metrics.json"))["history"]
    md = [f"# HandlingNet proof of concept ({args.name})", "",
          f"Trained {hist[-1]['step']} steps in {hist[-1]['secs'] // 60} min. Every number below is on "
          "audio the model never trained on. Regenerate with `uv run python -m kipml.report`.", "",
          "| Metric | Kip model | Spectral gate |", "|---|---|---|",
          f"| SI-SDR improvement, median ({stats['mixtures']} mixtures) | {stats['si_sdr_improvement_db']['model']:+.1f} dB | {stats['si_sdr_improvement_db']['gate']:+.1f} dB |",
          f"| Energy removed on handling-noise frames | {stats['energy_removed_db']['model_handling']:.1f} dB | {stats['energy_removed_db']['gate_handling']:.1f} dB |",
          f"| Energy removed on background-only frames | {stats['energy_removed_db']['model_background']:.1f} dB | {stats['energy_removed_db']['gate_background']:.1f} dB |",
          f"| Handling-frame detection (precision / recall / F1) | {stats['detection']['precision']:.2f} / {stats['detection']['recall']:.2f} / {stats['detection']['f1']:.2f} | n/a |", "",
          "Real held-out takes from the iPhone, scored against the training label rule (louder than the venue):", "",
          "| Take | Length | Handling (label) | Flagged | Precision / recall | Removed on handling | Removed elsewhere |", "|---|---|---|---|---|---|---|"]
    md += [f"| `{k}` | {v['seconds']} s | {v['handling_s']} s | {v['flagged_s']} s | {v['precision']} / {v['recall']} | "
           f"{v['removed_on_handling_db']} dB | {v['removed_elsewhere_db']} dB |" for k, v in takes.items()]
    md += ["", "## Training", "", "![training](training.png)", "", "## Suppression compared", "", "![suppression](suppression.png)", "",
           "## A held-out mixture with ground truth", "", "![waveforms](mixture_waveforms.png)", "", "![spectrograms](mixture_spectrograms.png)", "",
           "## Real takes from the phone", ""] + [f"![{k}](real_{k}.png)\n" for k in takes] + [
           "## Listen", "", "Before and after files are in `audio/`: `mixture_input.wav`, `mixture_kip.wav`, `mixture_gate.wav`, "
           "`mixture_true_background.wav`, and `<take>_input.wav` / `<take>_kip.wav` for each real take.", ""]
    (OUT / "REPORT.md").write_text("\n".join(md))
    print(json.dumps(summary, indent=1))
    print(f"report: {OUT / 'REPORT.md'}")


if __name__ == "__main__":
    main()
