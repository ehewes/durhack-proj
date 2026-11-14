import numpy as np
import torch

from kipml.audio import HOP, RATE, frame_db
from kipml.data import load_sources, make_example
from kipml.infer import segments
from kipml.model import HandlingNet, enhance, features, stft


def test_frame_db_aligns_with_stft():
    x = np.random.default_rng(0).normal(size=RATE).astype(np.float32) * 0.1
    assert len(frame_db(x)) == stft(torch.from_numpy(x)[None]).shape[1] == 1 + RATE // HOP


def test_examples_have_matching_shapes_and_labels():
    src, rng = load_sources(), np.random.default_rng(1)
    for split in ("train", "test"):
        for _ in range(5):
            mix, clean, labels, has = make_example(rng, src, split, seconds=2.0)
            assert mix.shape == clean.shape == (2 * RATE,)
            assert labels.shape == (1 + 2 * RATE // HOP,)
            assert np.abs(mix).max() <= 1.0
            if not has:
                assert labels.sum() == 0 and np.allclose(mix, clean)


def test_splits_do_not_share_files():
    src = load_sources()
    for group in ("ours", "synthetic"):
        tr = {c.name for c in src["handling"]["train"][group]}
        te = {c.name for c in src["handling"]["test"][group]}
        assert not tr & te


def test_model_shapes_and_enhance_length():
    model = HandlingNet()
    mag = stft(torch.rand(2, RATE)).abs()
    mask, logit = model(features(mag))
    assert mask.shape == mag.shape and logit.shape == mag.shape[:2]
    x = np.random.default_rng(2).normal(size=RATE + 123).astype(np.float32) * 0.05
    out, prob = enhance(model, x)
    assert out.shape == x.shape and prob.shape == (1 + len(x) // HOP,)


def test_segments_merge_and_drop_short_blips():
    prob = np.zeros(200)
    prob[10:40] = 0.9     # 0.3 s
    prob[45:60] = 0.9     # gap 0.05 s: merged
    prob[100:105] = 0.9   # 0.05 s: dropped
    assert segments(prob, 0.5) == [(0.1, 0.6)]


def test_target_keeps_everything_but_handling_bursts():
    from kipml.data import frames_to_samples
    src, rng = load_sources(), np.random.default_rng(5)
    checked = 0
    for _ in range(40):
        mix, clean, labels, has = make_example(rng, src, "train", seconds=2.0)
        if not has or labels.all() or not labels.any():
            continue
        keep = frames_to_samples(labels, len(mix)) == 0          # samples well away from any handling frame
        assert np.allclose(mix[keep], clean[keep], atol=1e-6)    # the room is the target there, untouched
        assert np.abs(mix - clean).max() > 0                     # and something was taken out somewhere
        checked += 1
    assert checked > 5
