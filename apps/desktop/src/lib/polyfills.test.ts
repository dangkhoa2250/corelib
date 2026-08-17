import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The polyfill installs itself at import time and only when the native feature is
// missing, so the test removes the native implementation, re-imports the module with a
// fresh registry, then restores the original.
async function loadPolyfillsWithoutWithResolvers() {
  delete (Promise as unknown as Record<string, unknown>).withResolvers;
  vi.resetModules();
  await import("./polyfills");
}

describe("WebKit polyfills", () => {
  const nativeWithResolvers = (Promise as unknown as Record<string, unknown>).withResolvers;

  beforeEach(() => {
    (Promise as unknown as Record<string, unknown>).withResolvers = nativeWithResolvers;
  });

  afterEach(() => {
    (Promise as unknown as Record<string, unknown>).withResolvers = nativeWithResolvers;
  });

  it("installs Promise.withResolvers when the engine lacks it", async () => {
    await loadPolyfillsWithoutWithResolvers();

    const { promise, resolve } = (
      Promise as unknown as { withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } }
    ).withResolvers<string>();
    resolve("ok");
    await expect(promise).resolves.toBe("ok");
  });

  it("rejects through the polyfilled deferred as well", async () => {
    await loadPolyfillsWithoutWithResolvers();

    const { promise, reject } = (
      Promise as unknown as { withResolvers<T>(): { promise: Promise<T>; reject: (reason: unknown) => void } }
    ).withResolvers<string>();
    reject(new Error("nope"));
    await expect(promise).rejects.toThrow("nope");
  });
});
