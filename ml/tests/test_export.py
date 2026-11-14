"""handling-v1.onnx: raw audio in, cleaned audio and per-frame handling probabilities out."""
import json

import numpy as np
import onnx
import onnxruntime as ort
import pytest
import torch

from kipml.audio import HOP, ML_ROOT, N_BINS, RATE, read_wav
from kipml.evaluate import load_model
from kipml.export import MIN_SAMPLES, OPSET, TOLERANCE, HandlingFilter, main, probe_signal
from kipml.model import HandlingNet, count_params, enhance, stft

MODEL = ML_ROOT / "models" / "handling-v1.onnx"
WEIGHTS = ML_ROOT / "models" / "handling-poc.pt"
LENGTHS = (MIN_SAMPLES, 777, 4001, 10 * RATE)      # shortest allowed, odd, and a full 10-second clip


class PassThrough(torch.nn.Module):
    """Keeps every bin and flags nothing, so the filter must hand back its input."""

    def forward(self, feats):
        return torch.ones_like(feats), torch.zeros_like(feats[..., 0])


def session(path):
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


@pytest.fixture(scope="module")
def trained():
    net = load_model(WEIGHTS)
    return net, HandlingFilter(net).eval()


@pytest.mark.parametrize("n", LENGTHS)
def test_stft_in_the_graph_matches_torch_stft(n):
    x = torch.from_numpy(probe_signal(n, seed=n))[None]
    with torch.no_grad():
        spec = HandlingFilter(PassThrough()).spectrum(x)
    ref = stft(x).transpose(1, 2)
    assert spec.shape[2] == ref.shape[2] == 1 + n // HOP
    assert torch.allclose(spec[:, :N_BINS], ref.real, atol=1e-4)
    assert torch.allclose(spec[:, N_BINS:], ref.imag, atol=1e-4)


@pytest.mark.parametrize("n", LENGTHS)
def test_identity_mask_gives_back_the_input(n):
    x = torch.from_numpy(probe_signal(n, seed=n))[None]
    with torch.no_grad():
        clean, prob = HandlingFilter(PassThrough())(x)
    assert clean.shape == x.shape and prob.shape == (1, 1 + n // HOP)
    assert torch.allclose(clean, x, atol=1e-5)


def test_committed_model_has_the_contract():
    model = onnx.load(str(MODEL))
    onnx.checker.check_model(model)
    assert max(o.version for o in model.opset_import if o.domain in ("", "ai.onnx")) >= OPSET
    assert [i.name for i in model.graph.input] == ["pcm"]
    assert [o.name for o in model.graph.output] == ["clean", "handling"]
    assert MODEL.stat().st_size < 10 * 1024 * 1024
    meta = json.loads(MODEL.with_suffix(".json").read_text())
    assert meta["model"] == "handling-v1" and meta["frames_per_second"] == RATE // HOP
    assert meta["min_samples"] == MIN_SAMPLES and meta["threshold"] == 0.5


@pytest.mark.parametrize("n", LENGTHS)
def test_committed_model_matches_pytorch_at_any_length(n, trained):
    _, model = trained
    x = probe_signal(n, seed=n)
    clean, prob = session(MODEL).run(None, {"pcm": x[None]})
    assert clean.shape == (1, n) and prob.shape == (1, 1 + n // HOP)
    with torch.no_grad():
        clean_t, prob_t = model(torch.from_numpy(x)[None])
    assert np.abs(clean - clean_t.numpy()).max() < TOLERANCE
    assert np.abs(prob - prob_t.numpy()).max() < TOLERANCE


def test_committed_model_matches_enhance_on_a_real_take(trained):
    net, _ = trained
    x = read_wav(ML_ROOT / "audio" / "ours" / "venue_pickup_01.wav")     # held out: five drops of the phone
    clean, prob = session(MODEL).run(None, {"pcm": x[None]})
    clean_ref, prob_ref = enhance(net, x)
    assert np.abs(clean[0] - clean_ref).max() < TOLERANCE
    assert np.abs(prob[0] - prob_ref).max() < TOLERANCE
    assert 0 < (prob[0] > 0.5).mean() < 0.2


def test_exports_from_an_untrained_checkpoint(tmp_path):
    torch.manual_seed(0)
    net = HandlingNet()
    checkpoint = tmp_path / "untrained.pt"
    torch.save({"state_dict": net.state_dict(), "config": {"ch": 16, "hidden": 96}, "steps": 0}, checkpoint)
    out = tmp_path / "handling-v1.onnx"
    main(["--checkpoint", str(checkpoint), "--out", str(out)])
    meta = json.loads(out.with_suffix(".json").read_text())
    assert meta["parameters"] == count_params(net) and meta["config"] == {"ch": 16, "hidden": 96}
    assert meta["max_abs_diff_vs_pytorch"] < TOLERANCE and meta["max_abs_diff_vs_enhance"] < TOLERANCE
    clean, prob = session(out).run(None, {"pcm": probe_signal(RATE)[None]})
    assert clean.shape == (1, RATE) and prob.shape == (1, 1 + RATE // HOP)


def test_features_in_export_still_works(tmp_path):
    out = tmp_path / "handling-poc.onnx"
    main(["--features-in", "--checkpoint", str(WEIGHTS), "--out", str(out)])
    sess = session(out)
    assert [i.name for i in sess.get_inputs()] == ["features"]
    assert [o.name for o in sess.get_outputs()] == ["mask", "logit"]
