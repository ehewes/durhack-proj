# AGENTS.md

Rules for every coding agent in this repo: Claude Code, Codex and Cursor. Short on purpose.

## Context
- `docs/hack/BRIEF.md`: event, prizes, deadlines.
- `docs/SPEC.md`: what we build (Kip), the demo path.
- `docs/BUSINESS.md`: business model, Quiet Stay Score, profiles, judge answers.
- `docs/DOMAIN.md`: WHO curve, attribution, construction hours, privacy, wording rules.
- `docs/ARCHITECTURE.md`: stack, lanes, contracts, data stores, env vars.
- `docs/DECISIONS.md`: decisions so far.

Read only what your issue needs.

## Product rules
- Anything Kip computes, labels or shows follows `docs/DOMAIN.md`, including its wording table:
  "linked to", never "caused by"; city figures are "indicative".
- Only the API calls Gemini, ElevenLabs and Solana. No third-party keys in the app or dashboard.
- No raw audio at rest, no health values in logs, simulated data always labelled.

## The loop
One issue = one agent = one worktree/branch = one PR. Humans assign issues. Never pick your own.

1. Claim: `./hq claim N --agent <claude|codex|cursor>`.
2. Context before code: `entire search "<topic>"`, `entire graph query "<task>"`,
   `entire brain brief "<task>"`. Run `entire why <file>:<line>` before rewriting code you did not write.
3. Build inside the issue's Scope, in small commits.
4. `./hq check` must pass.
5. Open the PR: `./hq pr N --body-file .context/pr-N.md`.
6. Trail: Entire opens a trail for your PR by itself. Check it with `entire trail show`, then run `entire trail ci-pr` (safe to re-run). Only if `trail show` finds none: `entire trail create --title "<issue title> (#N)" --type feature`.
7. Unless the issue is `size:S`: `entire review`, fix the findings,
   `gh pr edit <PR> --add-label review:pass`, then `entire trail ready`.
8. Stop and report. Only when a human says "ship it": `./hq ship <PR>`.

Full detail: `.agents/skills/hq-work/SKILL.md`. Also useful: `./hq board`, `./hq setup --check`.
Windows: use `hq.cmd` or `python tools/hq/hq.py` wherever this file says `./hq`.

## Git
- Work only in your own worktree and branch. Never commit on `main` (a hook blocks it).
- Stage files by name. Never `git add -A` or `git add .`.
- Never revert, checkout, stash or delete changes you did not make.
- Never amend or force-push commits that are already pushed.
- Before `./hq pr`, rebase on `origin/main` (`git fetch origin && git rebase origin/main`) and fix
  your own conflicts. If your branch is already pushed, `git merge origin/main` instead.
- Commit and push your own branch freely. No need to ask.

## Coordination
- GitHub is the only shared state. `.context/` is your private scratch.
- Out-of-scope work becomes a new issue (`gh issue create`), not a drive-by edit.
- Never edit paths listed under "Do not touch" in your issue.
- Progress notes go in issue comments: `gh issue comment N --body "..."`.
- Stuck: `./hq release N --needs-human --note "<one crisp question>"`, then stop.
- Contract changes (shared types, API shapes) need their own issue.

## Definition of done
- Every acceptance criterion is met.
- `./hq check` passes, with its tail in the PR body.
- The PR is open with evidence: what you ran and what you saw.
- Review passed (`review:pass`), unless the issue is `size:S`.

## Issues are approved designs
Do not run brainstorming, spec or plan-document rituals for issue work. Plan inline, then build.

## Entire
Entire records every session and pushes transcripts with your commits.
- Never paste secrets, tokens or `.env` contents into prompts or code.
- Do not disable Entire or remove its hooks.

## Commits
- The subject says what the product can now do: imperative, under ~60 characters.
- One logical change per commit.
- No AI attribution or co-author trailers. The `Entire-Checkpoint` trailer is added
  automatically and must stay.
- No em dashes.

<!-- entire-agent:begin -->
Read .entire/agent-guide.md for this repository's workflow, source inspection, and verification guidance.
@.entire/agent-guide.md
<!-- entire-agent:end -->
