---
name: hq-work
description: 'Use when a human assigns you a GitHub issue ("work on #N" or "/hq-work N"). Takes it from claim to a reviewed PR.'
---

# hq-work

`N` = issue, `<you>` = `claude`, `codex` or `cursor`, `<PR>` = PR number. Windows: `hq.cmd` for `./hq`.

1. Claim: `./hq claim N --agent <you>`. If it refuses, stop and tell the human why. Read what it
   prints: the issue, work in flight, overlapping files.
2. Context before code. Read only the docs the issue needs, then run
   `entire search "<topic>"`, `entire graph query "<task>"` and `entire brain brief "<task>"`.
   Before rewriting code you did not write: `entire why <file>:<line>`.
3. Plan inline in a few bullets. No spec or plan documents.
4. Build inside Scope, never in "Do not touch". Small commits, staged by name:
   `git add <file> <file> && git commit -m "<what the product can now do>"`.
   Push whenever you like: `git push -u origin HEAD`.
5. Verify: run the issue's Verify steps, then `./hq check` until it passes.
6. Sync with main. Not pushed yet: `git fetch origin && git rebase origin/main`. Already pushed:
   `git fetch origin && git merge origin/main` (never force-push). Fix conflicts in your own
   changes, `git add <files>`, then `git rebase --continue` or `git commit`. Re-run `./hq check`.
7. Write `.context/pr-N.md` (template below; `mkdir -p .context` if needed), then
   `./hq pr N --body-file .context/pr-N.md`. It pushes, opens the PR with `Closes #N` and sets
   `status:review`. Get the number: `gh pr view --json number,url`.
8. Trail: Entire opens a trail for your PR by itself. Check it with `entire trail show`, then run `entire trail ci-pr` (safe to re-run). Only if `trail show` finds none: `entire trail create --title "<issue title> (#N)" --type feature`.
9. Review, unless the issue is `size:S`: `entire review`. Fix real findings, commit, `git push`,
   re-run `./hq check`. Then `gh pr edit <PR> --add-label review:pass` and `entire trail ready`.
10. Report the PR link, check result and risks, then stop. Merge only on "ship it" (`/hq-ship`).

PR body template for `.context/pr-N.md`:

````markdown
## What changed
- <what the product can now do>

## How verified
- <Verify steps you ran and what you saw>
```
<tail of ./hq check>
```

## Risks
- <what could break, or "none">

## Screenshots
<UI changes only, else "n/a">
````

Out of scope: do not do it. Write `.context/new-issue.md` with the headings `### Goal`,
`### Acceptance criteria`, `### Scope`, `### Do not touch`, `### Blocked by`, `### Verify`,
`### Notes` (say "Found while working on #N" in Notes), then
`gh issue create --title "<title>" --body-file .context/new-issue.md --label status:needs-human`.
Link it on your issue: `gh issue comment N --body "Follow-up: #M"`. Carry on with your own scope.

Stuck (unclear criteria, waiting on another issue, a conflict in code you did not write):
`./hq release N --needs-human --note "<one crisp question>"`, then stop.

Done means: every acceptance criterion met, `./hq check` passes with its tail in the PR, PR open
with evidence, `review:pass` (unless `size:S`).
