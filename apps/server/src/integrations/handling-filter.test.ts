import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  filterHandling,
  HandlingFilterError,
  handlingFilterBackend,
  parseWav,
} from "./handling-filter";

const fixture = new URL("./fixtures/handling-filter/tone-with-burst-10s.wav", import.meta.url);
const wav = new Uint8Array(await Bun.file(fileURLToPath(fixture)).arrayBuffer());
const SAMPLES = 160_000;

function wavHeader(opts: { channels?: number; rate?: number; bits?: number }, data: number[]) {
  const bytes = new Uint8Array(44 + data.length * 2);
  const v = new DataView(bytes.buffer);
  const s = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  s(0, "RIFF");
  v.setUint32(4, 36 + data.length * 2, true);
  s(8, "WAVE");
  s(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, opts.channels ?? 1, true);
  v.setUint32(24, opts.rate ?? 16_000, true);
  v.setUint16(34, opts.bits ?? 16, true);
  s(36, "data");
  v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, data[i] ?? 0, true);
  return bytes;
}

describe("parseWav", () => {
  test("decodes the fixture to floats in range", () => {
    const pcm = parseWav(wav);
    expect(pcm.length).toBe(SAMPLES);
    expect(Math.max(...pcm)).toBeLessThanOrEqual(1);
    expect(Math.min(...pcm)).toBeGreaterThanOrEqual(-1);
  });

  test("rejects wrong rate, channels, bit depth and non-WAV", () => {
    expect(() => parseWav(wavHeader({ rate: 44_100 }, [0, 0]))).toThrow(/16000 Hz/);
    expect(() => parseWav(wavHeader({ channels: 2 }, [0, 0]))).toThrow(/mono/);
    expect(() => parseWav(wavHeader({ bits: 8 }, [0, 0]))).toThrow(/16-bit/);
    expect(() => parseWav(new Uint8Array([1, 2, 3]))).toThrow(HandlingFilterError);
  });
});

describe("filterHandling", () => {
  test("cleans the 10 s fixture in under a second", async () => {
    await filterHandling(wav); // warm: model load is once, not per clip
    const start = performance.now();
    const { clean, handlingProb } = await filterHandling(wav);
    const elapsed = performance.now() - start;

    expect(clean).toBeInstanceOf(Float32Array);
    expect(clean.length).toBe(SAMPLES);
    expect(handlingProb.length).toBe(1 + Math.floor(SAMPLES / 160));
    for (const p of handlingProb) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(clean.every(Number.isFinite)).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });

  test("rejects a clip shorter than one STFT window", async () => {
    const short = wavHeader({}, new Array(100).fill(0));
    await expect(filterHandling(short)).rejects.toThrow(/at least 512/);
  });

  test("the WASM fallback gives the same answer", async () => {
    const native = await filterHandling(wav);
    const wasm = await filterHandling(wav, { forceWasm: true });
    expect(await handlingFilterBackend({ forceWasm: true })).toBe("wasm");
    expect(wasm.handlingProb.length).toBe(native.handlingProb.length);
    let worst = 0;
    for (let i = 0; i < native.handlingProb.length; i++) {
      worst = Math.max(
        worst,
        Math.abs((native.handlingProb[i] ?? 0) - (wasm.handlingProb[i] ?? 0)),
      );
    }
    expect(worst).toBeLessThan(1e-3);
  });
});
