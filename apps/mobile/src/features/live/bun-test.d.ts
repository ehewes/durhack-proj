// Mobile does not depend on Bun. src/lib/map/bun-test.d.ts declares the bun:test
// module, including `expect(): Matchers`. A second `expect` signature is an
// overload, and the first match wins, so methods added only on that second
// signature (toBeNull) never typecheck. Augment the shared Matchers instead.
declare module "bun:test" {
  export interface Matchers {
    toBeNull(): void;
  }
}
