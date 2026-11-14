export type CachedBriefing = {
  userId: string;
  fingerprint: string;
  text: string;
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
    entry: {
      userId: string;
      fingerprint: string;
      text: string;
      audio: Uint8Array<ArrayBufferLike>;
    },
  ): void;
};

export function createBriefingCache(): BriefingCache {
  const entries = new Map<string, CachedBriefing>();
  return {
    read(nightId) {
      const entry = entries.get(nightId);
      if (!entry) return undefined;
      return { ...entry, audio: copyAudio(entry.audio) };
    },
    write(nightId, entry) {
      entries.set(nightId, { ...entry, audio: copyAudio(entry.audio) });
    },
  };
}

const sharedCache = createBriefingCache();

/** Process-local audio for the mounted route. Restarting the API clears it. */
export function briefingCache(): BriefingCache {
  return sharedCache;
}
