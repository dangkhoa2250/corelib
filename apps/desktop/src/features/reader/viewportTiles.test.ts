import { expect, it } from "vitest";

import { getViewportTiles } from "./viewportTiles";

it("returns the padded tile grid intersecting the visible page region", () => {
  expect(getViewportTiles({
    pageWidth: 1800,
    pageHeight: 2400,
    viewport: { x: 760, y: 40, width: 600, height: 700 },
  })).toEqual([
    { key: "0:0", x: 0, y: 0, width: 768, height: 768 },
    { key: "1:0", x: 768, y: 0, width: 768, height: 768 },
    { key: "0:1", x: 0, y: 768, width: 768, height: 768 },
    { key: "1:1", x: 768, y: 768, width: 768, height: 768 },
  ]);
});

it("clips the final tiles to the page edge", () => {
  expect(getViewportTiles({
    pageWidth: 1800,
    pageHeight: 900,
    viewport: { x: 1700, y: 820, width: 200, height: 200 },
  })).toEqual([
    { key: "2:0", x: 1536, y: 0, width: 264, height: 768 },
    { key: "2:1", x: 1536, y: 768, width: 264, height: 132 },
  ]);
});

it("returns no tiles when the viewport does not overlap the page", () => {
  expect(getViewportTiles({
    pageWidth: 600,
    pageHeight: 800,
    viewport: { x: 900, y: 100, width: 100, height: 100 },
  })).toEqual([]);
});
