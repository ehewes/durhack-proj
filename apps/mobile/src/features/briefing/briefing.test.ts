import { describe, expect, test } from "bun:test";
import { briefingAudioSrc } from "./audio-url";

describe("briefingAudioSrc", () => {
  test("joins the API base and the briefing path", () => {
    expect(briefingAudioSrc("https://api.example.com/", "/briefing/n/audio?token=a")).toBe(
      "https://api.example.com/briefing/n/audio?token=a",
    );
  });
  test("stays same-origin on web where the base is empty", () => {
    expect(briefingAudioSrc("", "/briefing/n/audio?token=a")).toBe("/briefing/n/audio?token=a");
  });
});
