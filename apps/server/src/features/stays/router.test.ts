import { describe, expect, test } from "bun:test";
import { rankInput } from "@kip/shared/stays";
import { createCallerFactory } from "../../trpc/init";
import { staysRouter } from "./router";

const caller = createCallerFactory(staysRouter)({ userId: null });

const stay = {
  profile: "lightSleeper" as const,
  checkIn: "2026-11-20",
  checkOut: "2026-11-22",
  near: { lat: 54.973, lon: -1.614 },
};

describe("stays.rank input", () => {
  test("parses the shared schema", async () => {
    expect(rankInput.parse(stay)).toEqual(stay);
    const parser = staysRouter._def.procedures.rank._def.inputs[0];
    expect(parser).toBe(rankInput);
  });

  test("rejects lng, swapped axes, out-of-range coordinates and a reversed stay", async () => {
    const rejected = [
      { ...stay, near: { lat: 54.973, lng: -1.614 } },
      { ...stay, near: { lat: -1.614, lon: 54.973 } },
      { ...stay, near: { lat: 91, lon: -1.614 } },
      { ...stay, near: { lat: 54.973, lon: 181 } },
      { ...stay, checkOut: "2026-11-20" },
    ];
    for (const input of rejected) {
      expect(rankInput.safeParse(input).success).toBe(false);
      await expect(caller.rank(input as typeof stay)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });
});
