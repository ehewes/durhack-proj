// Ambient types so the mobile typecheck can see the map tests. The app does not depend on Bun.
declare module "bun:test" {
  export interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toHaveLength(length: number): void;
    toContain(expected: unknown): void;
    toMatchObject(expected: unknown): void;
    not: Matchers;
  }

  export function expect(actual: unknown): Matchers;

  export namespace expect {
    function objectContaining(sample: unknown): unknown;
  }

  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;

  export const mock: {
    module(specifier: string, factory: () => unknown): void;
  };
}
