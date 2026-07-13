import { expect, it, vi } from "vitest";

import { createPdfTileCacheBudget } from "./pdfTileCache";

it("evicts the least recently used unpinned tile before exceeding the byte limit", () => {
  const cache = createPdfTileCacheBudget(100);
  const listener = vi.fn();
  cache.subscribe(listener);

  expect(cache.insert({ key: "a", bytes: 60 })).toBe(true);
  expect(cache.insert({ key: "b", bytes: 40 })).toBe(true);
  cache.touch("a");
  expect(cache.insert({ key: "c", bytes: 30 })).toBe(true);

  expect(listener).toHaveBeenLastCalledWith(["b"]);
  expect(cache.stats()).toMatchObject({ bytes: 90, entries: 2, evictions: 1 });
});

it("never evicts a pinned visible tile", () => {
  const cache = createPdfTileCacheBudget(100);
  expect(cache.insert({ key: "visible", bytes: 70 })).toBe(true);
  cache.pin("visible");

  expect(cache.insert({ key: "prefetch", bytes: 50 })).toBe(false);
  expect(cache.has("visible")).toBe(true);
  expect(cache.has("prefetch")).toBe(false);
  expect(cache.stats()).toMatchObject({ bytes: 70, entries: 1 });
});

it("makes a tile evictable after its final pin is released", () => {
  const cache = createPdfTileCacheBudget(100);
  cache.insert({ key: "visible", bytes: 70 });
  cache.pin("visible");
  cache.pin("visible");
  cache.unpin("visible");
  expect(cache.insert({ key: "prefetch", bytes: 40 })).toBe(false);

  cache.unpin("visible");
  expect(cache.insert({ key: "prefetch", bytes: 40 })).toBe(true);
  expect(cache.has("visible")).toBe(false);
});

it("tracks hits, misses, peak bytes, and namespace cleanup", () => {
  const cache = createPdfTileCacheBudget(100);
  const listener = vi.fn();
  cache.subscribe(listener);
  cache.insert({ key: "doc-a:1:tile", bytes: 40 });
  cache.insert({ key: "doc-b:1:tile", bytes: 30 });

  expect(cache.hit("doc-a:1:tile")).toBe(true);
  expect(cache.hit("missing")).toBe(false);
  cache.removeNamespace("doc-a:");

  expect(cache.has("doc-a:1:tile")).toBe(false);
  expect(cache.has("doc-b:1:tile")).toBe(true);
  expect(listener).toHaveBeenLastCalledWith(["doc-a:1:tile"]);
  expect(cache.stats()).toMatchObject({
    bytes: 30,
    peakBytes: 70,
    entries: 1,
    hits: 1,
    misses: 1,
  });
});
