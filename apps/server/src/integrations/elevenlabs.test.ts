import { afterEach, describe, expect, mock, test } from "bun:test";
import { ElevenLabsError, soundEffect, speak, tagAudio } from "./elevenlabs";

const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00]);
const clip = new Uint8Array([1, 2, 3, 4]);

const originalFetch = globalThis.fetch;
const envKeys = ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_TIMEOUT_MS"] as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) delete process.env[key];
});

function useEnv(): void {
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_VOICE_ID = "voice 1";
  process.env.ELEVENLABS_TIMEOUT_MS = "2000";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function audioResponse(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, { status, headers: { "content-type": "audio/mpeg" } });
}

function calls(): [unknown, RequestInit | undefined][] {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
  return fetchMock.mock.calls as [unknown, RequestInit | undefined][];
}

describe("speak", () => {
  test("returns mp3 bytes from the voice in env", async () => {
    useEnv();
    const fetchMock = mock(async () => audioResponse(mp3));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await speak("Night was quiet.")).toEqual(mp3);

    const [url, init] = calls()[0] ?? [];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice%201?output_format=mp3_44100_128",
    );
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("xi-api-key")).toBe("test-key");
    expect(headers.get("Authorization")).toBeNull();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "Night was quiet.",
      model_id: "eleven_multilingual_v2",
    });
  });

  test("throws before calling out when the voice is missing", async () => {
    useEnv();
    delete process.env.ELEVENLABS_VOICE_ID;
    const fetchMock = mock(async () => audioResponse(mp3));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(speak("test")).rejects.toThrow("ELEVENLABS_VOICE_ID is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("names a missing api key from a fresh process", async () => {
    const proc = Bun.spawn({
      cmd: [
        "bun",
        "-e",
        [
          'const { speak } = await import("./apps/server/src/integrations/elevenlabs.ts");',
          'try { await speak("test"); console.log("NO_THROW"); }',
          'catch (error) { console.log(error instanceof Error ? error.message : "UNKNOWN"); }',
        ].join(" "),
      ],
      cwd: `${import.meta.dir}/../../../..`,
      env: { PATH: process.env.PATH ?? "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("ELEVENLABS_API_KEY is not set (see .env.example)");
  });
});

describe("tagAudio", () => {
  test("returns only Scribe audio-event tags", async () => {
    useEnv();
    const fetchMock = mock(async (_url: unknown, init?: RequestInit) => {
      const form = init?.body;
      expect(form).toBeInstanceOf(FormData);
      if (!(form instanceof FormData)) throw new Error("expected form data");
      expect(form.get("model_id")).toBe("scribe_v3");
      expect(form.get("tag_audio_events")).toBe("true");
      const file = form.get("file");
      expect(file).toBeInstanceOf(Blob);
      if (!(file instanceof Blob)) throw new Error("expected a clip");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(clip);
      return jsonResponse({
        text: "hello (drilling)",
        words: [
          { text: "hello", type: "word", start: 0, end: 0.4 },
          { text: " ", type: "spacing", start: 0.4, end: 0.45 },
          { text: "(drilling)", type: "audio_event", start: 0.5, end: 2.2 },
          { text: "(siren)", type: "audio_event", start: null, end: null },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await tagAudio(clip)).toEqual([
      { text: "(drilling)", startSeconds: 0.5, endSeconds: 2.2 },
      { text: "(siren)", startSeconds: null, endSeconds: null },
    ]);
    const headers = new Headers(calls()[0]?.[1]?.headers);
    expect(headers.get("xi-api-key")).toBe("test-key");
    expect(headers.get("content-type")).toBeNull();
    expect(String(calls()[0]?.[0])).toBe("https://api.elevenlabs.io/v1/speech-to-text");
  });

  test("rejects an unreadable transcript without echoing it", async () => {
    useEnv();
    globalThis.fetch = mock(async () =>
      jsonResponse({ unexpected: "secret transcript" }),
    ) as unknown as typeof fetch;

    const error = await tagAudio(clip).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ElevenLabsError);
    expect(String(error)).not.toContain("secret transcript");
  });
});

describe("soundEffect", () => {
  test("returns mp3 bytes for the prompt and length", async () => {
    useEnv();
    globalThis.fetch = mock(async () => audioResponse(mp3)) as unknown as typeof fetch;

    expect(await soundEffect("construction drilling", 8)).toEqual(mp3);

    const [url, init] = calls()[0] ?? [];
    expect(url).toBe("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "construction drilling",
      duration_seconds: 8,
      model_id: "eleven_text_to_sound_v3",
    });
  });

  test("rejects a length outside 0.5 to 30 seconds before calling out", async () => {
    useEnv();
    const fetchMock = mock(async () => audioResponse(mp3));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(soundEffect("rain", 0)).rejects.toThrow(/0\.5 and 30/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("timeout and one retry", () => {
  test("retries a 503 once and returns the second body", async () => {
    useEnv();
    const fetchMock = mock(async () => audioResponse(mp3));
    fetchMock.mockImplementationOnce(async () => new Response("upstream down", { status: 503 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await speak("test")).toEqual(mp3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not retry a client error and hides the response body", async () => {
    useEnv();
    const fetchMock = mock(async () => new Response("key was test-key", { status: 401 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const error = await speak("test").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ElevenLabsError);
    expect((error as ElevenLabsError).status).toBe(401);
    expect(String(error)).not.toContain("test-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("retries once when the request times out", async () => {
    useEnv();
    process.env.ELEVENLABS_TIMEOUT_MS = "40";
    const fetchMock = mock((_url: unknown, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (!signal) {
          reject(new Error("expected an abort signal"));
          return;
        }
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const error = await soundEffect("drilling", 2).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("TimeoutError");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("rebuilds the clip upload on the retry", async () => {
    useEnv();
    const fetchMock = mock(async (_url: unknown, init?: RequestInit) => {
      const form = init?.body;
      if (!(form instanceof FormData)) throw new Error("expected form data");
      const file = form.get("file");
      if (!(file instanceof Blob)) throw new Error("expected a clip");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(clip);
      return jsonResponse({ words: [] });
    });
    fetchMock.mockImplementationOnce(async () => new Response("", { status: 429 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await tagAudio(clip)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
