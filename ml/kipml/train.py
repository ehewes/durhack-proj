"""Train HandlingNet on mixtures made on the fly.

    uv run python -m kipml.train --steps 2500                    # full proof-of-concept run
    uv run python -m kipml.train --steps 20 --batch 4 --smoke    # CPU smoke test

Runs on CUDA (Lium pod), Apple MPS or CPU. Writes ml/checkpoints/handling-poc.pt and
ml/runs/<timestamp>/metrics.json (both git-ignored).
"""
from __future__ import annotations

import argparse, json, math, time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from .audio import ML_ROOT
from .data import batch, load_sources
from .model import HandlingNet, count_params, features, stft


def pick_device(name: str) -> torch.device:
    if name != "auto":
        return torch.device(name)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def loss_fn(model, mix, clean, labels, device):
    mix, clean, labels = (torch.from_numpy(a).to(device) for a in (mix, clean, labels))
    spec_mix, spec_clean = stft(mix), stft(clean)
    mask, logit = model(features(spec_mix.abs()))
    est = mask * spec_mix.abs()
    l_spec = (est.clamp_min(1e-8) ** 0.3 - spec_clean.abs().clamp_min(1e-8) ** 0.3).abs().mean()
    l_frame = F.binary_cross_entropy_with_logits(logit, labels)
    return l_spec + 0.3 * l_frame, l_spec.item(), l_frame.item()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=2500)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--seconds", type=float, default=2.0)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--seed", type=int, default=14)
    ap.add_argument("--out", default=str(ML_ROOT / "checkpoints" / "handling-poc.pt"))
    ap.add_argument("--ch", type=int, default=16, help="conv channels")
    ap.add_argument("--hidden", type=int, default=96, help="GRU size")
    ap.add_argument("--smoke", action="store_true", help="tiny run that just proves the loop works")
    args = ap.parse_args(argv)

    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    device = pick_device(args.device)
    src = load_sources()
    n_h = {k: sum(len(v) for v in src["handling"][k].values()) for k in ("train", "test")}
    print(f"device {device} | handling clips {n_h} | background clips "
          f"{ {k: len(v) for k, v in src['background'].items()} }")

    model = HandlingNet(ch=args.ch, hidden=args.hidden).to(device)
    print(f"HandlingNet: {count_params(model):,} parameters")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: 0.5 * (1 + math.cos(math.pi * min(s, args.steps) / args.steps)))
    val_rng = np.random.default_rng(1234)
    val = batch(val_rng, src, "test", 32, args.seconds)

    run = ML_ROOT / "runs" / time.strftime("%Y%m%d-%H%M%S")
    run.mkdir(parents=True, exist_ok=True)
    history, t0 = [], time.time()
    for step in range(1, args.steps + 1):
        model.train()
        mix, clean, labels, _ = batch(rng, src, "train", args.batch, args.seconds)
        loss, l_spec, l_frame = loss_fn(model, mix, clean, labels, device)
        opt.zero_grad(); loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
        opt.step(); sched.step()
        if step % 100 == 0 or step == args.steps:
            model.eval()
            with torch.no_grad():
                v, v_spec, v_frame = loss_fn(model, *val[:3], device)
            row = {"step": step, "train": round(loss.item(), 4), "val": round(v.item(), 4),
                   "val_spec": round(v_spec, 4), "val_frame_bce": round(v_frame, 4), "secs": round(time.time() - t0)}
            history.append(row)
            print(json.dumps(row), flush=True)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "config": {"ch": args.ch, "hidden": args.hidden}, "steps": args.steps}, args.out)
    (run / "metrics.json").write_text(json.dumps({"args": vars(args), "history": history}, indent=1))
    print(f"saved {args.out} and {run / 'metrics.json'}")
    return model


if __name__ == "__main__":
    main()
