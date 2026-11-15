import { describe, expect, test } from "bun:test";
import { type NightLocationSource, readNightLocations } from "./repo";

describe("night locations for the coverage map", () => {
  test("reads only nights with location consent and a location, since the date, with the simulated flag", async () => {
    const calls: { filter: unknown; options: unknown }[] = [];
    const source: NightLocationSource = {
      find(filter, options) {
        calls.push({ filter, options });
        return {
          toArray: async () => [
            { userId: "a", location: { lat: 54.97, lon: -1.61 } },
            { userId: "s", location: { lat: 54.98, lon: -1.62 }, simulated: true },
            { userId: "x", location: null },
          ],
        };
      },
    };
    expect(await readNightLocations("2026-10-16", source)).toEqual([
      { userId: "a", lat: 54.97, lon: -1.61, simulated: false },
      { userId: "s", lat: 54.98, lon: -1.62, simulated: true },
    ]);
    expect(calls).toEqual([
      {
        filter: {
          night: { $gte: "2026-10-16" },
          location: { $ne: null },
          "consent.location": true,
        },
        options: { projection: { userId: 1, location: 1, simulated: 1 } },
      },
    ]);
  });

  test("a failed read is a night storage error, never the raw driver error", async () => {
    const source: NightLocationSource = {
      find: () => ({ toArray: () => Promise.reject(new Error("connection reset")) }),
    };
    const failure = await readNightLocations("2026-10-16", source).catch((error: unknown) => error);
    expect((failure as Error).name).toBe("NightStorageError");
  });
});
