import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  classifyClip,
  DEFAULT_GEMINI_MODEL,
  type GeminiCallOptions,
  GeminiError,
  generateJson,
} from "./gemini";

const AUDIO = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
const AUDIO_B64 = "3q2+7w==";
const PROMPT = "sentinel-user-prompt-9f3c: drilling linked to a spike before 08:00";
const API_KEY = "sentinel-api-key";

describe("classifyClip", () => {
  test("returns a label and confidence from the JSON schema", async () => {
    const seen = captureConsole();
    const client = scripted(async () => geminiText('{"label":"construction","confidence":0.91}'));
    try {
      const result = await classifyClip(AUDIO, "audio/wav", call(client.fetch));
      expect(result).toEqual({ label: "construction", confidence: 0.91 });
      expect(client.calls).toHaveLength(1);
      const request = sent(client.calls[0]);
      expect(request.url).toBe(modelUrl(DEFAULT_GEMINI_MODEL));
      expect(request.url).not.toContain(API_KEY);
      expect(request.headers["x-goog-api-key"]).toBe(API_KEY);
      expect(request.body.generationConfig.responseMimeType).toBe("application/json");
      const format = request.body.generationConfig.responseFormat.text;
      expect(format.mimeType).toBe("APPLICATION_JSON");
      expect(format.schema.properties.label?.enum).toEqual([
        "construction",
        "traffic",
        "siren",
        "snoring",
        "other",
      ]);
      const confidence = format.schema.properties.confidence;
      if (!confidence) throw new Error("missing confidence schema");
      expect(confidence).toMatchObject({ minimum: 0, maximum: 1 });
      const parts = request.body.contents[0]?.parts;
      expect(parts?.[0]).toEqual({
        inlineData: { mimeType: "audio/wav", data: AUDIO_B64 },
      });
      expect(JSON.stringify(parts?.[1])).not.toContain("caused");
      expect(seen.lines()).toEqual([]);
    } finally {
      seen.restore();
    }
  });

  test("reads the answer part when the model also returns a thought or a fence", async () => {
    const fenced = scripted(async () =>
      geminiEnvelope([
        { thought: true, text: "echo of sentinel-user-prompt-9f3c" },
        { text: '```json\n{"label":"siren","confidence":0.4}\n```' },
      ]),
    );
    const result = await classifyClip(AUDIO, "audio/mp4", call(fenced.fetch));
    expect(result).toEqual({ label: "siren", confidence: 0.4 });
  });
});

describe("generateJson", () => {
  test("returns JSON matching the caller schema", async () => {
    const seen = captureConsole();
    const schema = z.object({
      summary: z.string(),
      outsideHours: z.boolean(),
    });
    const client = scripted(async () =>
      geminiText(
        JSON.stringify({
          summary: "Two wake-ups followed drilling",
          outsideHours: true,
          extra: "drop me",
        }),
      ),
    );
    try {
      const result = await generateJson(PROMPT, schema, call(client.fetch));
      expect(result).toEqual({
        summary: "Two wake-ups followed drilling",
        outsideHours: true,
      });
      const request = sent(client.calls[0]);
      expect(request.body.contents[0]?.parts).toEqual([{ text: PROMPT }]);
      expect(request.body.generationConfig.responseFormat.text.schema.properties).toMatchObject({
        summary: { type: "string" },
        outsideHours: { type: "boolean" },
      });
      expect(seen.lines().join("\n")).not.toContain(PROMPT);
    } finally {
      seen.restore();
    }
  });

  test("uses GEMINI_MODEL when set, otherwise the current default", async () => {
    const previous = process.env.GEMINI_MODEL;
    const client = scripted(async () => geminiText('{"ok":true}'));
    const schema = z.object({ ok: z.boolean() });
    try {
      delete process.env.GEMINI_MODEL;
      await generateJson("draft", schema, call(client.fetch));
      expect(client.calls[0]?.url).toContain(DEFAULT_GEMINI_MODEL);
      expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.5-flash");

      process.env.GEMINI_MODEL = "gemini-env-model";
      await generateJson("draft", schema, call(client.fetch));
      expect(client.calls[1]?.url).toContain("gemini-env-model");

      await generateJson("draft", schema, { ...call(client.fetch), model: "gemini-call-model" });
      expect(client.calls[2]?.url).toContain("gemini-call-model");
    } finally {
      restoreEnv("GEMINI_MODEL", previous);
    }
  });
});

describe("failures", () => {
  test("retries a malformed response once, then throws, without logging it", async () => {
    const seen = captureConsole();
    const client = scripted(async () => geminiText(`not-json ${PROMPT}`));
    try {
      const error = await classifyClip(AUDIO, "audio/wav", call(client.fetch)).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(GeminiError);
      expect(error).toMatchObject({ kind: "malformed" });
      expect(String(error)).not.toContain(PROMPT);
      expect(String(error)).not.toContain(AUDIO_B64);
      expect(client.calls).toHaveLength(2);
      expect(seen.lines()).toEqual(["gemini: classify failed (malformed), retrying once"]);
      expect(seen.lines().join("\n")).not.toContain(AUDIO_B64);
      expect(seen.lines().join("\n")).not.toContain(PROMPT);
    } finally {
      seen.restore();
    }
  });

  test("retries a response that does not match the schema", async () => {
    const seen = captureConsole();
    const client = scripted(async () => geminiText('{"label":"birdsong","confidence":4}'));
    try {
      await expect(classifyClip(AUDIO, "audio/wav", call(client.fetch))).rejects.toThrow(
        /did not match the schema/,
      );
      expect(client.calls).toHaveLength(2);
      expect(seen.lines()).toEqual(["gemini: classify failed (malformed), retrying once"]);
      expect(seen.lines().join("\n")).not.toContain("birdsong");
    } finally {
      seen.restore();
    }
  });

  test("retries one HTTP failure, and the warning is only the status", async () => {
    const seen = captureConsole();
    let attempt = 0;
    const client = scripted(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response(`leak ${PROMPT} ${AUDIO_B64}`, { status: 503 });
      }
      return geminiText('{"summary":"short"}');
    });
    try {
      const result = await generateJson(
        PROMPT,
        z.object({ summary: z.string() }),
        call(client.fetch),
      );
      expect(result).toEqual({ summary: "short" });
      expect(client.calls).toHaveLength(2);
      expect(seen.lines()).toEqual(["gemini: generate failed (http 503), retrying once"]);
    } finally {
      seen.restore();
    }
  });

  test("times out and retries once", async () => {
    const seen = captureConsole();
    let attempt = 0;
    const client = scripted(async (_url, init) => {
      attempt += 1;
      if (attempt === 1) {
        await abortOf(init.signal);
      }
      return geminiText('{"label":"traffic","confidence":0.2}');
    });
    try {
      const result = await classifyClip(AUDIO, "audio/wav", {
        ...call(client.fetch),
        timeoutMs: 40,
      });
      expect(result).toEqual({ label: "traffic", confidence: 0.2 });
      expect(client.calls).toHaveLength(2);
      expect(seen.lines()).toEqual(["gemini: classify failed (timeout), retrying once"]);
    } finally {
      seen.restore();
    }
  });

  test("does not call Gemini when the API key is missing", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const client = scripted(async () => geminiText("{}"));
    try {
      await expect(classifyClip(AUDIO, "audio/wav", { fetch: client.fetch })).rejects.toThrow(
        /GEMINI_API_KEY is not set/,
      );
      expect(client.calls).toHaveLength(0);
    } finally {
      restoreEnv("GEMINI_API_KEY", previous);
    }
  });
});

type Call = { url: string; init: RequestInit };

function call(fetchImpl: typeof fetch): GeminiCallOptions {
  return { fetch: fetchImpl, apiKey: API_KEY, timeoutMs: 1000, retryDelayMs: 0 };
}

function modelUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function scripted(handler: (url: string, init: RequestInit) => Promise<Response> | Response): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const request = init ?? {};
    calls.push({ url, init: request });
    return handler(url, request);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function geminiText(text: string): Response {
  return geminiEnvelope([{ text }]);
}

function geminiEnvelope(parts: unknown[]): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type Sent = {
  url: string;
  headers: Record<string, string>;
  body: {
    contents: { parts?: unknown[] }[];
    generationConfig: {
      responseMimeType: string;
      responseFormat: {
        text: {
          mimeType: string;
          schema: {
            properties: Record<
              string,
              { enum?: string[]; type?: string; minimum?: number; maximum?: number }
            >;
          };
        };
      };
    };
  };
};

function sent(callRecord: Call | undefined): Sent {
  if (!callRecord) throw new Error("missing request");
  return {
    url: callRecord.url,
    headers: callRecord.init.headers as Record<string, string>,
    body: JSON.parse(String(callRecord.init.body)) as Sent["body"],
  };
}

function abortOf(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    const fail = () => reject(signal?.reason ?? new DOMException("timed out", "TimeoutError"));
    if (!signal) {
      reject(new Error("missing abort signal"));
      return;
    }
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });
}

function captureConsole(): { lines: () => string[]; restore: () => void } {
  const lines: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const previous = new Map<string, typeof console.log>();
  for (const method of methods) {
    previous.set(method, console[method]);
    console[method] = (...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(" "));
    };
  }
  return {
    lines: () => lines,
    restore() {
      for (const method of methods) {
        const original = previous.get(method);
        if (original) console[method] = original;
      }
    },
  };
}

function restoreEnv(name: "GEMINI_MODEL" | "GEMINI_API_KEY", previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
