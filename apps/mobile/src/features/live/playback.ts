/** iOS has no briefing player in this build. The web file plays the audio. */
export function briefingPlaybackSupported(): boolean {
  return false;
}

export function stopBriefing(): void {}

export function playBriefing(_url: string): Promise<void> {
  return Promise.reject(new Error("Briefing audio plays on the web dashboard."));
}
