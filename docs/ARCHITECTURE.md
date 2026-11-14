# Architecture

Source of truth for stack, lanes and contracts. Change a contract only through its own issue.
Product context: `docs/SPEC.md`. Science and wording rules: `docs/DOMAIN.md`.

## Overview
One TypeScript API and one ingest worker, built from one Docker image, run on a Vultr instance in
London behind Caddy for HTTPS. Terraform provisions the instance, its firewall, the container
registry and the database access rules.

```
 iPhone (+ Watch via HealthKit)     Dashboard (browser)     Open data
  mic relative dB, clips,               |                  Observatory, OSM,
  sleep stages, vitals                  |                  Street Manager (SNS push)
        | upload                        |                       |            |
        v                               v                       | push       | pull every 5 min
 +--------------------------- Vultr, London -------------------------------------------+
 |  API (Hono, Caddy HTTPS, SNS endpoint, serves dashboard)  <--+   Ingest worker      |
 +-------------------------------------------------------------------------------------+
        |            |              |            | reads/writes            | writes readings
        v            v              v            v                         v
     Gemini     ElevenLabs       Solana     +------------- Data stores ---------------+
   classify,    TTS, Scribe,     Memo       |  Tiger Data: noise, sensor readings,    |
   narrate      Sound Effects    hashes     |    sleep stages, vitals                 |
                                            |  MongoDB Atlas: users, night summaries, |
                                            |    hotels, sensors, works, scores       |
                                            +-----------------------------------------+
```

- The phone uploads each night to the API. In live demo mode it also streams dB samples.
- The worker pulls Observatory readings and OpenStreetMap venues every 5 minutes. The API receives
  Street Manager permits as they're pushed.
- **The API is the only thing that calls Gemini, ElevenLabs and Solana**, so keys live in one
  place. The iOS app and the dashboard never hold third-party keys.
- Every timestamped value goes in Tiger. MongoDB holds one summary document per night plus users,
  hotels, sensors, works and scores.

## Stack
| Layer | Choice | Notes |
|---|---|---|
| iOS app | Swift/SwiftUI, HealthKit, AVAudioRecorder metering, on-device voice-activity check, CoreLocation, background audio mode | Records while locked; reads Watch sleep data without a Watch app. Needs an Apple developer account and the HealthKit entitlement |
| watchOS (stretch) | SwiftUI: haptics, "something woke me", briefing playback | Only if Watch signing works in the first 2 hours |
| API and worker | TypeScript on Bun, Hono, Zod, node-cron; one image, two entrypoints | Hono also serves the Street Manager SNS endpoint and the dashboard build |
| Dashboard | React, Vite, MapLibre GL with OpenStreetMap tiles | Built to static files, served by the API |
| Time series | Tiger Data (TimescaleDB): hypertables plus continuous aggregates | Event-window and night-average queries |
| Documents | MongoDB Atlas with 2dsphere indexes | Hotel ranking is one aggregation pipeline |
| AI | Gemini API on a paid-tier key, JSON output | Free-tier keys aren't allowed for UK-facing apps |
| Voice | ElevenLabs TTS (briefing), Scribe (second classifier), Sound Effects (demo clip) | |
| Chain | Solana mainnet, Memo program only (no Anchor) | A memo costs a fraction of a penny |
| Hosting | Vultr Cloud Compute (London), Vultr Container Registry, Caddy with an `<ip>.sslip.io` hostname | iOS requires HTTPS; no domain needed |
| Infra | Terraform: `vultr/vultr`, `mongodb/mongodbatlas` (IP access list), Tiger Cloud provider; cloud-init via `templatefile()` | One command rebuilds the stack |
| Process | Entire in the repo from the first commit | Records every agent session |

`./hq check` runs the `check` commands in `hq.json` (lint, typecheck, tests). Keep it under ~2 min.
`./hq setup` runs the `setup` commands (install dependencies). Both are empty until M0 adds code.

## Repo layout
```
apps/ios/                 Kip iOS app (Xcode project, SwiftUI)
apps/server/              one TS package, one Docker image
  src/api/                Hono routes, SNS endpoint, static dashboard
  src/worker/             node-cron ingest jobs and backfills
  src/services/           clients: gemini, elevenlabs, solana, observatory, overpass, street-manager
  src/db/                 Tiger and Mongo clients, SQL migrations, index setup
apps/dashboard/           React + Vite + MapLibre
packages/shared/          Zod schemas (upload, API), domain constants, WHO curve, score weights
infra/                    Terraform, cloud-init.yaml.tftpl, Caddyfile
Dockerfile                builds apps/server and apps/dashboard into one image
```

## Lanes
A lane is a set of dirs. Both of us work across every lane; lanes exist so parallel issues touch
disjoint paths. They are mirrored in `hq.json`.

| Lane | Dirs | Owner |
|---|---|---|
| `ios` | `apps/ios/` | Both |
| `api` | `apps/server/src/api/`, `apps/server/src/services/` | Both |
| `worker` | `apps/server/src/worker/`, `apps/server/src/db/` | Both |
| `web` | `apps/dashboard/` | Both |
| `infra` | `infra/`, `Dockerfile` | Both (Ellis merges, owns deploys) |
| `shared` | `packages/shared/` | Both (contracts: own issue each) |

## Contracts
Merge in M0, before anyone branches. Agree the upload JSON in the first 30 minutes so the iOS and
server tracks never block each other.

| Contract | Lives in | Owner lane |
|---|---|---|
| Night upload (phone to API) | `packages/shared/src/upload.ts` + Swift `Codable` mirror in `apps/ios` | `shared` |
| API routes and response shapes | `packages/shared/src/api.ts` | `shared` |
| Domain constants (night window, spike threshold, attribution window, construction hours, WHO curve) | `packages/shared/src/domain.ts` | `shared` |
| Quiet Stay Score inputs and weights per profile | `packages/shared/src/score.ts` | `shared` |
| Tiger schema | `apps/server/src/db/migrations/` | `worker` |
| Mongo collections and indexes | `apps/server/src/db/mongo.ts` | `worker` |

### Night upload (draft, settle at M0)
```ts
NightUpload = {
  nightId: uuid, userId: uuid,
  startedAt: ISODateTime, endedAt: ISODateTime,          // Europe/London offsets
  location?: { lat: number, lon: number },               // only with location consent
  consent: { microphone: boolean, health: boolean, location: boolean },
  noise: { baselineDb: number, samples: [t: epochSec, db: number][] },   // relative dB, 1 Hz
  spikes: { t: epochSec, peakDb: number, clipId?: string }[],
  sleep?: {                                              // absent in live demo mode
    stages: { start, end, stage: "inBed"|"awake"|"core"|"deep"|"rem" }[],
    heartRate: [t, bpm][], hrv: [t, ms][], respiratoryRate: [t, perMin][],
  },
}
```
Clips upload separately (`POST /v1/nights/:id/clips`) and are deleted after labelling.

### API routes (draft)
| Route | Purpose |
|---|---|
| `POST /v1/nights` | Upload a night |
| `POST /v1/nights/:id/clips` | Upload one 10 s clip; returns labels; clip deleted |
| `GET /v1/nights/:id` | Timeline, events, attribution counts, hours flags |
| `GET /v1/nights/:id/briefing` | Briefing text and audio URL |
| `POST /v1/nights/:id/anchor`, `GET /v1/nights/:id/verify` | Solana memo write and hash check |
| `POST /v1/live/samples`, `GET /v1/live/stream` (SSE) | Live demo mode |
| `GET /v1/city/sensors` | Sensors with 30-night Lnight, %HSD, data status |
| `GET /v1/hotels?profile=&checkIn=&checkOut=` | Ranked hotels with score breakdown and sources |
| `POST /v1/street-manager/sns` | SNS subscription confirmation and permit notifications |
| `DELETE /v1/users/:id` | Delete everything for a user, in both stores |

## Data
### Tiger (TimescaleDB)
| Table | Kind | Key columns |
|---|---|---|
| `sensor_readings` | hypertable | `time, sensor_id, metric (noise_db, no2, pm25), value` |
| `night_noise` | hypertable | `time, night_id, db` (relative) |
| `sleep_stages` | table | `night_id, start, end, stage` |
| `vitals` | hypertable | `time, night_id, metric (hr, hrv, resp), value` |
| `sensor_lnight_daily` | continuous aggregate | Energy-averaged noise per sensor per night window (see `docs/DOMAIN.md`) |

The 30-night Lnight per sensor is a query over `sensor_lnight_daily`. Backfill at least 30 nights
of Observatory history in hour one.

### MongoDB Atlas
| Collection | Holds | Indexes |
|---|---|---|
| `users` | Consent, profile choice | |
| `nights` | One summary per night: events, labels, attribution counts, hours flags, log hash, memo signature | `userId, startedAt` |
| `sensors` | Observatory sensor, GeoJSON point, latest 30-night Lnight and %HSD | `2dsphere` |
| `hotels` | OSM hotel, GeoJSON point, placeholder booking link, `simulated` flags | `2dsphere` |
| `works` | Street Manager permits, geometry, proposed/actual times, night flag | `2dsphere` |
| `venues` | OSM nightlife and sights | `2dsphere` |

Hotel ranking is one pipeline: `$geoNear` on `hotels` first (only one is allowed, and it must be
the first stage), then `$lookup` with `$geoWithin` and `$centerSphere` into `sensors`, `works` and
`venues`, then the profile weights from `packages/shared`.

## Env vars
Secrets live in `.env`, never committed and never pasted into a prompt. Conductor copies `.env*`
into each new workspace via `.worktreeinclude`. For a plain git worktree, copy `.env` by hand.

| Name | Used by | Where to get it |
|---|---|---|
| `MONGO_URI` | API, worker | MongoDB Atlas cluster (MLH credit) |
| `TIGER_URI` | API, worker | Tiger Cloud service |
| `GEMINI_API_KEY` | API | Google AI Studio, **paid tier** (enable billing in hour one) |
| `ELEVENLABS_API_KEY` | API | ElevenLabs (MLH promo code) |
| `SOLANA_RPC_URL`, `SOLANA_KEYPAIR` | API | Mainnet RPC; a small funded keypair used only for memos |
| `STREET_MANAGER_TOPIC_ARN` | API | Street Manager open data registration (register in hour one) |
| `VULTR_API_KEY` | Terraform | Vultr account (MLH credit) |
| `MONGODB_ATLAS_PUBLIC_KEY`, `MONGODB_ATLAS_PRIVATE_KEY` | Terraform | Atlas org API key |
| Tiger Cloud provider credentials | Terraform | Tiger Cloud console; names per the provider docs |
| `TF_VAR_admin_ip` | Terraform | Your public IP, for SSH |

The iOS app only needs the API base URL (`https://<ip>.sslip.io`).

## Deploy
Ellis owns deploys. The demo runs from tag `demo-v1`.
- `infra/` holds Terraform: SSH key, private container registry, firewall (22 from `admin_ip`
  only; 80 and 443 open for Caddy), a `vc2-2c-4gb` Ubuntu 24.04 instance in `lhr`, and the Atlas IP
  access list for the instance's IP. Keys come from variables, never the repo.
- cloud-init installs Docker and Caddy, builds an `<ip>.sslip.io` hostname from instance
  metadata, then pulls and runs the image twice (API and worker).
- The API retries its database connections on boot, because the Atlas access list is applied
  after the instance exists.
- Demo: `terraform apply -replace=vultr_instance.api` rebuilds only the server; data stays put.
- To confirm against provider docs before relying on them: the Vultr region, the registry plan,
  and the registry `urn` attribute.
