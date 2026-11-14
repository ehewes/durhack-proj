import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { createCallerFactory } from "./trpc/init";
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
    expect((await app.request("/sns/street-manager", { method: "POST" })).status).toBe(501);
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
    const res = await app.request("/trpc/city.sensors");
    expect(res.status).toBe(501);
    const caller = createCallerFactory(appRouter)({ userId: "u1" });
    await expect(caller.account.me()).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
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
