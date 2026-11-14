"""Convert our own recordings from ml/audio/inbox/ into 16 kHz mono 16-bit WAV in ml/audio/ours/.

Drop Voice Memos files (.m4a), or .wav/.aiff/.caf/.mp3, into ml/audio/inbox/, named
<spot>_<kind>_<nn> (e.g. corridor_sleeve_01.m4a, corridor_roomtone.m4a), then run:

    python3 ml/scripts/import_recordings.py

Uses macOS `afconvert` (built in) or `ffmpeg` if present. Originals stay in the inbox, which
git ignores. Standard library only.
"""
import shutil, subprocess, sys, wave
from pathlib import Path

AUDIO = Path(__file__).resolve().parents[1] / "audio"
INBOX, OURS = AUDIO / "inbox", AUDIO / "ours"
KINDS = {"sleeve", "pocket", "pillow", "sheet", "bedsheet", "hoodie", "jacket", "pickup", "bag", "handling", "roomtone"}


def convert(src, dst):
    if shutil.which("afconvert"):
        cmd = ["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", str(src), str(dst)]
    elif shutil.which("ffmpeg"):
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", str(dst)]
    else:
        sys.exit("Need afconvert (macOS) or ffmpeg to convert audio")
    subprocess.run(cmd, check=True)


def main():
    OURS.mkdir(parents=True, exist_ok=True)
    files = [p for p in sorted(INBOX.iterdir()) if p.suffix.lower() in {".m4a", ".wav", ".aiff", ".aif", ".caf", ".mp3"}]
    if not files:
        print(f"Nothing in {INBOX}. Drop recordings there first.")
        return
    imported = 0
    for src in files:
        stem = "_".join(src.stem.lower().replace("-", " ").split()).replace("__", "_")
        parts = stem.split("_")
        if parts and parts[-1].isdigit():
            parts.pop()
        kind = parts.pop() if parts else ""
        if not parts or kind not in KINDS:
            print(f"! {src.name}: rename to <spot>_<kind>_<nn>, kind one of {', '.join(sorted(KINDS))}")
            continue
        dst = OURS / f"{stem}.wav"
        convert(src, dst)
        with wave.open(str(dst)) as w:
            secs = w.getnframes() / w.getframerate()
        print(f"✓ {src.name} -> ml/audio/ours/{dst.name} ({secs:.1f} s)")
        imported += 1
    if imported:
        print("Now commit ml/audio/ours/ on a branch and open a PR (or ask an agent to).")


if __name__ == "__main__":
    main()
