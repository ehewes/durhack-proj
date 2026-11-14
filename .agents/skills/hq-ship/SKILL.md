---
name: hq-ship
description: Use only when a human says "ship it" or asks to merge a PR. Squash-merges a reviewed PR with ./hq ship and reports what got unblocked.
---

# hq-ship

Never ship on your own initiative.

1. Confirm a human said ship for this PR.
2. Merge: `./hq ship <PR>`. Gates: CI green, `review:pass`, not draft, no conflicts.
   Use `--skip-review` only for a `size:S` issue or when the human says so.
3. If it refuses, report the failing gate and stop. Do not force, relabel or bypass it.
   Usual fixes, done by the PR's author:
   - CI red: fix on the branch, push, wait for CI.
   - No `review:pass`: run `entire review` or ask for `/hq-review <PR>`.
   - Draft: `gh pr ready <PR>`, if the human agrees.
   - Conflicts: `git fetch origin && git merge origin/main` on the branch, fix, `./hq check`, push.
4. After the merge:
   - If there was a notable decision or lesson: `entire brain remember "<decision or lesson>"`.
   - Tell the human which issues got unblocked (`./hq ship` prints them; see `./hq board --brief`).
5. Do not delete local branches or worktrees.
