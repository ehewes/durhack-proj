/** Briefings the API keeps in memory. The oldest goes first. */
export const MAX_LIVE_BRIEFINGS = 20;

export type LiveAudio = {
  /** Random per briefing and part of the URL, so a player needs no user header. */
  token: string;
  audio: Uint8Array<ArrayBuffer>;
};

export type LiveAudioStore = {
  read(id: string): LiveAudio | undefined;
  /** Keep the audio and return the path it is served from. */
  write(id: string, audio: Uint8Array<ArrayBufferLike>): string;
};

export function liveAudioPath(id: string, token: string): string {
  return `/live/briefing/${encodeURIComponent(id)}/audio?token=${encodeURIComponent(token)}`;
}

export function createLiveAudioStore(limit = MAX_LIVE_BRIEFINGS): LiveAudioStore {
  const entries = new Map<string, LiveAudio>();
  return {
    read: (id) => entries.get(id),
    write(id, audio) {
      const copy = new Uint8Array(audio.byteLength);
      copy.set(audio);
      const token = crypto.randomUUID();
      entries.delete(id);
      entries.set(id, { token, audio: copy });
      for (const oldest of entries.keys()) {
        if (entries.size <= limit) break;
        entries.delete(oldest);
      }
      return liveAudioPath(id, token);
    },
  };
}

const shared = createLiveAudioStore();

/** Process-local audio for the mounted route. Restarting the API clears it. */
export function liveAudioStore(): LiveAudioStore {
  return shared;
}
