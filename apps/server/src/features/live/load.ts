import type { LivePipeline } from "./pipeline";

/**
 * Load `./live` at call time.
 *
 * The phone typechecks `AppRouter` through this feature's index. A static import of the
 * Gemini or ElevenLabs client follows into `Buffer`, which the Expo tsconfig does not know.
 * The specifier is a runtime string and the module's type is written out here so that
 * check stops here.
 */
export async function loadLive(): Promise<{ livePipeline: LivePipeline }> {
  const specifier = "./live";
  return (await import(specifier)) as { livePipeline: LivePipeline };
}
