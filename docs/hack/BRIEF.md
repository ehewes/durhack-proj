# Hack brief

Event facts, deadlines and prize targets. Fill in the TBDs at kick-off.

## Event
- DurHack 2026, an MLH member event. About 24 hours.
- Dates: Sat 14 Nov 2026 12:00 to Sun 15 Nov 2026 12:00 (24 hours), so hours 12 to 20 fall overnight.
- Team: Ellis and Nick. Both of us own everything; lanes in `docs/ARCHITECTURE.md` only split
  work between agents.
- Project: **Kip**, sleep, noise and the city. See `docs/SPEC.md` and `docs/BUSINESS.md`.
- MLH workshop: Intro to Google AI Studio (time announced at the opening ceremony).

## Deadlines
| What | When |
|---|---|
| Kick-off (hacking starts) | Sat 14 Nov 2026, 12:00 |
| M0 skeleton merged and deployed | kick-off + ~2h |
| Checkpoint: Watch works, else phone only | kick-off + 2h |
| Checkpoint: one full night stored end to end | kick-off + 14h |
| Code freeze, tag `demo-v1` | Sun 15 Nov 2026, 12:00 (kick-off + 24h) |
| Submission (Devpost) | TBD |
| Judging | TBD |

## Theme
TBD.

## Judging criteria
TBD. Copy the rubric here at the opening ceremony.

## Prize tracks (MLH)
| Track | Prize | What qualifies | Target |
|---|---|---|---|
| Best Use of ElevenLabs | Wireless earbuds | Gives the hack a voice: realistic, expressive AI audio (voices, narration, voice agents) via ElevenLabs | Yes: briefing voice, Scribe as second classifier, Sound Effects for the demo clip |
| Best Use of Gemini API | MLH swag kits | AI features built on the Google Gemini API (chat, summarising, generating content or code) | Yes: noise clip labels, morning briefing and complaint draft (paid-tier key) |
| Best Use of Entire | Mini portable projector | Uses as many Entire capabilities as possible (Sessions, Graph, Brain, Trails) for human-AI collaboration, clean history and measurable token efficiency | Yes, via the workflow itself: Sessions, Graph, Brain, Trails (checklist in `docs/PLAYBOOK.md`) |
| Best Use of Solana | Unruggable hardware wallets | Relies on Solana's fast, near-zero-fee transactions (games, social, DeFi, payments, identity, supply chain) | Yes (weakest fit): nightly log hash on mainnet via the Memo program |
| Best Use of Tiger Data | Stream Deck Mini | Innovative, performance-driven use of Tiger Data (PostgreSQL for real-time, time-series and analytics) | Yes: all time series; continuous aggregate for the 30-night Lnight per sensor |
| Best Use of Vultr | Assorted prizes | Runs the hack on Vultr (cloud compute, one-click deploy, Cloud GPUs; free credits) | Yes: Compute, Container Registry and firewall, provisioned by Terraform |
| DEV Writing Challenge | $100 | A post on DEV about what we built; picked monthly for substance, originality, storytelling and popularity | Maybe, after submission |
| Best Use of MongoDB Atlas | M5Stack IoT Kit | The hack's data lives in MongoDB Atlas (free tier or $50 student credit) | Yes: users, nights, hotels, scores; `$geoNear` hotel ranking. First choice if limited to one track. Each team is limited to one track (confirmed 2026-11-14), so this is our entry |

Promo codes and credits (ElevenLabs, Entire, Vultr, MongoDB) come from the MLH email. Never commit
them.

## Hour-one sign-ups
Start these at kick-off; each can take hours or days.
- Street Manager open data registration (SNS subscription must be confirmed within 3 days;
  fallback: a recorded sample of Newcastle permits).
- Gemini paid tier (billing enabled on the key).
- Hotel affiliate network (Awin, CJ, Expedia, Travelpayouts). Expect no approval during the event;
  the demo uses placeholder links.
- Apple developer account and HealthKit entitlement; test Watch signing, stop at hour 2.
- Check which Observatory noise sensors reported in the last 24 hours; backfill 30+ nights.

## Risks
| Risk | Likelihood | Fallback |
|---|---|---|
| Watch app signing eats hours | High | Stop at hour 2; the phone reads Watch data through HealthKit anyway |
| HealthKit entitlement or developer account not ready | Medium | Sort it in hour one; worst case, export Health data from the Health app and import it |
| iOS stops recording when locked | Medium | Test on the first evening; fallback is screen-on with Guided Access |
| Nobody sleeps near an Observatory sensor | Happened (confirmed 2026-11-14) | The personal night still works; the city map uses sensors near the venue |
| Street Manager feed not live in time | Medium | A recorded sample of Newcastle permits |
| Observatory sensors stale or API down | Medium | History backfilled into Tiger in hour one; pick sensors that reported in the last 24 hours |
| Gemini paid tier not set up | Low | Enable billing in hour one |
| Hotel affiliate access not granted | High | OpenStreetMap hotels with placeholder booking links |
| Live audio fails in a loud hall | Medium | Speaker held against the phone; backup video |
| Judges challenge the causation claim | High | Counts against the random-window baseline; say "linked to", never "caused by" |

## Constraints
- MLH rules: only work done during the event is judged.
- This framework (`hq`, agent rules, docs, GitHub templates) is pre-event tooling, prepared before
  DurHack and disclosed in `README.md`. The submission repo is created from it at kick-off and
  all product code is written during the event.
- Secrets live in `.env` only. Never commit them or paste them into an agent prompt.
