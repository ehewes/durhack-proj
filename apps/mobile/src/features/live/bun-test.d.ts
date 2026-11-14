// The mobile tsconfig does not load Bun's types. This ambient module lets the
// feature test typecheck without changing that config.
declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeDefined(): void;
    toContain(expected: string): void;
    toHaveLength(expected: number): void;
  };
}
