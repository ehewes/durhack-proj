-- kip:no-transaction
-- Nightly Lnight per sensor: the energy average of noise_db from 23:00 to 07:00
-- Europe/London. PostgreSQL log() is base 10, so this is 10 * log10(mean(10^(L/10))).
--
-- Buckets are London days aligned to 07:00. The origin is 07:00 GMT (January is
-- GMT), which Timescale converts into the London clock. 23:00 through 06:59 then
-- share one bucket in GMT, BST, and both clock-change nights. Daytime rows share
-- that bucket too, and the hour filter drops them. Timescale rejects an offset
-- combined with an origin, so the alignment is the origin alone.
--
-- The bucket instant is 07:00 London on the evening the night started. Its London
-- date is the night name used by the 30-night query.
--
-- Real-time aggregation answers before the first refresh. The policy materializes
-- the last 40 days every 5 minutes and leaves the latest hour to that real-time
-- read, which still covers the Observatory lag. This file runs outside a
-- transaction because a continuous aggregate is one of the statements TimescaleDB
-- refuses inside one.

create materialized view if not exists sensor_lnight_daily
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select
  time_bucket(
    '1 day',
    time,
    'Europe/London',
    timestamptz '2000-01-03 07:00:00+00'
  ) as bucket,
  sensor_id,
  10 * log(avg(power(10, value / 10))) as lnight
from sensor_readings
where metric = 'noise_db'
  and (
    extract(hour from time at time zone 'Europe/London') >= 23
    or extract(hour from time at time zone 'Europe/London') < 7
  )
group by bucket, sensor_id
with no data;

select add_continuous_aggregate_policy(
  'sensor_lnight_daily',
  start_offset => interval '40 days',
  end_offset => interval '1 hour',
  schedule_interval => interval '5 minutes',
  if_not_exists => true,
  timezone => 'Europe/London'
);
