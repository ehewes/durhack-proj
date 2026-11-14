/** Browser playback for the web dashboard. One clip at a time. */
let current: HTMLAudioElement | null = null;

export function briefingPlaybackSupported(): boolean {
  return typeof Audio !== "undefined";
}

export function stopBriefing(): void {
  if (!current) return;
  current.pause();
  current.src = "";
  current = null;
}

export function playBriefing(url: string): Promise<void> {
  stopBriefing();
  const audio = new Audio(url);
  current = audio;
  return audio.play();
}
