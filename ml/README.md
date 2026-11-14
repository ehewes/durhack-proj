# ml: Kip's handling-noise filter

Our own small model that removes phone-handling noise (sleeve, pocket, pillow, bedsheet rustle) from
spike clips before Gemini labels them. Plan and contracts: `docs/DOMAIN.md` (Noise
classification), `docs/ARCHITECTURE.md` (ML row, `ml` lane), `docs/DECISIONS.md`. Issues: #85 to #92.

## See it
**[MODEL.md](MODEL.md)**: how the model works, the theory behind it, and how it is measured.

**[notebooks/handling_poc.ipynb](notebooks/handling_poc.ipynb)**: the data, training curves, comparison with a
spectral noise gate, waveforms and spectrograms before and after, and real phone takes. GitHub renders it with every
chart; to play the audio and run it yourself: `uv sync --group dev && uv run jupyter lab notebooks/handling_poc.ipynb`.

## Results so far
The exported model (`models/handling-v1.onnx`, weights in `models/handling-poc.pt`) is the RTX 3090 run: 0.42M parameters, 15,000 steps, trained on a Lium
pod for $0.16. On held-out mixtures it improves SI-SDR by +11.9 dB (a spectral gate: -3.9 dB), removes 17.9 dB where
there is handling noise and 0.15 dB elsewhere, and flags handling frames with F1 0.91. On a real held-out drop take
it flags exactly the five drops (precision 0.96, recall 1.0) and removes them by 27.8 dB. Details: the notebook,
`reports/handling-gpu/` and `reports/handling-poc/` (the smaller Mac-trained model).

## Proof-of-concept model (`kipml/`)
HandlingNet: a small STFT mask model (about 0.2M parameters) that removes phone-handling noise and
flags the frames where it happens. Training mixes handling clips into background sounds on the fly
at -5 to +20 dB, so there is no mixture set on disk. Python 3.12 via `uv` (`ml/pyproject.toml`).

| Command (run inside `ml/`) | Does |
|---|---|
| `uv run python -m kipml.train --steps 2000 --device cpu` | Trains (about 10 min on an M1 Pro CPU; `--device cuda` on the Lium pod). Writes `checkpoints/handling-poc.pt` |
| `uv run python -m kipml.evaluate` | Scores held-out mixtures against a spectral-gating baseline |
| `uv run python -m kipml.infer <any recording>` | **Test on a device's recording** (m4a, wav, ...): writes `<name>.clean.wav` and prints the flagged moments |
| `uv run python -m kipml.export [--checkpoint <ckpt>]` | Writes `models/handling-v1.onnx` (raw audio in, STFT inside) from `models/handling-poc.pt` or any checkpoint, trained or not, and checks it against PyTorch. `--features-in` writes the older features graph |
| `uv run --group dev pytest` | Unit tests |
| `uv run python -m kipml.report [--name handling-gpu --checkpoint checkpoints/handling-gpu.pt]` | Charts, numbers and before/after audio in `reports/<name>/` |

Labels: a frame is handling noise when the take is louder there than its own floor by 8 dB and, for our venue
takes, louder than the venue (90th percentile of the private room tone plus 3 dB). The training target keeps the
quiet parts of each take, so the model removes handling bursts and leaves the room alone.

Splits are by source file: `sleeve_03`, `pickup_01` and `pocket_02` from our takes, the last four
synthetic clips, ESC-50 fold 5 and the last 20% of each private recording are never trained on.

## The model the API runs (`models/handling-v1.onnx`)
One ONNX file (opset 17, 2.4 MB) runs the whole filter: raw audio in, cleaned audio and handling probabilities
out. The STFT is a strided convolution with fixed DFT weights and the inverse STFT a transposed convolution, so the
server (#90) needs no STFT or FFT code: decode the 16-bit WAV clip, run the model, read the two outputs.

| | Name | Type and shape | Meaning |
|---|---|---|---|
| Input | `pcm` | float32 [1, N] | 16 kHz mono in [-1, 1]: 16-bit samples divided by 32768. N >= 512 |
| Output | `clean` | float32 [1, N] | The clip with handling noise removed: what goes on to labelling |
| Output | `handling` | float32 [1, frames] | Probability that each 10 ms frame is handling noise. frames = 1 + N // 160 |

- **Frames:** 100 per second. Frame `i` is centred on sample `160 * i`, time `i / 100` s, and covers 25 ms.
  A 10-second clip gives 1,001 frames.
- **Threshold:** a frame is handling noise when its probability is above 0.5. At 0.5 the model finds handling
  frames in held-out mixtures with precision 0.90, recall 0.92 and F1 0.91.
- **Clip rule (suggestion for #90):** a phone drop or rustle lasts 0.1 to 1 s. Judge the spike by the frames around
  its time in the clip rather than by the whole clip. If most of them are above 0.5, the event is `handling`.
- **Short input:** spike clips are 10 s long, so only tests go below 512 samples (32 ms). Zero-pad shorter input to
  512 samples and keep the first N samples and 1 + N // 160 frames, as `kipml.model.enhance` does.
- **Speed:** about 80 ms for a 10-second clip on one CPU thread in ONNX Runtime, STFT included.
- **Checks:** `tests/test_export.py` checks the in-graph STFT against `torch.stft`, an all-pass mask returns the
  input, and ONNX Runtime matches both PyTorch and `kipml.model.enhance` (the training path) within 1e-3. The
  measured gap is about 2e-6. `models/handling-v1.json` records it.

## Audio library
Every clip is 16 kHz mono 16-bit WAV. Licences and sources for every file: `audio/SOURCES.md`.

| Folder | What | Committed |
|---|---|---|
| `audio/ours/` | **Our recordings** from the demo iPhone: handling noise and room tone | yes |
| `audio/online/background/<category>/` | Night background sounds from ESC-50 (traffic, siren, construction, aircraft, rail, snoring, breathing, weather, room, footsteps). CC BY-NC 3.0 | yes |
| `audio/synthetic/handling/` | **Placeholder** procedural rustle, scrapes and bumps, with `labels.json` intervals, until real recordings exist | yes |
| `audio/generated/elevenlabs/` | Extra handling and background clips from ElevenLabs Sound Effects (once a key exists) | yes |
| `audio/private/` | Recordings with other people's conversation (venue room tone, Watch audio): training on the local machine or the Lium pod only | no |
| `audio/inbox/` | Drop folder for raw Voice Memos files | no |

## Add your recordings
1. Record on the demo iPhone with Voice Memos (Settings, Voice Memos, Audio Quality: Lossless).
   Background noise is fine; avoid nearby, clear conversation. At each spot record 1 to 2 minutes of
   room tone with the phone untouched, then 20 to 30 second takes of each kind of handling.
2. AirDrop the files to a Mac and name them `<spot>_<kind>_<nn>`: `corridor_sleeve_01.m4a`,
   `corridor_roomtone.m4a`. Kinds: sleeve, pocket, pillow, sheet, bedsheet, hoodie, jacket, pickup,
   bag, handling, roomtone.
3. Put them in `ml/audio/inbox/` and run `python3 ml/scripts/import_recordings.py`.
4. Scan for speech before committing (macOS): `swiftc -O ml/scripts/sound_windows.swift -o /tmp/sound_windows`,
   then `/tmp/sound_windows <file.wav>`. Cut any window with speech confidence 0.5 or more; anything full of
   conversation goes to `audio/private/` instead. Provenance for each clip goes in `audio/ours/RECORDINGS.md`.
5. Commit `ml/audio/ours/` on a branch and open a PR, or ask an agent to. Keep each take under 30 s.

## Scripts
| Script | Does |
|---|---|
| `uv run ml/scripts/fetch_esc50.py [--per-class 6]` | Downloads ESC-50 background clips and rewrites their section of `SOURCES.md` |
| `uv run ml/scripts/make_synthetic_handling.py` | Regenerates the placeholder handling clips (seeded) |
| `python3 ml/scripts/import_recordings.py` | Converts `audio/inbox/` into `audio/ours/` (macOS `afconvert`, or `ffmpeg`) |
| `ml/scripts/sound_windows.swift` | Apple sound classifier over a file in windows: top label and speech confidence per window (macOS) |
| `ELEVENLABS_API_KEY=... python3 ml/scripts/generate_elevenlabs_sfx.py` | Generates extra clips with ElevenLabs Sound Effects; untested until the key exists |

Training data mixtures, runs and checkpoints are generated from this library and stay out of git.

## Licences
ESC-50 is CC BY-NC 3.0: fine for this non-commercial hackathon prototype with attribution, not for
a commercial product. Before Kip ships commercially, retrain on our own recordings and CC0 or CC BY data.
