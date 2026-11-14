# Decisions

Append-only log, newest at the bottom. Add an entry when a choice would surprise a newcomer or is
costly to undo. Agents also record it with `entire brain remember "<decision>"`.

Format:

```
## YYYY-MM-DD: <decision>
**Context:** why it came up.
**Decision:** what we chose.
**Consequences:** what follows, good and bad.
```

## 2026-11-13: GitHub Issues is the single task queue
**Context:** Up to ~10 agents across Claude Code, Codex and Cursor need one shared view of the
work. A second tracker (beads, Backlog.md, Task Master) would drift from GitHub.
**Decision:** Every task is a GitHub issue in the task form. `./hq` claims, labels and ships them.
Humans dispatch; agents never pick their own.
**Consequences:** GitHub is the only shared state; `.context/` and workspaces are scratch. Every
agent needs `gh` auth and network access.

## 2026-11-13: Entire for sessions, memory and review
**Context:** We want shared session history, codebase mapping, persistent memory and cross-vendor
review, and we target Best Use of Entire. Entire's judging tool only reads `refs/heads/entire/*`.
**Decision:** Use Entire Sessions, Graph, Brain and Trails, and `entire review` (Claude Code and
Codex reviewers, one judge). Use the `branch` checkpoint backend.
**Consequences:** Every session is recorded and pushed, so no secrets in prompts. Each clone runs
`entire enable`. `review:pass` needs local `entire review`, hosted Trail review or `/hq-review`.

## 2026-11-13: Squash merges keep Entire-Checkpoint trailers
**Context:** Entire links commits to sessions through `Entire-Checkpoint` trailers. A squash
message without them breaks the link.
**Decision:** Squash merge only. Repo setting: squash title = PR title, message = commit details.
`./hq ship` merges this way.
**Consequences:** `main` gets one commit per PR and `entire why` still resolves to sessions. Never
edit the trailers out of a squash message.

## 2026-11-13: Fresh submission repo from this template at kick-off
**Context:** MLH only judges work done during the event, and Entire's judging tool scores a clean
start higher.
**Decision:** This repo is a template. At kick-off we run `gh repo create --template` and hack in
the new repo.
**Consequences:** The submission has no pre-event history. Pre-kick-off agent sessions are closed
and fresh ones started. The README discloses the framework as pre-event tooling.
