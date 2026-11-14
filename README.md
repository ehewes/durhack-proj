# DurHack 2026 agent framework (template)

A small framework for running many coding agents at once during a hackathon. Claude Code, Codex
and Cursor follow the same rules. GitHub Issues is the task queue, `./hq` is the CLI around it,
and [Entire](https://entire.com) records sessions, maps the codebase, keeps memory and runs reviews.

## Pre-event tooling disclosure
This repository is a template prepared before DurHack 2026. It holds tooling, agent rules, docs
and GitHub templates only: no product code. At kick-off we create a fresh submission repo from
this template (`gh repo create --template`). All product code is written during DurHack, in that
repo.

## Quickstart
- Humans: [docs/PLAYBOOK.md](docs/PLAYBOOK.md) (kick-off checklist, dispatching agents, onboarding).
- Agents: [AGENTS.md](AGENTS.md) and the skills in [.agents/skills](.agents/skills).
- Hack context: [docs/hack/BRIEF.md](docs/hack/BRIEF.md), [docs/SPEC.md](docs/SPEC.md),
  [docs/BUSINESS.md](docs/BUSINESS.md), [docs/DOMAIN.md](docs/DOMAIN.md),
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md).
- First run in a clone: `entire enable`, then `./hq setup` (Windows: `hq.cmd setup`), then
  `./hq board`.

## Running the project
Kip is a Bun monorepo: an Expo app (`apps/mobile`, iOS and web), a Hono + tRPC server
(`apps/server`, API and worker) and shared domain code (`packages/shared`). Details in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
bun install
cp .env.example .env        # local defaults; never commit .env
bun run db:up               # TimescaleDB + MongoDB in Docker
bun run dev:api             # http://localhost:3000; migrates on boot, skips any database not configured
bun run dev:worker          # cron jobs
bun run dev:app             # Expo: press w for web, or use a dev-client build on iPhone
./hq check                  # lint, typecheck, tests (what CI runs)
```

The iPhone app needs a dev-client build (`cd apps/mobile && bun run ios`) because of its native
modules; Expo Go won't load it. Deploy: `infra/` (Terraform) and the `Dockerfile`, see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#deploy).
