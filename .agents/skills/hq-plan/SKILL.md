---
name: hq-plan
description: Use when a human asks to plan the build or turn docs/hack/BRIEF.md, docs/SPEC.md and docs/ARCHITECTURE.md into GitHub issues.
---

# hq-plan

1. Read `docs/hack/BRIEF.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`.
   See what exists: `./hq board` and `gh issue list --state open`. Do not duplicate open issues.
2. Draft the issues. Rules:
   - 1 issue = 1 agent = 1 PR. Size S or M. Split anything L.
   - Issues that can run in parallel have disjoint Scope paths.
   - Contracts and skeleton first, in `M0 Skeleton`: shared types, API stubs, CI check commands
     (`check` in `hq.json`), deploy. Everything else is `Blocked by` them.
   - P0 = on the demo path in `docs/SPEC.md`. P1 = should have. P2 = nice to have.
   - Milestones: `M0 Skeleton`, `M1 MVP demo path`, `M2 Prizes + polish`, `M3 Submission`.
   - Each issue has one lane from `docs/ARCHITECTURE.md`, checkable acceptance criteria and exact
     Verify steps.
   - Titles are imperative and say what the product can do afterwards: they become commit subjects.
3. Show the human this table, then wait for approval. Revise until they approve.

   | # | Title | Lane | P | Size | Milestone | Scope | Blocked by |
   |---|---|---|---|---|---|---|---|

4. After approval, write each body to `.context/issue-<k>.md` with exactly these headings:

   ```markdown
   ### Goal
   ### Acceptance criteria
   ### Scope
   ### Do not touch
   ### Blocked by
   ### Verify
   ### Notes
   ```

   Blocked by is `#12, #14` or `none`. Scope and Do not touch list files or dirs.
5. Create blockers first so their numbers exist, then put the real numbers in each dependent's
   Blocked by. One command per issue:

   ```
   gh issue create --title "<title>" --body-file .context/issue-<k>.md \
     --label status:ready --label P1 --label size:S --label type:feat \
     --label lane:<x> --milestone "M0 Skeleton"
   ```

   Use `--label status:blocked` instead of `status:ready` when Blocked by is not `none`.
   A missing `lane:<x>` label means the lane is not in `hq.json`: ask the human.
6. Show `./hq board`. Do not claim or start anything: humans dispatch.
