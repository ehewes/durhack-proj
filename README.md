# Kip

Kip links Newcastle's night noise to sleep, street by street: an indicative city sleep map, your
own night with the wake-ups that followed a noise spike, and hotels ranked by how well you are
likely to sleep there. Ellis and Nick are building it at DurHack 2026. Parts of it are still in
progress: [docs/demo/devpost.md](docs/demo/devpost.md) says what works on `main` today, what is
planned and what is simulated.

## Pre-event tooling disclosure
MLH judges only work done during the event. One part of this repo was prepared before DurHack
2026: the framework we use to run coding agents in parallel. After an empty initial commit, it
arrived as the repo's first two merged pull requests (#1 and #4):

- the `hq` CLI, which runs the task queue on GitHub Issues: `tools/hq/`, `hq`, `hq.cmd`, `hq.json`;
- agent rules, skills and hooks: `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/`,
  `.cursor/`, `.conductor/`;
- Entire's settings and agent guide (`.entire/`), the guard that blocks commits on `main`
  (`.githooks/`), the GitHub issue form, PR template and first CI workflow (`.github/`), and
  `.gitignore` and `.worktreeinclude`;
- `docs/PLAYBOOK.md`, and placeholder versions of the brief, spec, architecture and decision log.

Kip itself was written during DurHack: everything in `apps/`, `packages/`, `ml/` and `infra/`, the
`Dockerfile`, `compose.yaml`, and Kip's content in `docs/`. Changes to the framework files during
the event are event work, and the git history shows them.

## Run Kip locally
Kip is a Bun monorepo: one Expo app for the iPhone and the web dashboard (`apps/mobile`), one
server package with two processes, the API (tRPC on Hono) and the worker (`apps/server`), and
shared domain code (`packages/shared`). Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

You need Bun 1.4.4, Node.js LTS (the Expo CLI runs on it), Docker for the local databases, and
Python 3.9 or later for `./hq`.

```bash
bun install
cp .env.example .env    # works as is for local development; never commit .env
bun run db:up           # TimescaleDB (5432) and MongoDB (27017) in Docker; waits until healthy
bun run dev:api         # terminal 1: http://localhost:3000; applies migrations and indexes on boot
bun run dev:worker      # terminal 2: Observatory pull and Lnight refresh, every 5 minutes
bun run dev:app         # terminal 3: Expo dev server; press w to open the web dashboard
./hq check              # lint, typecheck and tests; CI runs the same command
```

`curl http://localhost:3000/health` answers `{"ok":true}` once the API is up.

What you should see on the web dashboard (http://localhost:8081):
- **City:** the Newcastle map once `EXPO_PUBLIC_MAPBOX_TOKEN` is set; without it, a message
  naming that variable. Sensors are not shaded yet (#35, #36).
- **Night:** a simulated night, labelled "Simulated night.", until a night is uploaded for your
  user.
- **Live** (http://localhost:8081/live): waits for the phone's levels. To send some by hand, 45
  seconds of quiet with one loud second:

  ```bash
  now=$(date +%s)
  body=$(bun -e "const t = $now - 45; console.log(JSON.stringify({ json: { samples: Array.from({ length: 45 }, (_, i) => ({ t: t + i, db: i === 40 ? 52 : 32 })) } }))")
  curl -s http://localhost:3000/trpc/live.push -H 'content-type: application/json' -H "x-kip-user: $(uuidgen)" -d "$body"
  ```

  The meter moves and one spike appears, labelled `uncertain` until live labelling lands (#55).
  Wait a minute before running it again, because each run covers the last 45 seconds. A
  development build that cannot reach the API plays a short simulated stream under a banner
  instead.

**Without Docker:** blank `MONGO_URI` and `TIGER_URI` in `.env`. The API then starts without
databases, with a warning for each, and still serves `/health`, the live stream and the stubs.
Anything that stores data, such as the Night tab or the account, returns an error. The worker
starts too, but its jobs fail every 5 minutes until the databases exist.

### Environment variables
Every variable is optional in development. Where to get each one: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#env-vars).

| Variable | What it turns on |
|---|---|
| `PORT` | The API's port: 3000 by default |
| `MONGO_URI`, `TIGER_URI` | The local Docker databases by default. Production uses MongoDB Atlas and Tiger Cloud |
| `WEB_DIST` | The Expo web export the API serves as the dashboard. Unset in development |
| `GEMINI_API_KEY` (paid tier) | Clip labels and the briefing text. Without it, the briefing falls back to Kip's own template |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | The briefing voice and Scribe's second clip label. `briefing.get` fails without both |
| `SOLANA_RPC_URL`, `SOLANA_KEYPAIR` | Evidence anchoring: an RPC URL for the chosen network (devnet for the demo, mainnet for the real app) and a small funded keypair used only for memos |
| `EXPO_PUBLIC_API_URL` | Where the app finds the API: `https://kip.edenmatrix.xyz` for the live deploy. For a local server on an iPhone, use your Mac's LAN IP, not `localhost` |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Web map tiles: a public `pk.` token, restricted to the dashboard's URLs |
| `EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN` | iPhone map tiles: a separate public `pk.` token with no URL restriction. Restart Metro after changing it |
| `VULTR_API_KEY`, `MONGODB_ATLAS_*`, `TF_VAR_*` | Terraform only: [infra/README.md](infra/README.md) |

### iPhone and deploy
The iPhone app needs a dev-client build (`cd apps/mobile && bun run ios`, with Xcode) because of
its native modules; Expo Go won't load it. Recording is not built yet: the `kip-audio` module is a
skeleton (#59, #60). Kip is not deployed yet (#74); the Terraform in `infra/` and the `Dockerfile`
describe how, in [infra/README.md](infra/README.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#deploy).

### If something fails
- `bun run db:up` reports a port in use: a local Postgres or MongoDB already holds 5432 or 27017.
  Stop it, then run `bun run db:up` again.
- The web dashboard cannot reach the API: check `EXPO_PUBLIC_API_URL` in `.env`, then restart
  `bun run dev:app`, which reads `.env` only when it starts.

## Quickstart
- Humans: [docs/PLAYBOOK.md](docs/PLAYBOOK.md) (kick-off checklist, dispatching agents, onboarding).
- Agents: [AGENTS.md](AGENTS.md) and the skills in [.agents/skills](.agents/skills).
- Hack context: [docs/hack/BRIEF.md](docs/hack/BRIEF.md), [docs/SPEC.md](docs/SPEC.md),
  [docs/BUSINESS.md](docs/BUSINESS.md), [docs/DOMAIN.md](docs/DOMAIN.md),
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md).
- First run in a clone: `entire enable`, then `./hq setup` (Windows: `hq.cmd setup`), then
  `./hq board`.
