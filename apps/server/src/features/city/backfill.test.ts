import { describe, expect, test } from "bun:test";
import {
  NEWCASTLE_CITY_CENTRE,
  type ObservatoryHistory,
  type ObservatorySensor,
} from "../../integrations/observatory";
import {
  type BackfillChunk,
  backfillCity,
  backfillDays,
  chunkKey,
  londonDayStart,
  readingCountsStatement,
  sensorCountLines,
} from "./backfill";
import type { SensorReadingInsert, SensorUpsert } from "./repo";

// 00:45 GMT on Sunday 15 November 2026: London is on GMT, so today is 2026-11-15.
const NOW = new Date("2026-11-15T00:45:00Z");

const INSIDE: ObservatorySensor = {
  id: "inside-1",
  name: "PER_AIRMON_INSIDE",
  latitude: NEWCASTLE_CITY_CENTRE.latitude,
  longitude: NEWCASTLE_CITY_CENTRE.longitude,
  broker: "fixture",
  heightAboveGround: 2,
};

// About 5.5 km north of Grey's Monument: inside the query square, outside the 3 km circle.
const FAR: ObservatorySensor = { ...INSIDE, id: "far-1", name: "PER_AIRMON_FAR", latitude: 55.023 };

type HistoryCall = { start: Date; end: Date; variables: readonly string[] };

function fakeClient() {
  const calls: HistoryCall[] = [];
  return {
    calls,
    async history(query: {
      start: Date | string;
      end: Date | string;
      variables?: readonly string[];
    }): Promise<ObservatoryHistory> {
      const start = query.start as Date;
      const end = query.end as Date;
      const variable = query.variables?.[0] ?? "";
      calls.push({ start, end, variables: query.variables ?? [] });
      const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
      return {
        start,
        end,
        sensors: [INSIDE, FAR],
        readings: [
          { sensorName: INSIDE.name, variable, value: 40, time: at(10), flagged: false },
          { sensorName: INSIDE.name, variable, value: 41, time: at(20), flagged: false },
          // Dropped like the live pull drops them: flagged, not finite, outside the circle.
          { sensorName: INSIDE.name, variable, value: 99, time: at(30), flagged: true },
          { sensorName: INSIDE.name, variable, value: Number.NaN, time: at(40), flagged: false },
          { sensorName: FAR.name, variable, value: 50, time: at(10), flagged: false },
        ],
      };
    },
  };
}

function fakeRepo() {
  const inserts: SensorReadingInsert[][] = [];
  const sensors: SensorUpsert[] = [];
  return {
    inserts,
    sensors,
    async insertReadings(rows: SensorReadingInsert[]) {
      inserts.push(rows);
    },
    async upsertSensors(points: SensorUpsert[]) {
      sensors.push(...points);
    },
  };
}

function fakeStore(initial: string[] = []) {
  const done = new Set(initial);
  const marked: BackfillChunk[] = [];
  return {
    done,
    marked,
    async doneChunks() {
      return new Set(done);
    },
    async markChunk(chunk: BackfillChunk) {
      marked.push(chunk);
      done.add(chunkKey(chunk.day, chunk.metric));
    },
  };
}

describe("backfill days", () => {
  test("covers today and the 35 days before it, oldest first", () => {
    const days = backfillDays(NOW);
    expect(days).toHaveLength(36);
    expect(days[0]).toBe("2026-10-11");
    expect(days.at(-1)).toBe("2026-11-15");
  });

  test("uses London days, so the clock-change Sunday is 25 hours long", () => {
    expect(londonDayStart("2026-10-25").toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(londonDayStart("2026-10-26").toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("backfill run", () => {
  test("loads every day of every series with the live pull's filters, in batches", async () => {
    const client = fakeClient();
    const repo = fakeRepo();
    const store = fakeStore();
    const summary = await backfillCity({ client, repo, store, now: NOW, batchSize: 1 });

    expect(client.calls).toHaveLength(36 * 3);
    expect(new Set(client.calls.map((c) => c.variables.join()))).toEqual(
      new Set(["Sound", "NO2", "PM2.5"]),
    );
    // The clock-change day is fetched as one 25-hour London day.
    const dst = client.calls.find((c) => c.start.toISOString() === "2026-10-24T23:00:00.000Z");
    expect(dst?.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    // Today stops at now.
    expect(client.calls.at(-1)?.end).toEqual(NOW);

    // Two good readings per chunk from the sensor inside the circle, one row per insert.
    expect(summary.stored).toBe(36 * 3 * 2);
    expect(repo.inserts.every((batch) => batch.length === 1)).toBe(true);
    expect(repo.inserts.flat().every((row) => row.sensorId === INSIDE.id)).toBe(true);
    expect(new Set(repo.sensors.map((s) => s.sensorId))).toEqual(new Set([INSIDE.id]));
    expect(summary.sensors).toBe(1);

    // Every finished day is marked; today is not.
    expect(store.marked).toHaveLength(35 * 3);
    expect(store.marked.some((chunk) => chunk.day === "2026-11-15")).toBe(false);
    expect(summary).toMatchObject({ fetched: 36 * 3, skipped: 0 });
  });

  test("a rerun resumes: marked days are skipped and only today is fetched again", async () => {
    const store = fakeStore();
    await backfillCity({ client: fakeClient(), repo: fakeRepo(), store, now: NOW });

    const client = fakeClient();
    const summary = await backfillCity({ client, repo: fakeRepo(), store, now: NOW });
    expect(client.calls).toHaveLength(3);
    expect(client.calls.every((c) => c.end.getTime() === NOW.getTime())).toBe(true);
    expect(summary).toMatchObject({ fetched: 3, skipped: 35 * 3 });
  });

  test("--force fetches everything again", async () => {
    const days = backfillDays(NOW).slice(0, -1);
    const store = fakeStore(
      days.flatMap((day) => ["noise_db", "no2", "pm25"].map((m) => `${day}/${m}`)),
    );
    const client = fakeClient();
    await backfillCity({ client, repo: fakeRepo(), store, now: NOW, force: true });
    expect(client.calls).toHaveLength(36 * 3);
  });
});

describe("backfill report", () => {
  test("counts nights as 23:00 to 07:00 London, named by the evening", () => {
    const statement = readingCountsStatement(new Date("2026-10-10T23:00:00Z"));
    expect(statement.text).toContain("interval '7 hours'");
    expect(statement.text).toContain(">= 23");
    expect(statement.text).toContain("< 7");
    expect(statement.text).toContain("where time >= $1");
    expect(statement.values).toEqual([new Date("2026-10-10T23:00:00Z")]);
  });

  test("prints one line per sensor with nights and readings per metric", () => {
    expect(
      sensorCountLines([
        { sensorId: "B", metric: "pm25", readings: 900, nights: 35 },
        { sensorId: "A", metric: "no2", readings: 1200, nights: 34 },
        { sensorId: "B", metric: "no2", readings: 1000, nights: 35 },
      ]),
    ).toEqual([
      "A: noise_db none, no2 34 nights (1200 readings), pm25 none",
      "B: noise_db none, no2 35 nights (1000 readings), pm25 35 nights (900 readings)",
    ]);
  });
});
