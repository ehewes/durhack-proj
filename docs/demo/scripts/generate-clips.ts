import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The clips played into the phone on stage, made with ElevenLabs Sound Effects (a sponsor tool).
// `bun --env-file=.env docs/demo/scripts/generate-clips.ts` makes them; add `--check` to have
// Gemini label the saved clips, the way Kip labels a spike.

/** One stage clip: what ElevenLabs is asked for, and the label Kip should give it. */
export type DemoClip = {
  name: string;
  seconds: number;
  expectedLabel: "construction" | "siren";
  prompt: string;
};

/** No voices in either: the phone drops any clip with speech before it leaves the device. */
export const DEMO_CLIPS: readonly DemoClip[] = [
  {
    name: "drilling",
    seconds: 10,
    expectedLabel: "construction",
    prompt:
      "A heavy hammer drill and a concrete breaker on a building site at night, short hard bursts with brief pauses between them, heard through a closed bedroom window across a narrow city street. Close and harsh. No voices, no music.",
  },
  {
    name: "siren",
    seconds: 10,
    expectedLabel: "siren",
    prompt:
      "A UK ambulance siren passing along a city street at night, wailing then yelping as it approaches and fades away, heard from inside a bedroom with the window shut. No voices, no music.",
  },
];

export const ASSETS_DIR = join(import.meta.dir, "..", "assets");

export type MakeSound = (prompt: string, seconds: number) => Promise<Uint8Array>;

/** Makes each clip, then writes `<name>.mp3` and `clips.json` (the prompts used) into `dir`. */
export async function generateClips(
  make: MakeSound,
  dir: string,
  clips: readonly DemoClip[] = DEMO_CLIPS,
): Promise<{ name: string; bytes: number }[]> {
  await mkdir(dir, { recursive: true });
  const made: { name: string; bytes: number }[] = [];
  for (const clip of clips) {
    const audio = await make(clip.prompt, clip.seconds);
    await writeFile(join(dir, `${clip.name}.mp3`), audio);
    made.push({ name: clip.name, bytes: audio.byteLength });
  }
  const record = {
    tool: "ElevenLabs Sound Effects (POST /v1/sound-generation, mp3_44100_128)",
    clips: clips.map(({ name, seconds, expectedLabel, prompt }) => ({
      file: `${name}.mp3`,
      seconds,
      expectedLabel,
      prompt,
    })),
  };
  await writeFile(join(dir, "clips.json"), `${JSON.stringify(record, null, 2)}\n`);
  return made;
}

export type LabelClip = (audio: Uint8Array, mime: string) => Promise<{ label: string }>;

/** Labels each saved clip as Kip would, and says whether it matches the expected label. */
export async function checkClips(
  label: LabelClip,
  dir: string,
  clips: readonly DemoClip[] = DEMO_CLIPS,
): Promise<{ name: string; label: string; ok: boolean }[]> {
  const results: { name: string; label: string; ok: boolean }[] = [];
  for (const clip of clips) {
    const audio = new Uint8Array(await readFile(join(dir, `${clip.name}.mp3`)));
    const { label: got } = await label(audio, "audio/mp3");
    results.push({ name: clip.name, label: got, ok: got === clip.expectedLabel });
  }
  return results;
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const { classifyClip } = await import("../../../apps/server/src/integrations/gemini");
    const results = await checkClips((audio, mime) => classifyClip(audio, mime), ASSETS_DIR);
    for (const r of results)
      console.log(`${r.name}.mp3: ${r.label} ${r.ok ? "(as expected)" : "(UNEXPECTED)"}`);
    if (results.some((r) => !r.ok)) process.exit(1);
  } else {
    const { soundEffect } = await import("../../../apps/server/src/integrations/elevenlabs");
    for (const clip of await generateClips(soundEffect, ASSETS_DIR)) {
      console.log(`${clip.name}.mp3: ${clip.bytes} bytes`);
    }
  }
}
