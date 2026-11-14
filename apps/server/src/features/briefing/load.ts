/**
 * Load a sibling module at call time.
 *
 * The phone typechecks `AppRouter` through this feature's index. A static import
 * of Gemini or ElevenLabs follows into Node types the Expo tsconfig does not know.
 * The specifier is a runtime string so that check stops here.
 */
export async function loadFeatureModule<T>(specifier: string): Promise<T> {
  return (await import(specifier)) as T;
}
