# Business

How Kip makes money and what the Quiet Stay Score is. Read this for any work on hotels, scoring,
profiles or booking links. Scoring maths and wording rules are in `docs/DOMAIN.md`.

## Model
Kip recommends hotels on how well you'll sleep there and what's around them, and takes affiliate
commission on each booking. The same data that powers the city map and the personal night powers
the hotel ranking, so the business layer costs little extra to build.

## Quiet Stay Score (0 to 100)
One score per hotel, built from data Kip already collects. It describes the hotel's surroundings,
not a specific room: the side of the building and the floor can matter as much as the street.

| Input | Source | Effect on score |
|---|---|---|
| Indicative night-noise disturbance | Nearest Observatory noise sensors, distance-weighted, 30-night Lnight through the WHO road-traffic curve | Main factor |
| Active roadworks within 200 m | Street Manager permits; work scheduled at night (from proposed times and traffic management type) weighs more | Penalty for the dates of the stay only |
| Air quality at night | Observatory NO2 and PM2.5 | Small factor |
| Real nights nearby | Opted-in Kip users sleeping within 300 m | Corrects the estimate once there's enough data |
| Distance to nightlife and sights | OpenStreetMap venues | A preference, not a penalty (see profiles) |

### Profiles
Kip asks one question up front and re-weights the score.

| Profile | What Kip ranks first |
|---|---|
| Light sleeper | Lowest predicted disturbance |
| Night out | Within walking distance of nightlife, then quietest |
| Best value | Most quiet points per pound per night |
| Business | Quiet on weeknights, close to the station |

### Rules for the score
- It is an estimate and the UI says so. Every score has its sources one tap away: which sensors,
  which permits, how many real nights. Without this, low-scoring hotels will dispute it.
- Weights live in one place in `packages/shared` so the dashboard can show the breakdown.
- Simulated cohort nights are flagged and labelled wherever they affect a score.

## Revenue
1. **Affiliate commission (launch).** Booking links through affiliate networks. Booking.com cut
   thousands of smaller affiliates in 2025 and moved them to networks such as Awin and CJ;
   Expedia Group's affiliate programme and aggregators such as Travelpayouts are the other routes
   for a small team. Affiliate approval takes weeks, so the demo uses OpenStreetMap hotels with
   placeholder booking links. Don't quote a commission rate until it's confirmed.
2. **Verified Quiet (year one).** Hotels that already score well pay a yearly fee to replace the
   estimate with measured, room-by-room data from in-room sensors. Hotels that score badly get a
   free report showing which rooms and hours are the problem, as the route to a better score.
3. **Data licensing (later).** Area-level sleep disturbance data for councils, developers
   scheduling construction, and estate agents.

## Hypotheses, not findings
- Renters choosing a flat for a 12-month lease may be a bigger market than hotel guests: same
  score, higher stakes. Pitch it as the next market, not as evidence.

## Judge questions
| Question | Answer |
|---|---|
| Is this real data? | The city map, the recorded night and the permits are real; other users are simulated and labelled on the map |
| Does noise cause the wake-ups? | We claim a link, not a cause: wake-ups follow spikes more often than random moments do, shown as counts until there are enough nights for a percentage |
| Can you use the WHO curve on kerbside sensors? | Only as an indication: the curve is for long-term road-traffic noise, so we average 30 nights and label the map indicative |
| How accurate is a phone microphone? | Not calibrated, so Kip uses spikes above the night's own baseline in relative dB. The city estimate uses Observatory sensors, which were validated against precision meters |
| Do you record people's bedrooms? | Clips with speech are dropped on the phone; other clips are deleted once labelled. Health data needs explicit consent under UK GDPR, and users can delete everything |
| Why Solana? | Cheap public timestamps on mainnet that a council can check without trusting Kip. They prove when a log existed, not that it's true |
| Why two databases? | Timestamped numbers in Tiger, documents and geo queries in MongoDB |
| Why would hotels pay? | Well-scoring hotels pay to swap the estimate for measured, room-level data; low scorers get a free report on what to fix |

## Sponsor mapping
All seven sponsors do real work in Kip. The prize table with targets is in `docs/hack/BRIEF.md`.

| Sponsor | Role in Kip | What to show the judges | Fit |
|---|---|---|---|
| Vultr | Compute, Container Registry and firewall, all provisioned by Terraform | `terraform plan`, then `terraform apply -replace=vultr_instance.api` rebuilding the server while the data stays put | Strong |
| MongoDB Atlas | Users, night summaries, hotels and scores; geo queries | The hotel ranking pipeline: `$geoNear` on hotels, then `$geoWithin` lookups for nearby sensors and works | Strong |
| Gemini | Labels noise clips, writes the briefing and complaint draft, on a paid-tier key | Play a drilling clip and a siren clip; show the two labels | Strong |
| Tiger Data | All time-series data and the 30-night Lnight per sensor | The continuous aggregate that turns raw readings into the city map | Strong |
| ElevenLabs | Briefing voice, Scribe as a second classifier, Sound Effects for the demo clip | The briefing playing on AirPods, and the two classifiers agreeing | Medium to strong |
| Solana | Writes each night's log hash to mainnet with the Memo program | Edit a log on stage, re-hash it, show it no longer matches the on-chain memo | Medium |
| Entire | Records every agent session | One slide showing the recorded reasoning behind a key commit | Free win |
