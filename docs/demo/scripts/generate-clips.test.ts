import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkClips, DEMO_CLIPS, generateClips } from "./generate-clips";

describe("demo clips", () => {
  test("are a 10-second drilling clip and a siren clip, with no voices asked for", () => {
    expect(DEMO_CLIPS.map((c) => [c.name, c.seconds, c.expectedLabel])).toEqual([
      ["drilling", 10, "construction"],
      ["siren", 10, "siren"],
    ]);
    for (const clip of DEMO_CLIPS) expect(clip.prompt).toContain("No voices");
  });

  test("writes each clip and the prompts used, without calling ElevenLabs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kip-clips-"));
    const asked: [string, number][] = [];
    const made = await generateClips(async (prompt, seconds) => {
      asked.push([prompt, seconds]);
      return new Uint8Array([1, 2, 3]);
    }, dir);
    expect(made).toEqual([
      { name: "drilling", bytes: 3 },
      { name: "siren", bytes: 3 },
    ]);
    expect(asked).toEqual(DEMO_CLIPS.map((c) => [c.prompt, c.seconds]));
    expect([...(await readFile(join(dir, "drilling.mp3")))]).toEqual([1, 2, 3]);
    const record = JSON.parse(await readFile(join(dir, "clips.json"), "utf8"));
    expect(record.clips.map((c: { file: string }) => c.file)).toEqual([
      "drilling.mp3",
      "siren.mp3",
    ]);
    expect(record.clips[0].prompt).toBe(DEMO_CLIPS[0]?.prompt);
  });

  test("checks each saved clip against the label Kip should give it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kip-clips-"));
    await generateClips(async () => new Uint8Array([9]), dir);
    const results = await checkClips(async () => ({ label: "construction" }), dir);
    expect(results).toEqual([
      { name: "drilling", label: "construction", ok: true },
      { name: "siren", label: "construction", ok: false },
    ]);
  });
});
