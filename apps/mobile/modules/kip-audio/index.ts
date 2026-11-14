import KipAudioModule from "./src/KipAudioModule";
import type { AudioSample, SpikeEvent, StartOptions, Unsubscribe } from "./src/types";

export type { AudioSample, SpikeEvent, StartOptions, Unsubscribe } from "./src/types";
export { CLIP_FORMAT, CLIP_SECONDS } from "./src/types";

/** Begin metering at 1 Hz and keeping a 10 s clip around each spike. Idempotent while recording. */
export function start(options: StartOptions): Promise<void> {
  return KipAudioModule.start(options);
}

export function stop(): Promise<void> {
  return KipAudioModule.stop();
}

export function isRecording(): boolean {
  return KipAudioModule.isRecording();
}

/** 1 Hz relative-dB samples while recording. */
export function onSample(cb: (sample: AudioSample) => void): Unsubscribe {
  const sub = KipAudioModule.addListener("onSample", cb);
  return () => sub.remove();
}

/** A spike carries either `clipUri` or `speechDropped: true`. */
export function onSpike(cb: (spike: SpikeEvent) => void): Unsubscribe {
  const sub = KipAudioModule.addListener("onSpike", cb);
  return () => sub.remove();
}

/** Delete a clip once it is uploaded or no longer needed. */
export function deleteClip(uri: string): Promise<void> {
  return KipAudioModule.deleteClip(uri);
}
