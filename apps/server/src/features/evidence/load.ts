import type { EvidenceService } from "./service";

/**
 * Load `./live` at call time.
 *
 * The phone typechecks `AppRouter` through this feature's index. A static import of the
 * Solana client follows into `node:crypto` and `Buffer`, which the Expo tsconfig does not
 * know. The specifier is a runtime string and the module's type is written out here.
 */
export async function loadLive(): Promise<{ liveEvidence: EvidenceService }> {
  const specifier = "./live";
  return (await import(specifier)) as { liveEvidence: EvidenceService };
}
