# Playbook (humans)

How the two of us run DurHack with 6 to 10 agents. Agents follow `AGENTS.md`. This file is for us.

## Roles
- **Both of us own everything**: every lane, `main`, deploys, the code freeze and the `demo-v1`
  tag. Either of us can merge any PR. Lanes (see `docs/ARCHITECTURE.md`) only keep agents on
  disjoint paths.
- **Humans dispatch.** Agents never pick or self-assign issues.

## Cheat sheet
| Command | What it does |
|---|---|
| `./hq board [--brief]` | One screen: in progress, review, needs-human, blocked, ready queue, overlap radar, stale claims |
| `./hq claim N --agent <you>` | Agent claims issue N (`<you>` = `claude`, `codex` or `cursor`) |
| `./hq release N [--needs-human] [--note "..."]` | Gives an issue back, optionally asking a human a question |
| `./hq pr N --body-file .context/pr-N.md [--draft]` | Pushes, opens the PR with `Closes #N`, moves the issue to `status:review` |
| `./hq ship <PR> [--skip-review]` | Squash-merges if CI is green, `review:pass` is set, not draft, no conflicts |
| `./hq check` | Runs the project checks from `hq.json` |
| `./hq setup [--check]` | Prepares (or only checks) this clone or workspace |
| `./hq bootstrap` | Once per repo: labels, milestones, merge settings, ruleset |

Windows: `hq.cmd ...` or `python tools/hq/hq.py ...`.

Labels:
- `status:{ready,in-progress,review,blocked,needs-human}`
- `P0` (demo-critical), `P1`, `P2`
- `size:{S,M,L}` (L = split it)
- `type:{feat,bug,chore,spike,docs}`
- `review:{pass,changes}`, `agent:{claude,codex,cursor}`, `lane:<name>`, `epic`

Milestones: M0 Skeleton, M1 MVP demo path, M2 Prizes + polish, M3 Submission.

## Kick-off checklist (~15 min at event start)
1. Create the submission repo from the template and invite the teammate:
   ```
   gh repo create ehewes/<name> --private --template ehewes/durhack-proj --clone
   gh api -X PUT repos/ehewes/<name>/collaborators/<teammate-login> -f permission=push
   ```
   Add the repo to Conductor and set its setup script to `./hq setup`.
2. In the new clone, each person runs `entire enable`. Git hooks are per clone; the settings with
   the `branch` checkpoint backend are already committed. Ellis links the repo on entire.com for
   Trails.
3. Ellis runs `./hq bootstrap` (labels, milestones, merge settings, ruleset). Then each machine
   runs `./hq setup`.
4. Codex users approve the hooks once (`/hooks`). Close **every** pre-kick-off agent session and
   start fresh ones: old sessions would date the timeline before kick-off.
5. Fill `docs/hack/BRIEF.md`, `docs/SPEC.md` and `docs/ARCHITECTURE.md`, then run `/hq-plan`.
   The M0 skeleton issue comes first.

## Phases
**H0 to H2: plan and skeleton**
- Fill BRIEF, SPEC (demo script first) and ARCHITECTURE (lanes, contracts) together.
- Run `/hq-plan`, approve the table, let it create the issues.
- Dispatch M0: shared types, API stubs, `hq.json` checks, deploy. Merged and deployed by ~H2.

**Fan-out**
- Each human runs ~3 agents on ready issues in their own lane, P0 first.
- Add one more agent only while the others are waiting (CI, review).
- Watch `./hq board`: the overlap radar and stale claims.

**Sync every 2 to 3 hours (10 min)**
- `./hq board`, then `entire dispatch --local` for a summary of what the agents did.
- Re-plan: new issues via `/hq-plan`, re-prioritise, cut scope (drop P2, move work to Stretch).
- Answer every `status:needs-human` issue.

**Overnight (optional)**
- One unattended agent loop on one self-contained ticket, off the demo path, with turn and
  budget limits (for example `claude -p "work on #N" --max-budget-usd 5`). Review it in the morning.

**Freeze (~3h before judging)**
- Either of us tags the known-good build and deploys it:
  `git fetch origin && git tag demo-v1 origin/main && git push origin demo-v1`.
- After the freeze only demo-path fixes merge, each rehearsed on the demo script. Tag `demo-v2`
  if one lands.

**Submission**
- Work through the submission checklist below. Rehearse the demo from the tag.

## Dispatching an agent
Pick a ready issue from `./hq board`. One agent per worktree, always.

**Conductor (Mac):** ⌘⇧N, create the workspace from the GitHub issue, then say "work on #N" or
`/hq-work N`. The workspace setup script runs `./hq setup`.

**Cursor:** start each agent in worktree mode. Never two agents in one folder. Cursor inside
Conductor may not fire Entire hooks, so prefer Cursor IDE worktree agents or the `agent` CLI.
Prompt: "work on #N".

**Codex CLI:**
```
git worktree add ../wt-N -b <login>/N-slug origin/main
cd ../wt-N
./hq setup
codex -c sandbox_workspace_write.network_access=true "work on #N"
```
Codex needs network for `gh`, `git push` and `entire trail`. To make it permanent, set
`[sandbox_workspace_write] network_access = true` in `~/.codex/config.toml`.

**Claude Code CLI:** `claude -w` (or the git worktree steps above), then `/hq-work N`.

Outside Conductor, copy `.env` into the new worktree yourself.

### Cloud agents (Codex cloud, Cursor background agents, Claude Code on the web)
1. Pick an issue without `needs:mac` from `./hq board`.
2. Claim it for the agent: `./hq claim N --agent codex --workspace cloud-1` (one workspace name per
   cloud agent, so the board shows who has what).
3. Send the agent the issue URL with: "Work on #N following AGENTS.md. Start the PR description with
   `Closes #N`."
4. When the PR lands, review and ship it as usual: `./hq ship <PR>`. A `needs:keys` verify step is
   yours to run locally.

## Review and merge
- Every PR except `size:S` needs `review:pass` before `./hq ship`. `ship` only checks the label,
  so set it only after a real review.
- Cross-vendor: prefer a reviewer from a different vendor than the author (the PR's `agent:*`
  label). `entire review` runs Claude Code and Codex reviewers plus a judge.
- `review:pass` can come from:
  - local `entire review` (needs the `claude` and `codex` CLIs);
  - hosted Trail review agents on entire.com (optional, needs credits: MLH promo code);
  - the other human's agent running `/hq-review <PR>`.
- Either of us merges any PR, including contracts, deploy config and post-freeze fixes: tell the
  agent "ship it", or run `./hq ship <PR>`.

## Rate limits and tokens
- Spread agents across the Claude, OpenAI and Cursor subscriptions. When one rate-limits,
  dispatch the next issue to another vendor.
- Use cheaper models for chores and docs (`/model` in Claude Code and Codex).
- Avoid agent teams and swarms. One issue per session; start a fresh session for the next one.
- `entire graph query` costs far fewer tokens than blind file search.
- Check spend: `entire session tokens <session-id>` (ids from `entire session list`).

## Entire prize checklist
- [ ] Sessions captured for all three agents (`entire session list`, `entire status`).
- [ ] `git ls-remote origin 'refs/heads/entire/*'` shows `entire/checkpoints/v1`.
- [ ] Graph: agents use `entire graph query`. Show `entire graph stats`.
- [ ] Optional A/B: the same issue in two workspaces, with and without
      `entire graph setup --strict`. Compare `entire session tokens` to measure the savings.
- [ ] Brain: `entire brain brief` before tasks, `entire brain remember` after notable merges.
- [ ] Trails: one per PR, with `entire review` verdicts.
- [ ] Dispatch summaries: `entire dispatch --local` at each sync. Keep them for Devpost and DEV.
- [ ] Before making the repo public, review transcripts with `entire checkpoint list` and
      `entire checkpoint explain <id>`.

## Submission checklist
- [ ] Transcripts reviewed (above). No secrets in code, commits or sessions.
- [ ] Repo public: `gh repo edit --visibility public --accept-visibility-change-consequences`.
- [ ] README: what it does, how to run it, the pre-event tooling disclosure.
- [ ] Demo video following the 2-minute demo script in `docs/SPEC.md`.
- [ ] Devpost: repo link, video, prize tracks from `docs/hack/BRIEF.md`.
- [ ] DEV post for the DEV Writing Challenge.

## Teammate onboarding
1. Accept the repo invite.
2. Install `gh` and run `gh auth login`.
3. Install Entire: `brew install --cask entireio/tap/entire` or
   `curl -fsSL https://entire.com/install.sh | bash`. Then `entire login`.
4. Plugins: `entire plugin install graph` and `entire plugin install brain`.
5. Windows, before cloning: enable Developer Mode and run `git config --global core.symlinks true`
   so `.claude/skills` works. Use `hq.cmd` instead of `./hq`.
6. Clone: `gh repo clone ehewes/<name>`, then `cd <name>`.
7. Run `entire enable` in the clone (git hooks are per clone).
8. `git config user.email` must match your GitHub account, or Entire shows "Unknown author".
9. Run `./hq setup` until every line is ✓.
10. Codex: approve the hooks once via `/hooks`. Keep your main checkout on an up-to-date `main`
    (`git pull --ff-only`): Codex reads `.codex/hooks.json` from the main checkout.
11. Cursor: it may also load Claude hooks from `.claude/settings.json`. If `entire status` shows
    duplicate sessions, turn off third-party hooks in Cursor.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `entire status`: Codex hooks not active | Fast-forward the root checkout: `git -C <root checkout> pull --ff-only` (Conductor: `~/conductor/repos/<name>`) |
| Commit on `main` blocked | Create a branch: `git switch -c <login>/N-slug`. `HQ_ALLOW_MAIN=1` is for emergencies only |
| `./hq ship` refused | Read the gate it names (CI, review, draft, conflicts), fix it, retry. Never bypass |
| `./hq claim` refused | The issue is closed, blocked or claimed by someone else. Check `./hq board` |
| Keychain or network errors from `entire trail` in a sandbox | Rerun unsandboxed (Codex: the network flag above) |
| Entire shows "Unknown author" | Set `git config user.email` to your GitHub email |
| Duplicate sessions from Cursor | Turn off third-party hooks in Cursor |
| No skills in Claude Code on Windows | `.claude/skills` arrived as a plain file: set `core.symlinks true` and re-clone |
| `git push` fails with `remote rejected ... (failed)` | Run it again. Entire pushes its checkpoint branch at the same moment and GitHub sometimes rejects the first attempt. `./hq pr` retries once by itself |
