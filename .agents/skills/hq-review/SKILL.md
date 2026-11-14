---
name: hq-review
description: Use when asked to review someone else's PR ("review PR 12" or "/hq-review 12"). Checks it against the linked issue and sets review:pass or review:changes.
---

# hq-review

Review in your own worktree or workspace, never in the author's. Prefer a reviewer from a
different vendor than the author (the PR's `agent:*` label).

1. Check out the PR: `gh pr checkout <PR>`.
2. Find the issue: `gh pr view <PR> --json title,labels,closingIssuesReferences`, then
   `gh issue view <N>`. Note the Acceptance criteria, Scope and Do not touch.
3. Read the diff: `gh pr diff <PR>`. Flag any file outside Scope or inside Do not touch.
4. Run `./hq check` and the issue's Verify steps.
5. If `command -v claude && command -v codex` succeeds, run `entire review`. It runs Claude Code
   and Codex reviewers plus a judge from the shared profile and posts to the trail. Otherwise
   review by hand against each acceptance criterion.
6. Write the verdict to `.context/review-<PR>.md`:
   - Verdict: pass or changes.
   - Each acceptance criterion: met or not met, with evidence.
   - Findings, blocking first: `file:line`, the problem, a suggested fix.
   - The tail of `./hq check`.
7. Post it: `gh pr review <PR> --comment --body-file .context/review-<PR>.md`.
   Use `--comment`: you cannot approve a PR opened from your own account.
8. Label it:
   - pass: `gh pr edit <PR> --add-label review:pass --remove-label review:changes`
   - changes: `gh pr edit <PR> --add-label review:changes --remove-label review:pass`
9. Do not push fixes to the author's branch and do not merge. Tell the human the verdict.
