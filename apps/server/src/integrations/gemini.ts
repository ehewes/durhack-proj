import { z } from "zod";
import { requireEnv } from "../env";

/**
 * The only Gemini client: clip labels, briefings and complaint drafts.
 *
 * `GEMINI_API_KEY` is required (`requireEnv`). `GEMINI_MODEL` overrides the default model.
 * `GEMINI_TIMEOUT_MS` (default 30000) and `GEMINI_RETRY_DELAY_MS` (default 200)
 * tune the single retry. Audio bytes and prompts may contain user data and are
 * never written to logs. Briefing and complaint prompts follow docs/DOMAIN.md.
 */

/** Current Gemini flash model. Override with `GEMINI_MODEL`. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 200;
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini labels a clip as one of these. `uncertain` is not a model label: it is
 * assigned later when Scribe disagrees (docs/DOMAIN.md, Noise classification).
 */
export const clipLabels = ["construction", "traffic", "siren", "snoring", "other"] as const;

export type ClipLabel = (typeof clipLabels)[number];

const clipSchema = z.object({
  label: z.enum(clipLabels),
  confidence: z.number().min(0).max(1),
});

export type ClipClassification = z.output<typeof clipSchema>;

const CLASSIFY_INSTRUCTION = [
  "Label this short environmental noise clip.",
  "label is exactly one of: construction, traffic, siren, snoring, other.",
  "confidence is a number from 0 to 1.",
  "Return only the JSON object.",
].join(" ");

export type GeminiFailureKind = "config" | "timeout" | "http" | "network" | "malformed";

export class GeminiError extends Error {
  readonly kind: GeminiFailureKind;
  readonly status: number | undefined;

  constructor(message: string, options: { kind: GeminiFailureKind; status?: number }) {
    super(message);
    this.name = "GeminiError";
    this.kind = options.kind;
    this.status = options.status;
  }
}

/** Per-call overrides. Tests pass a mock `fetch` so no network or API key is required. */
export type GeminiCallOptions = {
  fetch?: typeof fetch;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
};

/** Label one short clip. `bytes` are sent inline and are not stored or logged. */
export async function classifyClip(
  bytes: Uint8Array,
  mime: string,
  options?: GeminiCallOptions,
): Promise<ClipClassification> {
  if (bytes.byteLength === 0) {
    throw new GeminiError("Audio clip is empty", { kind: "config" });
  }
  if (mime.trim() === "") {
    throw new GeminiError("Audio mime type is missing", { kind: "config" });
  }
  return generateContent(
    "classify",
    [{ inlineData: { mimeType: mime, data: toBase64(bytes) } }, { text: CLASSIFY_INSTRUCTION }],
    clipSchema,
    options,
    0,
  );
}

/**
 * Ask Gemini for one JSON object matching `zodSchema`.
 * Used for briefing text and complaint drafts. The prompt is not logged.
 */
export async function generateJson<S extends z.ZodType>(
  prompt: string,
  zodSchema: S,
  options?: GeminiCallOptions,
): Promise<z.output<S>> {
  if (prompt.trim() === "") {
    throw new GeminiError("Prompt is empty", { kind: "config" });
  }
  return generateContent("generate", [{ text: prompt }], zodSchema, options);
}

async function generateContent<S extends z.ZodType>(
  op: "classify" | "generate",
  parts: readonly unknown[],
  zodSchema: S,
  options: GeminiCallOptions | undefined,
  temperature?: number,
): Promise<z.output<S>> {
  const apiKey = readKey(options);
  const model = readModel(options);
  const timeoutMs = readTimeout(options);
  const retryDelayMs = readRetryDelay(options);
  const schema = jsonSchemaFor(zodSchema);
  const fetchImpl = options?.fetch ?? fetch;
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      ...(temperature === undefined ? {} : { temperature }),
      responseMimeType: "application/json",
      responseFormat: {
        text: {
          mimeType: "APPLICATION_JSON",
          schema,
        },
      },
    },
  };

  return withOneRetry(op, retryDelayMs, () =>
    requestOnce(fetchImpl, url, apiKey, payload, zodSchema, timeoutMs),
  );
}

async function requestOnce<S extends z.ZodType>(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  payload: unknown,
  zodSchema: S,
  timeoutMs: number,
): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw wrapTransport(error);
  }

  if (!response.ok) {
    await discard(response);
    throw new GeminiError(`Gemini request failed (${response.status})`, {
      kind: "http",
      status: response.status,
    });
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new GeminiError("Gemini returned malformed JSON", { kind: "malformed" });
  }

  const text = responseText(envelope);
  if (text === undefined) {
    throw new GeminiError("Gemini returned malformed JSON", { kind: "malformed" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    throw new GeminiError("Gemini returned malformed JSON", { kind: "malformed" });
  }

  const result = zodSchema.safeParse(parsed);
  if (!result.success) {
    throw new GeminiError("Gemini returned a response that did not match the schema", {
      kind: "malformed",
    });
  }
  return result.data;
}

async function withOneRetry<T>(
  op: "classify" | "generate",
  retryDelayMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GeminiError && error.kind === "config") throw error;
    const reason = error instanceof GeminiError ? safeReason(error) : "network";
    // Reason is a status or a fixed word. Never the prompt, audio, or response body.
    console.warn(`gemini: ${op} failed (${reason}), retrying once`);
    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    return await fn();
  }
}

function safeReason(error: GeminiError): string {
  if (error.kind === "http" && error.status !== undefined) return `http ${error.status}`;
  return error.kind;
}

function wrapTransport(error: unknown): GeminiError {
  if (error instanceof GeminiError) return error;
  if (isTimeout(error)) return new GeminiError("Gemini request timed out", { kind: "timeout" });
  return new GeminiError("Gemini request failed", { kind: "network" });
}

function isTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  const name = String(error.name);
  return name === "TimeoutError" || name === "AbortError";
}

function readKey(options: GeminiCallOptions | undefined): string {
  if (options?.apiKey !== undefined) {
    const key = options.apiKey.trim();
    if (key === "") throw new GeminiError("GEMINI_API_KEY is not set", { kind: "config" });
    return key;
  }
  try {
    return requireEnv("GEMINI_API_KEY");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("GEMINI_API_KEY is not set")) {
      throw new GeminiError(error.message, { kind: "config" });
    }
    throw error;
  }
}

function readModel(options: GeminiCallOptions | undefined): string {
  const model = (options?.model ?? process.env.GEMINI_MODEL ?? "").trim();
  return model === "" ? DEFAULT_GEMINI_MODEL : model;
}

function readTimeout(options: GeminiCallOptions | undefined): number {
  if (options?.timeoutMs !== undefined) return options.timeoutMs;
  return positiveMs(process.env.GEMINI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function readRetryDelay(options: GeminiCallOptions | undefined): number {
  if (options?.retryDelayMs !== undefined) return options.retryDelayMs;
  return nonNegativeMs(process.env.GEMINI_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS);
}

function positiveMs(raw: string | undefined, fallback: number): number {
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function nonNegativeMs(raw: string | undefined, fallback: number): number {
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function jsonSchemaFor(zodSchema: z.ZodType): Record<string, unknown> {
  const json: unknown = z.toJSONSchema(zodSchema, { target: "openapi-3.0" });
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new GeminiError("Gemini response schema could not be built", { kind: "config" });
  }
  const schema: Record<string, unknown> = { ...json };
  delete schema.$schema;
  return schema;
}

function responseText(body: unknown): string | undefined {
  if (!isRecord(body) || !Array.isArray(body.candidates)) return undefined;
  for (const candidate of body.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
    const parts = candidate.content.parts;
    if (!Array.isArray(parts)) continue;
    const texts: string[] = [];
    for (const part of parts) {
      if (!isRecord(part) || part.thought === true) continue;
      if (typeof part.text === "string" && part.text.length > 0) texts.push(part.text);
    }
    if (texts.length > 0) return texts.join("");
  }
  return undefined;
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The status is already captured. The body is not logged.
  }
}
