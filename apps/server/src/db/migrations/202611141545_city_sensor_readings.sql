-- Newest Observatory sample per sensor and metric. A later poll of the same
-- sample hits the primary key and is ignored.
-- metric: noise_db (Sound, decibels), no2 and pm25 (micrograms per cubic metre).
create table if not exists sensor_readings (
  time timestamptz not null,
  sensor_id text not null,
  metric text not null,
  value double precision not null,
  constraint sensor_readings_metric_check check (metric in ('noise_db', 'no2', 'pm25')),
  primary key (time, sensor_id, metric)
);

select create_hypertable('sensor_readings', 'time', if_not_exists => true);

create index if not exists sensor_readings_sensor_metric_time_idx
  on sensor_readings (sensor_id, metric, time desc);
