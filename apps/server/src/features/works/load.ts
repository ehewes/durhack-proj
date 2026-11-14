/**
 * Load a sibling module at call time.
 *
 * The phone typechecks `AppRouter` through this feature's index. A static import
 * of the SNS parser or the Mongo client follows into `node:crypto`, which the
 * Expo tsconfig does not know. The specifier is a runtime string so that check stops here.
 */
export async function loadFeatureModule<T>(specifier: string): Promise<T> {
  return (await import(specifier)) as T;
}
