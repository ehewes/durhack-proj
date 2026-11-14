"""Training examples mixed on the fly: night background plus phone-handling noise at a random SNR.

Sources (all 16 kHz mono WAV under ml/audio/):
- handling: ours/ (real, weighted 0.7) and synthetic/handling/ (placeholders, 0.3); room tone excluded
- background: online/background/ (ESC-50), plus private/ room tone and Watch audio when present locally

Splits are by source file, so test sounds are never heard in training. Frame labels mark where the
handling clip is louder than its own noise floor (10th percentile frame energy) by LABEL_MARGIN_DB and,
for our venue takes, louder than the venue itself: the 90th percentile of the room tone plus 3 dB
(14 dB over the take's floor when no room tone is present). The training target keeps the quiet
parts of each take, so the model learns to remove handling bursts, not the room around them.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .audio import AUDIO, HOP, RATE, frame_db, read_wav

LABEL_MARGIN_DB = 8.0
TEST_OURS = ("sleeve_03", "pickup_01", "pocket_02")   # one held-out take per kind that has two or more
SNR_DB = (-5.0, 20.0)


@dataclass
class Clip:
    name: str
    x: np.ndarray
    floor_db: float = 0.0
    venue_floor_db: float | None = None   # set for our venue takes
    venue: bool = False


def handling_labels(h: np.ndarray, clip: Clip) -> np.ndarray:
    """Frames of an unscaled handling clip that are handling noise, not the room behind it."""
    thr = clip.floor_db + LABEL_MARGIN_DB
    if clip.venue:
        thr = max(thr, clip.venue_floor_db + 3.0) if clip.venue_floor_db is not None else clip.floor_db + 14.0
    return frame_db(h) > thr


def frames_to_samples(labels: np.ndarray, n: int) -> np.ndarray:
    """Per-frame 0/1 labels to a per-sample mask with 20 ms soft edges (no clicks)."""
    m = np.repeat(labels.astype(np.float32), HOP)[:n]
    if len(m) < n:
        m = np.pad(m, (0, n - len(m)))
    k = np.hanning(321).astype(np.float32); k /= k.sum()
    return np.clip(np.convolve(m, k, mode="same"), 0.0, 1.0)


def _clips(paths) -> list[Clip]:
    out = []
    for p in sorted(paths):
        x = read_wav(p)
        if len(x) >= RATE:  # at least 1 s
            out.append(Clip(p.name, x, float(np.percentile(frame_db(x), 10))))
    return out


def load_sources(root: Path = AUDIO) -> dict[str, dict[str, list[Clip]]]:
    """{'handling': {'train': [...], 'test': [...]}, 'background': {...}} with a 'kind' per clip."""
    ours = [p for p in (root / "ours").glob("*.wav") if "roomtone" not in p.name]
    synth = sorted((root / "synthetic" / "handling").glob("*.wav"))
    online = sorted((root / "online" / "background").glob("*/*.wav"))
    private = sorted((root / "private").glob("*.wav"))

    def split(paths, is_test):
        return [p for p in paths if not is_test(p)], [p for p in paths if is_test(p)]

    ours_tr, ours_te = split(ours, lambda p: any(t in p.name for t in TEST_OURS))
    room = sorted((root / "private").glob("*roomtone*.wav")) + sorted((root / "ours").glob("*roomtone*.wav"))
    floor_file = root / "ours" / "venue_floor.json"
    if room:
        venue_floor = float(np.percentile(frame_db(read_wav(room[0])), 90))
    elif floor_file.exists():   # the private room tone is not on this machine: use the committed number
        venue_floor = float(__import__("json").loads(floor_file.read_text())["venue_floor_db"])
    else:
        venue_floor = None
    syn_tr, syn_te = synth[:-4], synth[-4:]
    onl_tr, onl_te = split(online, lambda p: "_5-" in p.name)   # ESC-50 fold 5 is the test fold

    def venue(clips):
        for c in clips:
            c.venue, c.venue_floor_db = True, venue_floor
        return clips

    src = {"handling": {"train": {"ours": venue(_clips(ours_tr)), "synthetic": _clips(syn_tr)},
                        "test": {"ours": venue(_clips(ours_te)), "synthetic": _clips(syn_te)}},
           "background": {"train": _clips(onl_tr), "test": _clips(onl_te)}}
    for p in private:  # long recordings: first 80% train, last 20% test
        x = read_wav(p)
        cut = int(len(x) * 0.8)
        for part, seg in (("train", x[:cut]), ("test", x[cut:])):
            src["background"][part].append(Clip(f"{p.name}[{part}]", seg, float(np.percentile(frame_db(seg), 10))))
    return src


def _crop(rng, x: np.ndarray, n: int) -> tuple[np.ndarray, int]:
    if len(x) < n:
        reps = int(np.ceil(n / len(x)))
        x = np.tile(x, reps)
    start = int(rng.integers(0, len(x) - n + 1))
    return x[start:start + n].copy(), start


def make_example(rng, src, split: str, seconds: float = 4.0, p_handling: float = 0.75):
    """Returns (mix, clean, frame_labels, has_handling). clean = background plus the take's quiet parts."""
    n = int(seconds * RATE)
    frames = 1 + n // HOP
    bg_clip = src["background"][split][int(rng.integers(len(src["background"][split])))]
    bg, _ = _crop(rng, bg_clip.x, n)
    labels = np.zeros(frames, dtype=np.float32)
    has = rng.random() < p_handling
    mix, clean = bg.copy(), bg.copy()
    if has:
        pools = src["handling"][split]
        pool = pools["ours"] if pools["ours"] and rng.random() < 0.7 else (pools["synthetic"] or pools["ours"])
        clip = pool[int(rng.integers(len(pool)))]
        h, _ = _crop(rng, clip.x, n)
        labels = handling_labels(h, clip).astype(np.float32)
        keep = 1.0 - frames_to_samples(labels, n)
        p_h = np.mean(h ** 2)
        p_b = np.mean(bg ** 2) + 1e-10
        snr = rng.uniform(*SNR_DB)
        h *= np.sqrt(p_b * 10 ** (snr / 10) / (p_h + 1e-12))
        mix = bg + h
        clean = bg + h * keep
    peak = 10 ** (rng.uniform(-30, -3) / 20)
    g = peak / (np.abs(mix).max() + 1e-9)
    return (mix * g).astype(np.float32), (clean * g).astype(np.float32), labels, has


def batch(rng, src, split: str, size: int, seconds: float = 4.0):
    ex = [make_example(rng, src, split, seconds) for _ in range(size)]
    mix, clean, lab, has = zip(*ex)
    return np.stack(mix), np.stack(clean), np.stack(lab), np.array(has)
