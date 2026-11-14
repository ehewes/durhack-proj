-- Night series (docs/ARCHITECTURE.md). `db` is relative dB from the phone, never calibrated
-- and never raw audio. The night service writes sleep_stages and vitals only with health consent.

create table if not exists night_noise (
  time timestamptz not null,
  night_id uuid not null,
  db double precision not null
);

select create_hypertable('night_noise', 'time', if_not_exists => true);

create unique index if not exists night_noise_night_time_idx
  on night_noise (night_id, time);

create table if not exists sleep_stages (
  night_id uuid not null,
  start timestamptz not null,
  "end" timestamptz not null,
  stage text not null,
  constraint sleep_stages_stage_chk check (stage in ('inBed', 'awake', 'core', 'deep', 'rem')),
  primary key (night_id, start)
);

create table if not exists vitals (
  time timestamptz not null,
  night_id uuid not null,
  metric text not null,
  value double precision not null,
  constraint vitals_metric_chk check (metric in ('hr', 'hrv', 'resp'))
);

select create_hypertable('vitals', 'time', if_not_exists => true);

create unique index if not exists vitals_night_metric_time_idx
  on vitals (night_id, metric, time);
