# Architecture

Fill in at kick-off, before `/hq-plan`. This file is the source of truth for lanes and contracts.
Change a contract only through its own issue.

## Stack
TBD: language, framework, database, hosting, AI APIs.

`./hq check` runs the `check` commands in `hq.json` (lint, typecheck, tests). Keep it under ~2 min.
`./hq setup` runs the `setup` commands (install dependencies).

## Repo layout
TBD. For example:

```
apps/web/          frontend
apps/api/          backend
packages/shared/   shared types and API shapes
```

## Lanes
A lane is a set of dirs one human owns. Parallel issues use different lanes or disjoint paths.
Add each lane to `lanes` in `hq.json` so `./hq bootstrap` creates its `lane:<name>` label.

| Lane | Dirs | Owner |
|---|---|---|
| TBD | TBD | Ellis |
| TBD | TBD | Teammate |

## Contracts
Shared types and API shapes, and where they live. They merge in M0, before anyone branches.

| Contract | Lives in | Owner lane |
|---|---|---|
| TBD | TBD | TBD |

## Env vars
Secrets live in `.env`, never committed. Conductor copies `.env*` into each new workspace via
`.worktreeinclude`. For a plain git worktree, copy `.env` by hand.

| Name | Used by | Where to get it |
|---|---|---|
| TBD | TBD | TBD |

## Deploy
TBD: target, deploy command, URL. Ellis owns deploys. The demo runs from tag `demo-v1`.
