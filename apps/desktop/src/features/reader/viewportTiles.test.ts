import { expect, it } from "vitest";

import {
  getViewportTiles,
  normalizeTileScale,
  planViewportTiles,
  type PlannedTileKind,
  type PlannedViewportTile,
} from "./viewportTiles";

it("returns the padded tile grid intersecting the visible page region", () => {
  expect(getViewportTiles({
    pageWidth: 1800,
    pageHeight: 2400,
    viewport: { x: 760, y: 40, width: 600, height: 700 },
  })).toEqual([
    { key: "1:0", x: 512, y: 0, width: 512, height: 512 },
    { key: "2:0", x: 1024, y: 0, width: 512, height: 512 },
    { key: "1:1", x: 512, y: 512, width: 512, height: 512 },
    { key: "2:1", x: 1024, y: 512, width: 512, height: 512 },
  ]);
});

it("clips the final tiles to the page edge", () => {
  expect(getViewportTiles({
    pageWidth: 1800,
    pageHeight: 900,
    viewport: { x: 1700, y: 820, width: 200, height: 200 },
  })).toEqual([
    { key: "3:1", x: 1536, y: 512, width: 264, height: 388 },
  ]);
});

it("returns no tiles when the viewport does not overlap the page", () => {
  expect(getViewportTiles({
    pageWidth: 600,
    pageHeight: 800,
    viewport: { x: 900, y: 100, width: 100, height: 100 },
  })).toEqual([]);
});

it("normalizes zoom to native pinch increments", () => {
  expect(normalizeTileScale(1.023)).toBe(1);
  expect(normalizeTileScale(1.026)).toBe(1.05);
  expect(normalizeTileScale(3.2)).toBe(3);
  expect(normalizeTileScale(0.2)).toBe(0.5);
});

it("orders exact visible tiles from the viewport center outward", () => {
  const plan = planViewportTiles({
    pageWidth: 900,
    pageHeight: 1200,
    viewport: { x: 200, y: 200, width: 450, height: 450 },
    scale: 2,
    zoomDirection: 1,
  });
  const visible = plan.filter((tile) => tile.kind === "visible");

  expect(visible.length).toBeGreaterThan(1);
  expect(visible[0].priority).toBe(30);
  const viewportCenter = { x: 425 * 2, y: 425 * 2 };
  const distance = (tile: PlannedViewportTile) => (
    (tile.x + tile.width / 2 - viewportCenter.x) ** 2
    + (tile.y + tile.height / 2 - viewportCenter.y) ** 2
  );
  expect(distance(visible[0])).toBeLessThanOrEqual(distance(visible.at(-1)!));
});

it("places adjacent-scale work before the scroll ring only while zooming", () => {
  const base = {
    pageWidth: 900,
    pageHeight: 1200,
    viewport: { x: 200, y: 200, width: 450, height: 450 },
    scale: 2,
  };
  const priority = (plan: PlannedViewportTile[], kind: PlannedTileKind) =>
    Math.max(...plan.filter((tile) => tile.kind === kind).map((tile) => tile.priority));

  const zoomPlan = planViewportTiles({ ...base, zoomDirection: 1 });
  const scrollPlan = planViewportTiles({ ...base, zoomDirection: 0 });

  expect(priority(zoomPlan, "adjacent")).toBeGreaterThan(priority(zoomPlan, "ring"));
  expect(priority(scrollPlan, "ring")).toBeGreaterThan(priority(scrollPlan, "adjacent"));
});

it("deduplicates visible tiles from the one-tile scroll ring", () => {
  const plan = planViewportTiles({
    pageWidth: 900,
    pageHeight: 1200,
    viewport: { x: 200, y: 200, width: 450, height: 450 },
    scale: 2,
    zoomDirection: 0,
  });
  const currentScaleKeys = plan
    .filter((tile) => tile.scale === 2)
    .map((tile) => `${tile.scale}:${tile.key}`);

  expect(new Set(currentScaleKeys).size).toBe(currentScaleKeys.length);
  expect(plan.some((tile) => tile.kind === "ring")).toBe(true);
});
