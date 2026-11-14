"""Audio I/O and framing shared by data, training and inference. 16 kHz mono everywhere."""
from __future__ import annotations

import shutil, subprocess, tempfile, wave
from pathlib import Path

import numpy as np

RATE = 16000
N_FFT = 512
HOP = 160          # 10 ms frames: 100 frames per second
WIN = 400          # 25 ms Hann window
N_BINS = N_FFT // 2 + 1
ML_ROOT = Path(__file__).resolve().parents[1]
AUDIO = ML_ROOT / "audio"


def read_wav(path: str | Path) -> np.ndarray:
    """16-bit PCM WAV at 16 kHz to float32 mono in [-1, 1]."""
    with wave.open(str(path)) as w:
        if w.getsampwidth() != 2 or w.getframerate() != RATE:
            raise ValueError(f"{path}: expected 16-bit {RATE} Hz WAV")
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
        return x.reshape(-1, w.getnchannels()).mean(axis=1)


def write_wav(path: str | Path, x: np.ndarray) -> None:
    pcm = (np.clip(x, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes())


def load_any(path: str | Path) -> np.ndarray:
    """Any audio file (m4a, wav, caf, mp3) to 16 kHz mono float32, via afconvert or ffmpeg."""
    path = Path(path)
    try:
        return read_wav(path)
    except (ValueError, wave.Error, EOFError):
        pass
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "x.wav"
        if shutil.which("afconvert"):
            cmd = ["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", str(path), str(out)]
        elif shutil.which("ffmpeg"):
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-sample_fmt", "s16", str(out)]
        else:
            raise RuntimeError("need afconvert (macOS) or ffmpeg to read " + str(path))
        subprocess.run(cmd, check=True)
        return read_wav(out)


def frame_db(x: np.ndarray) -> np.ndarray:
    """Per-frame energy in dB, aligned with a centred STFT (1 + len // HOP frames)."""
    pad = np.pad(x, (WIN // 2, WIN // 2))
    n = 1 + len(x) // HOP
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    idx = np.minimum(idx, len(pad) - 1)
    rms = np.sqrt(np.mean(pad[idx] ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-9)
