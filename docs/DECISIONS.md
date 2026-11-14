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

## 2026-11-14: Kip is the project
**Context:** The plan "Kip: Sleep, Noise and the City" (Nick, 2026-11-14) covers product, business
model, stack, build plan and pitch.
**Decision:** Build Kip. Product in `docs/SPEC.md`, business in `docs/BUSINESS.md`, science and
wording rules in `docs/DOMAIN.md`, stack and contracts in `docs/ARCHITECTURE.md`.
**Consequences:** Every agent follows `docs/DOMAIN.md` for anything it computes or shows.

## 2026-11-14: The API is the only caller of third-party services
**Context:** Gemini, ElevenLabs and Solana need secret keys; the app (iOS and web) is a client.
**Decision:** Only the API calls Gemini, ElevenLabs and Solana. Clients call the API.
**Consequences:** Keys live in one place. Clip labelling and briefings need a network round trip.

## 2026-11-14: Tiger for time series, MongoDB for documents and geo
**Context:** Kip has dense timestamped data (1 Hz noise, sensor readings, vitals) and geo
documents (hotels, sensors, works). Both are sponsor tracks.
**Decision:** Every timestamped value goes in Tiger; MongoDB holds users, one summary per night,
hotels, sensors, works, venues and scores. If the event limits us to one sponsor track, enter
MongoDB: move the time series into MongoDB time series collections and make hotel ranking the
centrepiece.
**Consequences:** Two stores to provision and delete from. User deletion must cover both.

## 2026-11-14: Read Watch data through HealthKit, not a Watch app
**Context:** An all-night workout session drains 40% to 100% of a Watch battery, and Watch app
signing is a known time sink.
**Decision:** The iPhone reads the Watch's own sleep tracking from HealthKit after the night ends.
A watchOS app is a stretch, abandoned if signing doesn't work by hour 2.
**Consequences:** Sleep stages arrive only after the session ends, so the live demo uses the
phone alone.

## 2026-11-14: Claim links, not causes; label estimates
**Context:** One night has 2 to 6 wake-ups, phone dB is uncalibrated, and the WHO curve is for
long-term road traffic at the facade, not kerbside sensors.
**Decision:** Show counts against a random-window baseline, relative dB, and an "indicative" city
map. Follow the wording table in `docs/DOMAIN.md`.
**Consequences:** Weaker-sounding claims that survive judge questions.

## 2026-11-14: Placeholder booking links for the demo
**Context:** Affiliate approval takes weeks; Booking.com cut small affiliates in 2025.
**Decision:** Hotels come from OpenStreetMap with placeholder booking links. Apply to a network
anyway and don't quote a commission rate until confirmed.
**Consequences:** Revenue is shown as the model, not as live bookings.

## 2026-11-14: Solana mainnet with the Memo program only
**Context:** We want cheap public timestamps a council can check without trusting Kip.
**Decision:** Hash each night's log and write it to mainnet with the Memo program. No Anchor, no
custom program.
**Consequences:** No toolchain setup; a fraction of a penny per night. It proves when a log
existed, not that it's true, and we say so.

## 2026-11-14: Bun workspaces; one server package and image
**Context:** The API and worker share clients, schemas and database code, and the plan wants one
Docker image.
**Decision:** Bun is the package manager for the whole repo and the server runtime.
`apps/server` holds both entrypoints (`main.api.ts`, `main.worker.ts`) and builds with the Expo
web export into one image.
**Consequences:** One build and deploy, one lockfile. Never hand-merge `bun.lock`.

## 2026-11-14: React Native on Expo for both the phone and the dashboard
**Context:** The team's strongest language is TypeScript, and the demo needs an iPhone app and a
browser dashboard.
**Decision:** One Expo app (dev client, Expo Router) builds iOS and web. HealthKit through
`@kingstinct/react-native-healthkit`; background metering, spike clips and the speech check in a
small local Expo Module (`kip-audio`, Swift). Replaces the plan's SwiftUI app and React/Vite
dashboard.
**Consequences:** One UI codebase and shared types. The native audio module is the riskiest
piece: build and test it on a device first. Maps need a `.native`/`.web` split. A watchOS app
becomes a separate native target, so it stays a stretch.

## 2026-11-14: tRPC on Hono for the API
**Context:** App and server are both TypeScript, and several agents change API shapes in parallel.
**Decision:** tRPC v11 mounted on Hono. Every JSON call and the live subscription go through
tRPC; plain Hono routes only for binary clip upload, the Street Manager SNS endpoint, health and
the web build.
**Consequences:** End-to-end types with no codegen; a server change that breaks the app fails
typecheck. Non-TypeScript clients (SNS) still get plain HTTP.

## 2026-11-14: File tree by feature, then by layer
**Context:** Up to ~10 agents work at once. A layer-first tree (`routes/`, `services/`,
`screens/`) puts every task in the same folders.
**Decision:** Each feature (`city`, `night`, `attribution`, `labels`, `briefing`, `evidence`,
`stays`, `works`, `live`, `account`) owns a folder in `apps/mobile/src/features/`,
`apps/server/src/features/` and `packages/shared/src/`. Lanes are features. Registries are
written once in M0 with every feature stubbed; shared code changes through `platform` issues.
**Consequences:** Parallel issues touch disjoint paths. Cross-feature calls go through a feature's
`index.ts`. The rules are in `docs/ARCHITECTURE.md`.

## 2026-11-14: Both of us own everything
**Context:** The template gave Ellis `main`, deploys and the freeze, and gave each human lanes.
With two people working across the whole stack, that split only adds hand-offs.
**Decision:** No split ownership. Either of us can merge any PR, deploy, call the freeze and tag
`demo-v1`. Lanes stay, but only to keep parallel agents on disjoint paths.
**Consequences:** No waiting on a specific person. Say in chat before merging contracts, deploy
config or anything after the freeze, so we don't both do it.

## 2026-11-14: Train our own handling-noise filter on a Lium GPU pod
**Context:** A phone on a nightstand, in a pocket or under a pillow picks up its own handling noise
(sleeve, pocket, bedsheet rustle). Those spikes would be labelled and linked to wake-ups. We also
want a model of our own in the pipeline, not only third-party APIs.
**Decision:** Train a small PyTorch mask model on synthetic mixtures of handling noise and night
sounds, on a Lium GPU pod (Vultr stays for deployment). Export it to ONNX and run it in the API on
each spike clip before Gemini. Mostly-handling clips get the label `handling`. Clips are 16 kHz mono
WAV. Prototype quality is acceptable: if the model underperforms, the API falls back to labelling
the original clip.
**Consequences:** A Python toolchain (`uv`) beside Bun, outside `./hq check`. Training data and
checkpoints stay out of git; only the exported model is committed. The label set gains `handling`,
which attribution and briefings ignore.

## 2026-11-14: Commit a small curated audio library in `ml/audio/`
**Context:** Both of us, and agents on any machine or a Lium pod, need the same recordings and
downloaded clips, and Ellis wants to upload recordings straight into the repo.
**Decision:** `ml/audio/` holds our recordings, ESC-50 background clips, placeholder synthetic
handling noise and ElevenLabs-generated clips, all 16 kHz mono WAV with sources in
`ml/audio/SOURCES.md`, committed to git. Keep it small (tens of MB): short takes only. Generated
mixtures, runs and checkpoints still stay out of git. No Git LFS, because its hooks clash with
Entire's.
**Consequences:** Every clone carries the audio library. ESC-50 is CC BY-NC, acceptable for the
prototype only. Raw Voice Memos files stay in the ignored `ml/audio/inbox/`.
