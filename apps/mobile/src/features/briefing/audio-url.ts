/** `briefing.get` returns a path under the API ("/briefing/..."); players need an absolute URL. */
export function briefingAudioSrc(base: string, audioUrl: string): string {
  return `${base.replace(/\/+$/, "")}${audioUrl}`;
}
