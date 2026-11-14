# Models

Exported ONNX models the API loads, copied into the Docker image. Raw data, runs and checkpoints stay out of git.

## handling-v1.onnx (what the API runs)
The whole handling filter in one graph: raw audio in, cleaned audio and handling probabilities out. The STFT
and inverse STFT are inside the graph, so the server (#90) needs no STFT or FFT code. Same weights as
`handling-poc.pt`. Rebuild with `uv run python -m kipml.export`; `handling-v1.json` records the I/O, the STFT
settings and how closely ONNX Runtime matches PyTorch.

- Input `pcm` float32 [1, N]: 16 kHz mono in [-1, 1] (16-bit samples divided by 32768), N >= 512.
- Output `clean` float32 [1, N]: the clip with handling noise removed.
- Output `handling` float32 [1, frames]: probability of handling noise per 10 ms frame, frames = 1 + N // 160.
  Above 0.5 counts as handling noise.

I/O, frame timing and threshold guidance: `ml/README.md` ("The model the API runs").

## handling-poc.onnx and handling-poc.pt (proof of concept)
`handling-poc.pt` holds the PyTorch weights (0.42M parameters, trained on a Lium RTX 3090). `kipml.infer`, the
notebook, fine-tuning and `kipml.export` all read it.

Trained by `ml/kipml/` on our venue recordings, placeholders and ESC-50 (see `ml/README.md`). In
`handling-poc.onnx` the STFT stays outside the graph, so the caller computes it (details in `handling-poc.json`):

- STFT: 16 kHz mono, n_fft 512, hop 160 (10 ms), Hann window 400 zero-padded to 512, centred.
- Input `features` [1, T, 257] = `log1p(10 * |STFT|)`.
- Output `mask` [1, T, 257]: multiply the complex STFT, then inverse STFT, for the cleaned clip.
- Output `logit` [1, T]: `sigmoid(logit) > 0.5` marks a 10 ms frame as handling noise.

`uv run python -m kipml.export --features-in --out <path>` still writes this older graph.
