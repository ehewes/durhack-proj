import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import sample from "../../integrations/fixtures/street-manager/newcastle-permits.json";
import { memoryWorksRepository, setWorksRepository } from "./repo";
import { samplePermitEvents, seedWorks } from "./seed";

describe.serial("seed:works", () => {
  let store = memoryWorksRepository();

  beforeEach(() => {
    store = memoryWorksRepository();
    setWorksRepository(store);
  });

  afterEach(() => {
    setWorksRepository(undefined);
  });

  test("stores every sample permit through the service, labelled simulated", async () => {
    const tally = await seedWorks();
    const works = store.all();
    expect(works).toHaveLength(samplePermitEvents().length);
    expect(works.every((work) => work.simulated)).toBe(true);
    expect(tally).toEqual({
      inserted: works.length,
      updated: 0,
      kept: 0,
      outsideNewcastle: 0,
      nightWork: works.filter((work) => work.nightWork).length,
    });
    const references = new Set(works.map((work) => work.permitReferenceNumber));
    for (const permit of sample.permits) expect(references.has(permit.object_reference)).toBe(true);
  });

  test("running it again replaces the same permits instead of adding more", async () => {
    await seedWorks();
    const again = await seedWorks();
    expect(store.all()).toHaveLength(samplePermitEvents().length);
    expect(again).toMatchObject({ inserted: 0, updated: samplePermitEvents().length, kept: 0 });
  });
});
