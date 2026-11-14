import type { NightTimeline } from "@kip/shared/night";

export type Scale = {
  x: (epochSeconds: number) => number;
  y: (db: number) => number;
};

export function makeScale(night: NightTimeline, width: number, height: number): Scale {
  const start = Date.parse(night.startedAt) / 1000;
  const end = Date.parse(night.endedAt) / 1000;
  const values = [
    night.baselineDb,
    ...night.noise.map(([, db]) => db),
    ...night.events.map((e) => e.peakDb),
  ];
  const span = end > start ? end - start : 1;
  const lo = Math.min(...values) - 2;
  const hi = Math.max(...values) + 2;
  return {
    x: (t) => ((Math.min(Math.max(t, start), end) - start) / span) * width,
    y: (db) => height - ((db - lo) / (hi - lo)) * height,
  };
}

export function clock(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}
