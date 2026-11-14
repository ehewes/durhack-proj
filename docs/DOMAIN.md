# Domain

The science, rules and wording Kip depends on. Code that computes, labels or displays any of
these must follow this file. Constants live in `packages/shared`, not inline.

## Night noise and the WHO curve
- **Night window:** 23:00 to 07:00, `Europe/London` local time (handle BST changes).
- **Lnight:** the A-weighted equivalent level over the night window. It is an *energy* average,
  not an arithmetic mean of dB:
  `Lnight = 10 * log10(mean(10 ^ (L_i / 10)))`.
  In Tiger, average `power(10, db / 10)` and convert back with `10 * log10(...)`.
- **City estimate:** per sensor, the energy average of nightly Lnight over at least the last 30
  nights. Fewer than 30 nights: show the sensor as "not enough data", don't shade it.
- **WHO road-traffic curve** (Basner & McGuire 2018), % highly sleep disturbed:
  `%HSD = 19.4312 - 0.9336 * Lnight + 0.0126 * Lnight^2`.
  This reproduces the plan's figures (2.9% at 45 dB, 6.2% at 55 dB, 8.8% at 60 dB). Still check
  the paper before quoting more decimals.
- **Valid range:** 40 to 65 dB Lnight. Outside it, clamp for shading and mark the value as
  out of range; never extrapolate.
- **Thresholds** (WHO 2018): night-time road traffic below 45 dB Lnight, rail 44 dB, aircraft
  40 dB.
- **Limits:** the curve is for long-term road-traffic noise at a home's most exposed facade.
  Observatory sensors sit at the kerb and also pick up nightlife and voices. So the map is an
  *indicative road-traffic estimate*, never a measured disturbance rate.

## Bedroom noise (phone)
- The iPhone microphone is not calibrated. Store and show **relative dB** only.
- Sample once a second. A **spike** is a level above the night's own baseline (rolling median)
  by a threshold set in `packages/shared`. Keep a 10-second clip around each spike.
- On-device voice-activity check: any clip containing speech is dropped on the phone and never
  uploaded.

## Wake-up attribution
- **Wake-up signals:** a Watch "awake" stage during the sleep session, or a sudden heart-rate
  jump during sleep (Watch stages are coarse and miss brief arousals).
- **Method:** look for a spike in the 60 to 120 seconds before each wake-up, and compare the hit
  rate against randomly chosen windows of the same length from the same night.
- **Small numbers:** one night has 2 to 6 wake-ups. Show counts ("3 of 4 wake-ups followed a
  spike"). Show a percentage only once several nights are pooled from HealthKit history.
- HealthKit sleep stages appear only after the sleep session ends. Live demo mode needs no Watch
  data.

## Noise classification
- Labels: `construction`, `traffic`, `siren`, `snoring`, `other`, plus `uncertain`.
- Gemini (paid-tier key) labels each clip, with JSON output. ElevenLabs Scribe audio-event tags
  give a second opinion. Where they disagree, the event is `uncertain`. This stops a user's own
  snoring being blamed on the building site.
- The clip is deleted once labelled. Only the label is kept.

## Construction hours (Newcastle City Council)
Recommended hours for noisy construction work:

| Day | Allowed |
|---|---|
| Monday to Friday | 08:00 to 18:00 |
| Saturday | 08:00 to 13:00 |
| Sunday and bank holidays | None |

A `construction` event outside these hours is flagged "outside council hours". Bank holidays for
England come from `https://www.gov.uk/bank-holidays.json` (`england-and-wales`). These are
*recommended* hours: say "outside the council's recommended hours", not "illegal".

## Street Manager
DfT Street Manager pushes street and road works permits in England (location, work category,
traffic management type, proposed and actual times) over AWS SNS to a public HTTPS endpoint. The
subscription must be confirmed within 3 days. It covers roads, not building or demolition sites.
Night work is inferred from proposed times and traffic management type.

## Evidence log and Solana
Each night's log is serialised canonically, hashed (SHA-256), and the hash written to Solana
mainnet with the Memo program (no Anchor). It proves *when* a log existed, not that its contents
are true. Never claim more.

## Wording rules
Anything user-facing, in the briefing prompt, the dashboard or the pitch:

| Say | Never say |
|---|---|
| "linked to", "followed" | "caused by" |
| "indicative estimate" | "measured disturbance", "% of residents are disturbed" |
| "outside the council's recommended hours" | "illegal", "breach" |
| "relative dB" for phone data | bare "dB" for phone data |
| "simulated" on cohort data | anything implying simulated users are real |
| "proves when the log existed" | "proves the noise happened" |

## Privacy (UK GDPR)
Sleep and heart data are special-category health data.
- Explicit, separate consent per data type: microphone, HealthKit, location.
- Store only relative dB, labelled events and HealthKit summaries. No raw audio at rest.
- Audio clips are deleted once labelled; clips with speech never leave the phone.
- One action deletes everything a user has, in both databases.
- Never log raw health values or audio in server logs.
