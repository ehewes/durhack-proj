/** Nights of audio the API keeps in memory. The oldest goes first. */
export const MAX_CACHED_BRIEFINGS = 100;

export type CachedBriefing = {
  userId: string;
  fingerprint: string;
  text: string;
  /** Random per briefing and part of the audio URL, so a player needs no user header. */
  token: string;
  audio: Uint8Array<ArrayBuffer>;
};

function copyAudio(audio: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(audio.byteLength);
  copy.set(audio);
  return copy;
}

export type BriefingCache = {
  read(nightId: string): CachedBriefing | undefined;
  write(
    nightId: string,
    entry: Omit<CachedBriefing, "audio"> & { audio: Uint8Array<ArrayBufferLike> },
  ): void;
};

export function createBriefingCache(limit = MAX_CACHED_BRIEFINGS): BriefingCache {
  const entries = new Map<string, CachedBriefing>();
  return {
    read(nightId) {
      const entry = entries.get(nightId);
      if (!entry) return undefined;
      return { ...entry, audio: copyAudio(entry.audio) };
    },
    write(nightId, entry) {
      entries.delete(nightId);
      entries.set(nightId, { ...entry, audio: copyAudio(entry.audio) });
      for (const oldest of entries.keys()) {
        if (entries.size <= limit) break;
        entries.delete(oldest);
      }
    },
  };
}

const sharedCache = createBriefingCache();

/** Process-local audio for the mounted route. Restarting the API clears it. */
export function briefingCache(): BriefingCache {
  return sharedCache;
}
