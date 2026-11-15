import { fileURLToPath } from "node:url";

/**
 * Handling filter: runs ml/models/handling-v1.onnx (raw 16 kHz PCM in, cleaned PCM and per-10 ms
 * handling probability out; the STFT is inside the graph). Audio stays in memory.
 */

export const HANDLING_SAMPLE_RATE = 16_000;
/** The graph needs at least one STFT window (ml/models/handling-v1.json, min_samples). */
export const HANDLING_MIN_SAMPLES = 512;

const DEFAULT_MODEL_PATH = fileURLToPath(
  new URL("../../../../ml/models/handling-v1.onnx", import.meta.url),
);

export class HandlingFilterError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "HandlingFilterError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export type HandlingFilterResult = {
  /** The clip with handling noise removed, samples in [-1, 1], same length as the input. */
  clean: Float32Array;
  /** Probability of handling noise per 10 ms frame, `1 + N / 160` frames. Above 0.5 is handling. */
  handlingProb: number[];
};

export type HandlingFilterOptions = {
  /** Skip the native addon and use the WASM runtime. For tests. */
  forceWasm?: boolean;
  modelPath?: string;
};

/** Minimal slice of the onnxruntime API both packages share. */
type OrtTensor = { data: unknown };
type OrtSession = { run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>> };
type OrtModule = {
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(model: Uint8Array, options?: object): Promise<OrtSession> };
};

type Engine = { ort: OrtModule; session: OrtSession; backend: "native" | "wasm" };

const engines = new Map<string, Promise<Engine>>();

async function loadEngine(modelPath: string, forceWasm: boolean): Promise<Engine> {
  const model = new Uint8Array(await Bun.file(modelPath).arrayBuffer());

  if (!forceWasm) {
    try {
      const ort = (await import("onnxruntime-node")) as unknown as OrtModule;
      const session = await ort.InferenceSession.create(model, { executionProviders: ["cpu"] });
      return { ort, session, backend: "native" };
    } catch (error) {
      console.warn("handling-filter: onnxruntime-node failed, using WASM", errorName(error));
    }
  }

  try {
    const ort = (await import("onnxruntime-web")) as unknown as OrtModule & {
      env: { wasm: { numThreads: number } };
    };
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    return { ort, session, backend: "wasm" };
  } catch (error) {
    throw new HandlingFilterError("Could not load the handling filter model", { cause: error });
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : "unknown error";
}

function getEngine(options: HandlingFilterOptions): Promise<Engine> {
  const modelPath = options.modelPath ?? DEFAULT_MODEL_PATH;
  const key = `${options.forceWasm ? "wasm" : "auto"}:${modelPath}`;
  let engine = engines.get(key);
  if (!engine) {
    engine = loadEngine(modelPath, options.forceWasm ?? false);
    // A failed load must not be cached forever.
    engine.catch(() => engines.delete(key));
    engines.set(key, engine);
  }
  return engine;
}

/** Which runtime a loaded model ended up on. Loads the model if needed. */
export async function handlingFilterBackend(
  options: HandlingFilterOptions = {},
): Promise<"native" | "wasm"> {
  return (await getEngine(options)).backend;
}

/** Decode 16 kHz mono 16-bit PCM WAV into floats in [-1, 1). */
export function parseWav(wav: Uint8Array): Float32Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  if (wav.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    throw new HandlingFilterError("Not a WAV file");
  }

  let fmtSeen = false;
  let offset = 12;
  while (offset + 8 <= wav.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === "fmt ") {
      if (size < 16 || body + 16 > wav.byteLength)
        throw new HandlingFilterError("Bad WAV fmt chunk");
      const format = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const rate = view.getUint32(body + 4, true);
      const bits = view.getUint16(body + 14, true);
      // 0xfffe is WAVE_FORMAT_EXTENSIBLE; we only accept it when it still says 16-bit.
      if ((format !== 1 && format !== 0xfffe) || bits !== 16) {
        throw new HandlingFilterError("WAV must be 16-bit PCM");
      }
      if (channels !== 1) throw new HandlingFilterError("WAV must be mono");
      if (rate !== HANDLING_SAMPLE_RATE) {
        throw new HandlingFilterError(`WAV must be ${HANDLING_SAMPLE_RATE} Hz, got ${rate}`);
      }
      fmtSeen = true;
    } else if (id === "data") {
      if (!fmtSeen) throw new HandlingFilterError("WAV data chunk before fmt chunk");
      // Streamed WAVs may carry a bogus size; clamp to what is there.
      const bytes = Math.min(size, wav.byteLength - body);
      const count = Math.floor(bytes / 2);
      const pcm = new Float32Array(count);
      for (let i = 0; i < count; i++) pcm[i] = view.getInt16(body + i * 2, true) / 32768;
      return pcm;
    }

    offset = body + size + (size % 2);
  }
  throw new HandlingFilterError("WAV has no data chunk");
}

/** Remove handling noise from a 16 kHz mono 16-bit WAV clip. */
export async function filterHandling(
  wav: Uint8Array,
  options: HandlingFilterOptions = {},
): Promise<HandlingFilterResult> {
  const pcm = parseWav(wav);
  if (pcm.length < HANDLING_MIN_SAMPLES) {
    throw new HandlingFilterError(`Clip needs at least ${HANDLING_MIN_SAMPLES} samples`);
  }

  const { ort, session } = await getEngine(options);
  const input = new ort.Tensor("float32", pcm, [1, pcm.length]);
  const outputs = await session.run({ pcm: input });

  const clean = outputs.clean?.data;
  const handling = outputs.handling?.data;
  if (!(clean instanceof Float32Array) || !(handling instanceof Float32Array)) {
    throw new HandlingFilterError("Handling model returned unexpected outputs");
  }
  return { clean: Float32Array.from(clean), handlingProb: Array.from(handling) };
}
