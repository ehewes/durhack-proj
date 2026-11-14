"""Generate extra handling-noise and background clips with ElevenLabs Sound Effects.

Needs ELEVENLABS_API_KEY in the environment (never paste it into a prompt). Writes 16 kHz mono
WAV to ml/audio/generated/elevenlabs/<category>/ and records each prompt in SOURCES.md.
Untested until a key exists; check the API reference if a request fails.

    ELEVENLABS_API_KEY=... python3 ml/scripts/generate_elevenlabs_sfx.py [--takes 3]
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, urllib.request
from pathlib import Path

AUDIO = Path(__file__).resolve().parents[1] / "audio"
OUT = AUDIO / "generated" / "elevenlabs"
PROMPTS = {
    "handling": [
        "close-up fabric rustling directly against a phone microphone, sleeve brushing over it",
        "phone in a jeans pocket while someone shifts position, muffled cloth friction",
        "bedsheets rustling as a sleeper turns over next to a phone on the mattress",
        "phone picked up and put down on a wooden bedside table, small knocks",
    ],
    "construction": ["distant pneumatic drilling at night heard through a closed window"],
    "traffic": ["occasional cars passing on a wet city street at night, heard from a bedroom"],
    "siren": ["ambulance siren passing two streets away at night"],
}


def generate(prompt, seconds, key):
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/sound-generation",
        data=json.dumps({"text": prompt, "duration_seconds": seconds}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def to_wav(mp3_bytes, dst):
    with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
        tmp.write(mp3_bytes); tmp.flush()
        if shutil.which("afconvert"):
            cmd = ["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", tmp.name, str(dst)]
        else:
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", str(dst)]
        subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--takes", type=int, default=3)
    ap.add_argument("--seconds", type=float, default=5.0)
    args = ap.parse_args()
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("Set ELEVENLABS_API_KEY first (from .env).")
    rows = []
    for cat, prompts in PROMPTS.items():
        for pi, prompt in enumerate(prompts):
            for take in range(args.takes):
                dst = OUT / cat / f"elevenlabs_{cat}_{pi:02d}_{take:02d}.wav"
                dst.parent.mkdir(parents=True, exist_ok=True)
                if not dst.exists():
                    to_wav(generate(prompt, args.seconds, key), dst)
                rows.append(f"| `{dst.relative_to(AUDIO)}` | {cat} | {prompt} |")
                print("✓", dst.relative_to(AUDIO))
    sys.path.insert(0, str(Path(__file__).parent))
    from fetch_esc50 import write_section  # shared SOURCES.md writer
    write_section("ElevenLabs", "\n".join(["## ElevenLabs Sound Effects (generated)", "",
        "Generated with the ElevenLabs Sound Effects API under our account's terms.", "",
        "| File | Category | Prompt |", "|---|---|---|"] + rows))


if __name__ == "__main__":
    main()
