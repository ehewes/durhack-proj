import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { briefingAudioPath } from "@kip/shared/briefing";
import { createApp } from "./app";
import { createCallerFactory, createContext } from "./trpc/init";
import { appRouter } from "./trpc/router";

describe("api", () => {
  const app = createApp();

  test("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("stub plain routes answer 501", async () => {
    expect((await app.request("/upload/clip", { method: "POST" })).status).toBe(501);
  });

  test("POST /sns/street-manager rejects an empty body", async () => {
    const res = await app.request("/sns/street-manager", { method: "POST" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "malformed" });
  });

  test("GET /briefing/:nightId/audio reaches the briefing route, ahead of the web build", async () => {
    // No briefing has been voiced, so the route's own 404 answers: not Hono's
    // default 404, and not the web build's index.html.
    const url = briefingAudioPath("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", "0".repeat(32));
    const dir = await mkdtemp(join(tmpdir(), "kip-web-"));
    await writeFile(join(dir, "index.html"), "<!doctype html><title>Kip</title>");
    for (const api of [app, createApp({ webDist: dir })]) {
      const res = await api.request(url);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Briefing audio not found" });
    }
  });

  test("every feature router is registered", () => {
    expect(Object.keys(appRouter._def.record).sort()).toEqual([
      "account",
      "attribution",
      "briefing",
      "city",
      "evidence",
      "labels",
      "live",
      "night",
      "stays",
      "works",
    ]);
  });

  test("stub procedures answer NOT_IMPLEMENTED (HTTP 501)", async () => {
    const nightId = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    const input = encodeURIComponent(JSON.stringify({ json: { nightId } }));
    const res = await app.request(`/trpc/evidence.verify?input=${input}`);
    expect(res.status).toBe(501);
    const caller = createCallerFactory(appRouter)({
      userId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    });
    await expect(
      caller.evidence.report({ nightId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });

  test("user procedures need the x-kip-user header", async () => {
    const caller = createCallerFactory(appRouter)({ userId: null });
    await expect(caller.night.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("web build", () => {
  test("serves index.html for deep links", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kip-web-"));
    await writeFile(join(dir, "index.html"), "<!doctype html><title>Kip</title>");
    const app = createApp({ webDist: dir });
    for (const path of ["/", "/night", "/stays"]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>Kip</title>");
    }
  });
});

test("x-kip-user must be a UUID", () => {
  const ctx = (value: string) =>
    createContext({ req: new Request("http://x", { headers: { "x-kip-user": value } }) });
  expect(ctx("not-a-uuid").userId).toBeNull();
  expect(ctx("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d").userId).toBe(
    "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  );
});
