import { z } from "zod";
import { requireEnv } from "../env";

/**
 * The only ElevenLabs client: briefing speech, Scribe audio-event tags, and
 * the demo sound effect. Audio bytes are returned to the caller and never
 * written or logged. No health values or request bodies are logged.
 *
 * `ELEVENLABS_API_KEY` authenticates every call. `speak` reads the voice from
 * `ELEVENLABS_VOICE_ID`. `ELEVENLABS_TIMEOUT_MS` overrides the 30s timeout.
 */

const BASE_URL = "https://api.elevenlabs.io/v1";
const OUTPUT_FORMAT = "mp3_44100_128";
const TTS_MODEL = "eleven_multilingual_v2";
const SCRIBE_MODEL = "scribe_v3";
const SOUND_MODEL = "eleven_text_to_sound_v3";
const DEFAULT_TIMEOUT_MS = 30_000;
const ATTEMPTS = 2;

const transcriptSchema = z.object({
  words: z.array(
    z.object({
      text: z.string(),
      type: z.string(),
      start: z.number().nullish(),
      end: z.number().nullish(),
    }),
  ),
});

/** One Scribe audio-event tag, for example "(drilling)", with its timing. */
export type AudioEventTag = {
  text: string;
  startSeconds: number | null;
  endSeconds: number | null;
};

export class ElevenLabsError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ElevenLabsError";
    this.status = status;
  }
}

function voiceId(): string {
  const value = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (!value) throw new ElevenLabsError("ELEVENLABS_VOICE_ID is not set");
  return value;
}

function timeoutMs(): number {
  const raw = process.env.ELEVENLABS_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // The failed body is only discarded so the retry can open a new request.
  }
}

type RequestParts = { url: string; init: RequestInit };

/** One attempt, then a single retry on timeout, network failure, 408, 429 or 5xx. */
async function send(build: () => RequestParts): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const { url, init } = build();
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs()) });
      if (res.ok) return res;
      await discard(res);
      const error = new ElevenLabsError(`ElevenLabs request failed (${res.status})`, res.status);
      if (attempt === 0 && retryableStatus(res.status)) {
        last = error;
        continue;
      }
      throw error;
    } catch (error) {
      if (error instanceof ElevenLabsError) throw error;
      last = error;
      if (attempt === 0) continue;
      throw error instanceof Error ? error : new ElevenLabsError("ElevenLabs request failed");
    }
  }
  throw last instanceof Error ? last : new ElevenLabsError("ElevenLabs request failed");
}

function authHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  headers.set("xi-api-key", requireEnv("ELEVENLABS_API_KEY"));
  return headers;
}

async function audioBytes(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

/** Briefing speech as mp3 bytes. The voice id comes from `ELEVENLABS_VOICE_ID`. */
export async function speak(text: string): Promise<Uint8Array> {
  requireEnv("ELEVENLABS_API_KEY");
  const voice = voiceId();
  const res = await send(() => ({
    url: `${BASE_URL}/text-to-speech/${encodeURIComponent(voice)}?output_format=${OUTPUT_FORMAT}`,
    init: {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "audio/mpeg" }),
      body: JSON.stringify({ text, model_id: TTS_MODEL }),
    },
  }));
  return audioBytes(res);
}

function audioEventTags(payload: unknown): AudioEventTag[] {
  const parsed = transcriptSchema.safeParse(payload);
  if (!parsed.success) throw new ElevenLabsError("ElevenLabs returned an unreadable transcript");
  return parsed.data.words
    .filter((word) => word.type === "audio_event")
    .map((word) => ({
      text: word.text,
      startSeconds: word.start ?? null,
      endSeconds: word.end ?? null,
    }));
}

/** Scribe audio-event tags for a clip. Speech and spacing tokens are dropped. */
export async function tagAudio(bytes: Uint8Array): Promise<AudioEventTag[]> {
  const res = await send(() => {
    const form = new FormData();
    form.append("model_id", SCRIBE_MODEL);
    form.append("tag_audio_events", "true");
    form.append("timestamps_granularity", "word");
    form.append("file", new Blob([bytes]), "clip.bin");
    return {
      url: `${BASE_URL}/speech-to-text`,
      init: { method: "POST", headers: authHeaders(), body: form },
    };
  });
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new ElevenLabsError("ElevenLabs returned an unreadable transcript");
  }
  return audioEventTags(payload);
}

/** Demo-clip sound effect as mp3 bytes. `seconds` must be from 0.5 to 30. */
export async function soundEffect(prompt: string, seconds: number): Promise<Uint8Array> {
  if (!Number.isFinite(seconds) || seconds < 0.5 || seconds > 30) {
    throw new ElevenLabsError("Sound effect length must be between 0.5 and 30 seconds");
  }
  const res = await send(() => ({
    url: `${BASE_URL}/sound-generation?output_format=${OUTPUT_FORMAT}`,
    init: {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "audio/mpeg" }),
      body: JSON.stringify({
        text: prompt,
        duration_seconds: seconds,
        model_id: SOUND_MODEL,
      }),
    },
  }));
  return audioBytes(res);
}
