# Models

Exported ONNX models the API loads, copied into the Docker image. `handling-v1.onnx` lands
here from the `ml` lane (#90). Raw data, runs and checkpoints stay out of git.

## handling-poc.onnx (proof of concept)
Trained by `ml/kipml/` on our venue recordings, placeholders and ESC-50 (see `ml/README.md`). The
STFT stays outside the graph, so the server computes it (details in `handling-poc.json`):

- STFT: 16 kHz mono, n_fft 512, hop 160 (10 ms), Hann window 400 zero-padded to 512, centred.
- Input `features` [1, T, 257] = `log1p(10 * |STFT|)`.
- Output `mask` [1, T, 257]: multiply the complex STFT, then inverse STFT, for the cleaned clip.
- Output `logit` [1, T]: `sigmoid(logit) > 0.5` marks a 10 ms frame as handling noise.

`handling-v1.onnx` (#88) will take raw audio instead, with the STFT inside the graph.
