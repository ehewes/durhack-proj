# Hack brief

Event facts, deadlines and prize targets. Fill in the TBDs at kick-off.

## Event
- DurHack 2026, an MLH member event. About 24 hours.
- Dates: TBD.
- Team: Ellis and one teammate.
- MLH workshop: Intro to Google AI Studio (time announced at the opening ceremony).

## Deadlines
| What | When |
|---|---|
| Kick-off (hacking starts) | TBD |
| M0 skeleton merged and deployed | kick-off + ~2h |
| Code freeze (judging minus 3h), tag `demo-v1` | TBD |
| Submission (Devpost) | TBD |
| Judging | TBD |

## Theme
TBD.

## Judging criteria
TBD. Copy the rubric here at the opening ceremony.

## Prize tracks (MLH)
| Track | Prize | What qualifies | Target |
|---|---|---|---|
| Best Use of ElevenLabs | Wireless earbuds | Gives the hack a voice: realistic, expressive AI audio (voices, narration, voice agents) via ElevenLabs | TBD |
| Best Use of Gemini API | MLH swag kits | AI features built on the Google Gemini API (chat, summarising, generating content or code) | TBD |
| Best Use of Entire | Mini portable projector | Uses as many Entire capabilities as possible (Sessions, Graph, Brain, Trails) for human-AI collaboration, clean history and measurable token efficiency | Yes, via the workflow itself: Sessions, Graph, Brain, Trails (checklist in `docs/PLAYBOOK.md`) |
| Best Use of Solana | Unruggable hardware wallets | Relies on Solana's fast, near-zero-fee transactions (games, social, DeFi, payments, identity, supply chain) | TBD |
| Best Use of Tiger Data | Stream Deck Mini | Innovative, performance-driven use of Tiger Data (PostgreSQL for real-time, time-series and analytics) | TBD |
| Best Use of Vultr | Assorted prizes | Runs the hack on Vultr (cloud compute, one-click deploy, Cloud GPUs; free credits) | TBD |
| DEV Writing Challenge | $100 | A post on DEV about what we built; picked monthly for substance, originality, storytelling and popularity | TBD |
| Best Use of MongoDB Atlas | M5Stack IoT Kit | The hack's data lives in MongoDB Atlas (free tier or $50 student credit) | TBD |

Promo codes and credits (ElevenLabs, Entire, Vultr, MongoDB) come from the MLH email. Never commit
them.

## Constraints
- MLH rules: only work done during the event is judged.
- This framework (`hq`, agent rules, docs, GitHub templates) is pre-event tooling, prepared before
  DurHack and disclosed in `README.md`. The submission repo is created from it at kick-off and
  all product code is written during the event.
- Secrets live in `.env` only. Never commit them or paste them into an agent prompt.
