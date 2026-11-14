import { expect, test } from "bun:test";
import { nightUpload } from "./upload";

test("accepts a live-mode night without sleep data", () => {
  const result = nightUpload.safeParse({
    nightId: "4f7b1c5e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
    userId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    startedAt: "2026-11-14T23:00:00+00:00",
    endedAt: "2026-11-15T07:00:00+00:00",
    consent: { microphone: true, health: false, location: false },
    noise: { baselineDb: 32, samples: [[1794870000, 33.5]] },
    spikes: [{ t: 1794870000, peakDb: 61 }],
  });
  expect(result.success).toBe(true);
});
