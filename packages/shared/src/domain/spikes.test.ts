import { describe, expect, test } from "bun:test";
import { detectSpikes, SPIKE_MIN_BASELINE_SAMPLES, SPIKE_THRESHOLD_DB } from "./spikes";

const QUIET = 30;

function quietSeconds(count: number, db = QUIET): [number, number][] {
  return Array.from({ length: count }, (_, t) => [t, db]);
}

describe("detectSpikes", () => {
  test("flags a level at the threshold above the rolling median", () => {
    const samples = quietSeconds(SPIKE_MIN_BASELINE_SAMPLES);
    const t = samples.length;
    samples.push([t, QUIET + SPIKE_THRESHOLD_DB]);
    expect(detectSpikes(samples)).toEqual([{ t, peakDb: QUIET + SPIKE_THRESHOLD_DB }]);
  });

  test("ignores a level just under the threshold", () => {
    const samples = quietSeconds(SPIKE_MIN_BASELINE_SAMPLES);
    samples.push([samples.length, QUIET + SPIKE_THRESHOLD_DB - 0.1]);
    expect(detectSpikes(samples)).toEqual([]);
  });

  test("uses the average of the two middle values for an even window", () => {
    const half = SPIKE_MIN_BASELINE_SAMPLES / 2;
    const samples: [number, number][] = [];
    for (let t = 0; t < half; t++) samples.push([t, 20]);
    for (let t = half; t < SPIKE_MIN_BASELINE_SAMPLES; t++) samples.push([t, 40]);
    // Median of 15 twenties and 15 forties is 30. 40 is exactly 30 + threshold.
    const t = SPIKE_MIN_BASELINE_SAMPLES;
    samples.push([t, 40]);
    expect(detectSpikes(samples)).toEqual([{ t, peakDb: 40 }]);
  });

  test("collapses a loud stretch into one spike at the peak", () => {
    const samples = quietSeconds(SPIKE_MIN_BASELINE_SAMPLES);
    const start = samples.length;
    samples.push([start, 45], [start + 1, 50], [start + 2, 42], [start + 3, QUIET]);
    expect(detectSpikes(samples)).toEqual([{ t: start + 1, peakDb: 50 }]);
  });

  test("splits loud samples that are more than the gap apart", () => {
    const samples = quietSeconds(SPIKE_MIN_BASELINE_SAMPLES);
    const start = samples.length;
    samples.push([start, 50], [start + 1, QUIET], [start + 10, 48]);
    expect(detectSpikes(samples)).toEqual([
      { t: start, peakDb: 50 },
      { t: start + 10, peakDb: 48 },
    ]);
  });

  test("does not spike the same level once the baseline has risen", () => {
    const samples: [number, number][] = [];
    for (let t = 0; t < SPIKE_MIN_BASELINE_SAMPLES; t++) samples.push([t, QUIET]);
    for (let t = SPIKE_MIN_BASELINE_SAMPLES; t < SPIKE_MIN_BASELINE_SAMPLES + 400; t++) {
      samples.push([t, 50]);
    }
    const under = samples.length;
    samples.push([under, 55]);
    const over = samples.length;
    samples.push([over, 60]);

    const spikes = detectSpikes(samples);
    expect(spikes).toHaveLength(2);
    expect(spikes[0]).toMatchObject({ peakDb: 50 });
    expect(spikes[1]).toEqual({ t: over, peakDb: 60 });
    expect(spikes[0]?.t).toBeLessThan(under);
  });

  test("returns nothing for an empty or quiet night", () => {
    expect(detectSpikes([])).toEqual([]);
    expect(detectSpikes(quietSeconds(120))).toEqual([]);
  });

  test("skips non-finite samples and does not mutate the input", () => {
    const samples: [number, number][] = quietSeconds(SPIKE_MIN_BASELINE_SAMPLES);
    samples.push([Number.NaN, 90]);
    samples.push([samples.length, Number.POSITIVE_INFINITY]);
    const loudAt = samples.length;
    samples.push([loudAt, QUIET + SPIKE_THRESHOLD_DB]);
    const snapshot = samples.map(([t, db]): [number, number] => [t, db]);
    expect(detectSpikes(samples)).toEqual([{ t: loudAt, peakDb: QUIET + SPIKE_THRESHOLD_DB }]);
    expect(samples).toEqual(snapshot);
  });

  test("orders unsorted samples by time", () => {
    const samples = quietSeconds(SPIKE_MIN_BASELINE_SAMPLES);
    const t = samples.length;
    samples.push([t, QUIET + SPIKE_THRESHOLD_DB]);
    expect(detectSpikes([...samples].reverse())).toEqual(detectSpikes(samples));
  });
});
