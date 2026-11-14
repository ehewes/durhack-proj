# Observatory sensors near Newcastle centre

Live readings from the Urban Observatory API v2 (`https://api.v2.urbanobservatory.ac.uk`), captured on 2026-11-14. No API key. This file is a snapshot of that capture, not simulated data.

City centre is Grey's Monument, 54°58′26″N 1°36′47″W (54.973889, -1.613056). "Within about 3 km" means a haversine distance of 3.0 km or less. Each query used the square around that circle, then rows were filtered to the circle. Every sensor returned by those queries was inside the circle.

The client that calls this API is `apps/server/src/integrations/observatory.ts`. Parser tests run on the saved responses in `apps/server/src/integrations/fixtures/observatory/`.

## Noise

Catalogue variables `Sound` and `Max Sound`, unit `db` (the catalogue's spelling of decibels). Theme `Noise`.

In the 24 hours ending 14:51Z, one sensor reported `Sound`: 1362 readings, timestamps `2026-11-13T14:52:00Z` through `2026-11-14T13:59:00Z`. The same sensor reports `Max Sound` (1361 readings in that window). Nothing else in the API reported either variable. A second pull shortly after 14:55Z, asking for the previous 3 hours, still ended at `2026-11-14T13:59:00Z` (`Sound` 83.5, `Max Sound` 89.0). The noise feed was about an hour behind the API clock.

That sensor is 4.25 km from Grey's Monument, outside the 3 km circle. `Sound` and `Max Sound` inside the circle: none.

| id | name | latitude | longitude | km | unit | broker |
| --- | --- | --- | --- | --- | --- | --- |
| 80410 | PER_AIRMON_MESH1822245 | 54.996419 | -1.559245 | 4.25 | db | aq_mesh_api |

## NO2

Catalogue variable `NO2`, unit `ugm -3` (micrograms per cubic metre, as the catalogue spells it). Theme `Air Quality`. `NO2 Concentration` returned no readings in the box.

7142 readings across 8 pages, for the 24 hours ending between 14:52Z and 14:54Z. Fifteen sensors, all within 3 km. Latest value is the newest sample in that window, rounded to 2 decimal places.

| id | name | latitude | longitude | km | unit | readings | flagged | latest (UTC) | latest value |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 79164 | PER_AIRMON_MESH1921150 | 54.972662 | -1.614127 | 0.15 | ugm -3 | 1415 | 0 | 2026-11-14T14:29:00Z | 45.51 |
| 79204 | PER_AIRMON_MESH1968150 | 54.971490 | -1.614848 | 0.29 | ugm -3 | 1416 | 20 | 2026-11-14T14:29:00Z | 55.14 |
| 79525 | PER_AIRMON_MONITOR1135100 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 92 | 0 | 2026-11-14T14:15:00Z | 24.80 |
| 80137 | PER_TTN_AIRQUALITY004 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 151 | 17 | 2026-11-14T14:45:39Z | 65.00 |
| 80138 | PER_TTN_AIRQUALITY005 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 149 | 0 | 2026-11-14T14:40:11Z | 66.00 |
| 80139 | PER_TTN_AIRQUALITY006 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 149 | 0 | 2026-11-14T14:41:51Z | 104.00 |
| 80140 | PER_TTN_AIRQUALITY007 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 151 | 0 | 2026-11-14T14:44:08Z | 66.00 |
| 80141 | PER_TTN_AIRQUALITY008 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 152 | 0 | 2026-11-14T14:47:02Z | 83.00 |
| 80142 | PER_TTN_AIRQUALITY009 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 150 | 0 | 2026-11-14T14:47:55Z | 65.00 |
| 80144 | PER_TTN_AIRQUALITY011 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 148 | 0 | 2026-11-14T14:48:47Z | 66.00 |
| 80159 | PER_TTN_AIRQUALITY012 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 151 | 0 | 2026-11-14T14:48:20Z | 91.00 |
| 79565 | PER_AIRMON_MONITOR1157100 | 54.970093 | -1.623043 | 0.76 | ugm -3 | 94 | 0 | 2026-11-14T14:15:00Z | 42.68 |
| 79191 | PER_AIRMON_MONITOR1056100 | 54.965650 | -1.603410 | 1.10 | ugm -3 | 93 | 0 | 2026-11-14T14:15:00Z | 34.18 |
| 79165 | PER_AIRMON_MESH1922150 | 54.991308 | -1.609327 | 1.95 | ugm -3 | 1415 | 0 | 2026-11-14T14:29:00Z | 117.59 |
| 79207 | PER_AIRMON_MESH1971150 | 54.991159 | -1.583791 | 2.68 | ugm -3 | 1416 | 0 | 2026-11-14T14:29:00Z | 30.66 |

`PER_AIRMON_MONITOR1135100` and the nine `PER_TTN_AIRQUALITY*` rows share one coordinate. Cadence is about one sample a minute for the `MESH*` series (~1416 readings), about every 15 minutes for `MONITOR*` (~93), and about every 10 minutes for `PER_TTN_*` (~150).

## PM2.5

Catalogue variable `PM2.5`, unit `ugm -3`. Theme `Air Quality`. `Pm2.5 Concentration` returned no readings in the box.

5630 readings across 6 pages, same window as NO2. Thirteen sensors, all within 3 km. `PER_AIRMON_MESH1968150` and `PER_AIRMON_MONITOR1157100` reported NO2 and did not report PM2.5 in this window.

| id | name | latitude | longitude | km | unit | readings | flagged | latest (UTC) | latest value |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 79164 | PER_AIRMON_MESH1921150 | 54.972662 | -1.614127 | 0.15 | ugm -3 | 1416 | 0 | 2026-11-14T14:29:00Z | 5.01 |
| 79525 | PER_AIRMON_MONITOR1135100 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 94 | 0 | 2026-11-14T14:15:00Z | 9.57 |
| 80137 | PER_TTN_AIRQUALITY004 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 151 | 0 | 2026-11-14T14:45:39Z | 6.86 |
| 80138 | PER_TTN_AIRQUALITY005 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 149 | 0 | 2026-11-14T14:40:11Z | 7.37 |
| 80139 | PER_TTN_AIRQUALITY006 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 149 | 0 | 2026-11-14T14:41:51Z | 42.42 |
| 80140 | PER_TTN_AIRQUALITY007 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 151 | 0 | 2026-11-14T14:44:08Z | 5.34 |
| 80141 | PER_TTN_AIRQUALITY008 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 151 | 0 | 2026-11-14T14:47:02Z | 6.55 |
| 80142 | PER_TTN_AIRQUALITY009 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 149 | 0 | 2026-11-14T14:47:55Z | 5.17 |
| 80144 | PER_TTN_AIRQUALITY011 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 148 | 0 | 2026-11-14T14:48:47Z | 6.65 |
| 80159 | PER_TTN_AIRQUALITY012 | 54.979118 | -1.617676 | 0.65 | ugm -3 | 151 | 0 | 2026-11-14T14:48:20Z | 6.47 |
| 79191 | PER_AIRMON_MONITOR1056100 | 54.965650 | -1.603410 | 1.10 | ugm -3 | 94 | 0 | 2026-11-14T14:15:00Z | 9.22 |
| 79165 | PER_AIRMON_MESH1922150 | 54.991308 | -1.609327 | 1.95 | ugm -3 | 1411 | 0 | 2026-11-14T14:29:00Z | 1.46 |
| 79207 | PER_AIRMON_MESH1971150 | 54.991159 | -1.583791 | 2.68 | ugm -3 | 1416 | 0 | 2026-11-14T14:29:00Z | 0.64 |

## Request rate and API behaviour

The survey sent one request at a time and paused 350 ms after each response. Pages held 1000 readings. A page took about 0.9 to 1.3 seconds of server time, so the pace was about one request every 1.5 seconds. The NO2 walk was 8 requests and the PM2.5 walk was 6, plus a handful of probes. No HTTP 429. The client leaves at least 1 second between request starts (`minIntervalMs`, default 1000) and asks for 1000 rows a page.

- `Pagination.Next` and `Previous` point at `http://uoweb3.ncl.ac.uk`, not the public HTTPS host. When a request repeats `variables`, `Next` keeps only the last variable (a `Sound` + `Max Sound` query produced a next link for `Max Sound` only). The client advances with `limit` and `offset` on `https://api.v2.urbanobservatory.ac.uk` and does not follow `Next`.
- Reading timestamps are UTC with no offset (`2026-11-14T12:01:00`). `Start` and `End` sometimes include `Z` and fractional seconds, and sometimes neither. The client treats a missing offset as UTC. History bounds are sent as UTC instants with `Z`, which the API accepts. A string bound is a Europe/London wall time (GMT or BST, including the night window 23:00 to 07:00). A wall time in the March gap throws. On the October overlap the earlier instant, still BST, is used.
- `last_n_hours` is measured from the server clock at that request, so pages of one walk are not a single frozen window. The gap here was a few seconds.
- `/sensors/json` is a location catalogue. The 3 km square held 928 sensors on this capture, and the catalogue does not say what a sensor measures or when it last reported. Liveness is whichever names appear in `/sensors/data/json`.
- The noise series lagged the API clock by about an hour (newest sample 13:59Z on requests at 14:51Z and again after 14:55Z). NO2 and PM2.5 samples were current, the newest within a few minutes of the request.
- Two NO2 series carried flagged samples: `PER_AIRMON_MESH1968150` (20 of 1416) and `PER_TTN_AIRQUALITY004` (17 of 151). The reading's `flagged` field is kept for the caller.
