import type { AudioSample, KipAudioNative, SpikeEvent, StartOptions } from "./types";

// Development stub: every value is generated, never measured, and every payload has `simulated: true`.
// No clips are produced: spikes are reported as `speechDropped` so no consumer gets a fake URI.
const SPIKE_EVERY_SAMPLES = 20;

const sampleListeners = new Set<(s: AudioSample) => void>();
const spikeListeners = new Set<(s: SpikeEvent) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function startSimulation({ spikeThresholdDb }: StartOptions) {
  let n = 0;
  timer = setInterval(() => {
    n += 1;
    const isSpike = n % SPIKE_EVERY_SAMPLES === 0;
    const relativeDb = isSpike ? spikeThresholdDb + 2 : Math.random() * 3 - 1.5;
    const t = Date.now();
    for (const cb of sampleListeners) cb({ t, relativeDb, simulated: true });
    if (isSpike) {
      for (const cb of spikeListeners)
        cb({ t, peakDb: relativeDb, speechDropped: true, simulated: true });
    }
  }, 1000);
}

const module: KipAudioNative = {
  async start(options) {
    if (timer !== undefined) return;
    console.warn("[kip-audio] web stub: emitting SIMULATED samples");
    startSimulation(options);
  },
  async stop() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  },
  isRecording: () => timer !== undefined,
  async deleteClip() {},
  addListener(event: "onSample" | "onSpike", cb: never) {
    const set = (event === "onSample" ? sampleListeners : spikeListeners) as Set<typeof cb>;
    set.add(cb);
    return { remove: () => void set.delete(cb) };
  },
};

export default module;
