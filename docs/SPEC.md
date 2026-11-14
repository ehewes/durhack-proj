# Spec

What we build. `/hq-plan` turns it into issues. Business detail is in `docs/BUSINESS.md`, the
science and wording rules in `docs/DOMAIN.md`.

## Problem
The city measures night noise, but people feel it, and nobody connects the two. Newcastle's
Urban Observatory publishes kerbside noise levels and WHO publishes how night noise disturbs sleep,
yet a resident can't tell what woke them, and a traveller can't tell that a hotel overlooks a
24-hour demolition site. Bewick Court residents were kept awake until 5am by demolition under a
24-hour permit, and no open dataset recorded it.

## Product
Kip shows how the city's noise affects sleep, street by street, and turns that into a Quiet Stay
Score for every hotel in Newcastle. It has three layers:

| Layer | Feature | What the user sees |
|---|---|---|
| City | City sleep map | Each Observatory noise sensor shaded by an indicative % of nearby residents highly sleep disturbed |
| Personal | Personal night | Timeline of sleep stages, bedroom noise and wake-ups, each tagged with its likely cause |
| Personal | Morning briefing | Spoken summary on Watch or AirPods: "Two wake-ups followed drilling at 06:41, before the 8am limit" |
| Personal | Evidence log | An out-of-hours noise report for the council, its hash anchored on Solana |
| Business | Quiet Stays | Hotels ranked by predicted sleep quality for the traveller's profile, with booking links |

City map and Personal night are the core; the rest build on them.

## Users
- **Resident** near construction or nightlife: wants to know what wakes them and whether it broke
  the council's construction hours, with evidence they can send.
- **Traveller** choosing a Newcastle hotel: wants to know where they will sleep well, weighted for
  how they travel (light sleeper, night out, best value, business).
- **Judges**: see real city data, a real recorded night and one live noise event.

## Demo script (3 min)
One live moment carries the pitch: a drilling sound hits the phone, and Kip labels it, checks the
council's hours and briefs you within seconds.

| # | Time | Step | P |
|---|---|---|---|
| 1 | 0:00 | Hook: Bewick Court. "Where in Newcastle would you sleep worst tonight? Nobody can tell you. Kip can." | P0 |
| 2 | 0:20 | City map: real Observatory data, sensors shaded by an indicative 30-night estimate of residents highly sleep disturbed | P0 |
| 3 | 0:50 | Live noise event: phone on the table in demo mode (no Watch data). ElevenLabs-generated drilling clip played from a speaker held against it. Dashboard shows the spike, Gemini labels it "construction", Kip flags it as outside council hours, the ElevenLabs briefing plays | P0 |
| 4 | 1:40 | A real night recorded at home: sleep stages, bedroom noise, wake-ups, shown as counts against the random baseline | P0 |
| 5 | 2:10 | Quiet Stays: switch profile "Light sleeper" to "Night out", ranking reorders; a hotel penalised for works on the stay dates | P0 |
| 6 | 2:35 | Trust: edit a log, show it no longer matches its Solana memo. Flash `terraform plan` and the Entire session record | P1 |
| 7 | 2:50 | Business: affiliate commission now, Verified Quiet next, data licensing later | P0 (slide) |

If a P1 step isn't working at the freeze, cut it from the script rather than slip.

## MVP scope (M1)
- Kip app on iOS (Expo): relative dB logged once a second, a 10-second clip around each spike,
  on-device check that drops clips with speech, recording while locked, HealthKit read of the
  Watch's sleep stages, heart rate, HRV and respiratory rate after the night ends, upload to the
  API, and a live demo mode that streams dB.
- Ingest worker: Observatory noise, NO2 and PM2.5 every 5 minutes, plus a backfill of at least
  30 nights; OpenStreetMap hotels and venues.
- API: night upload, clip labelling (Gemini, then delete the clip), wake-up attribution,
  construction-hours check, briefing text (Gemini) and voice (ElevenLabs), city map data, hotel
  ranking per profile, Street Manager SNS endpoint (or a recorded sample).
- Kip app on web (same Expo codebase, the demo dashboard): city map, night timeline, live event
  view, Quiet Stays page.
- Deployed on Vultr via Terraform, HTTPS via Caddy on an sslip.io hostname.

## Non-goals
- Calibrated dB from the phone. Kip uses spikes relative to the night's own baseline.
- Room-level hotel scores. The score describes a hotel's surroundings.
- Claiming noise *caused* a wake-up. Kip shows a link.
- Real affiliate bookings. Demo links are placeholders.
- Building or demolition sites outside Street Manager, except as heard by the bedroom microphone.
- An all-night Watch workout session (drains 40% to 100% of the battery). Read HealthKit instead.

## Stretch (M2, in priority order)
1. Solana Memo anchoring and the tamper demo (P1).
2. ElevenLabs Scribe as a second noise classifier; disagreements become "uncertain" (P1).
3. Complaint draft for the council from the evidence log (P1).
4. Simulated user cohort on the map and in hotel scores, labelled as simulated (P1).
5. Native watchOS target: haptics, "something woke me" button, briefing playback. Only if Watch signing
   works in the first 2 hours (P2).
6. Air quality factor in the hotel score (P2).

## Open questions
These change the plan. Until answered, the assumption in brackets holds. Two are answered; the event
length and start time and the "35" remain open.
- Does one of us sleep at home in Newcastle during the event, near an Observatory noise sensor?
  ANSWERED (2026-11-14): No. The city map uses sensors near the venue, and demo step 4 uses a night
  exported from HealthKit.
- How long is the event, and when does it start? [24 hours from about 10am.]
- Is each team limited to one sponsor track? ANSWERED (2026-11-14): Yes. Enter MongoDB: see
  `docs/DECISIONS.md`.
- What does the "35" in the team's notes mean: a dB threshold, or a 35 m radius around a site?
  [Unknown; don't build on it.]
