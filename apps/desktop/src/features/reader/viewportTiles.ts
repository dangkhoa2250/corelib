export const HIGH_ZOOM_TILE_SIZE = 512;
export const HIGH_ZOOM_TILE_PADDING = 128;
export const TILE_SCALE_STEP = 0.05;
export const MIN_TILE_SCALE = 0.5;
export const MAX_TILE_SCALE = 3;
export const MAX_ADJACENT_PREFETCH_TILES = 1;
export const MAX_RING_PREFETCH_TILES = 2;

export interface ViewportTile {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportTileInput {
  pageWidth: number;
  pageHeight: number;
  viewport: { x: number; y: number; width: number; height: number };
  padding?: number;
}

export function getViewportTiles({
  pageWidth,
  pageHeight,
  viewport,
  padding = HIGH_ZOOM_TILE_PADDING,
}: ViewportTileInput): ViewportTile[] {
  const left = Math.max(0, viewport.x - padding);
  const top = Math.max(0, viewport.y - padding);
  const right = Math.min(pageWidth, viewport.x + viewport.width + padding);
  const bottom = Math.min(pageHeight, viewport.y + viewport.height + padding);
  if (right <= left || bottom <= top) return [];

  const firstColumn = Math.floor(left / HIGH_ZOOM_TILE_SIZE);
  const lastColumn = Math.floor((right - 1) / HIGH_ZOOM_TILE_SIZE);
  const firstRow = Math.floor(top / HIGH_ZOOM_TILE_SIZE);
  const lastRow = Math.floor((bottom - 1) / HIGH_ZOOM_TILE_SIZE);
  const tiles: ViewportTile[] = [];

  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const x = column * HIGH_ZOOM_TILE_SIZE;
      const y = row * HIGH_ZOOM_TILE_SIZE;
      tiles.push({
        key: `${column}:${row}`,
        x,
        y,
        width: Math.min(HIGH_ZOOM_TILE_SIZE, pageWidth - x),
        height: Math.min(HIGH_ZOOM_TILE_SIZE, pageHeight - y),
      });
    }
  }
  return tiles;
}

export type PlannedTileKind = "visible" | "adjacent" | "ring";

export interface PlannedViewportTile extends ViewportTile {
  scale: number;
  kind: PlannedTileKind;
  priority: number;
}

export interface PlanViewportTilesInput {
  pageWidth: number;
  pageHeight: number;
  viewport: { x: number; y: number; width: number; height: number };
  scale: number;
  zoomDirection: -1 | 0 | 1;
}

export function normalizeTileScale(scale: number): number {
  const clamped = Math.min(MAX_TILE_SCALE, Math.max(MIN_TILE_SCALE, scale));
  return Number((Math.round(clamped / TILE_SCALE_STEP) * TILE_SCALE_STEP).toFixed(2));
}

function scaleViewport(
  viewport: PlanViewportTilesInput["viewport"],
  scale: number,
) {
  return {
    x: viewport.x * scale,
    y: viewport.y * scale,
    width: viewport.width * scale,
    height: viewport.height * scale,
  };
}

function centerOut(
  tiles: ViewportTile[],
  viewport: PlanViewportTilesInput["viewport"],
  scale: number,
): ViewportTile[] {
  const centerX = (viewport.x + viewport.width / 2) * scale;
  const centerY = (viewport.y + viewport.height / 2) * scale;
  return [...tiles].sort((left, right) => {
    const leftDistance = (left.x + left.width / 2 - centerX) ** 2
      + (left.y + left.height / 2 - centerY) ** 2;
    const rightDistance = (right.x + right.width / 2 - centerX) ** 2
      + (right.y + right.height / 2 - centerY) ** 2;
    return leftDistance - rightDistance;
  });
}

function planScale(
  input: PlanViewportTilesInput,
  scale: number,
  kind: PlannedTileKind,
  priority: number,
  padding: number,
): PlannedViewportTile[] {
  const viewport = scaleViewport(input.viewport, scale);
  return centerOut(getViewportTiles({
    pageWidth: input.pageWidth * scale,
    pageHeight: input.pageHeight * scale,
    viewport,
    padding,
  }), input.viewport, scale).map((tile) => ({ ...tile, scale, kind, priority }));
}

export function planViewportTiles(input: PlanViewportTilesInput): PlannedViewportTile[] {
  const scale = normalizeTileScale(input.scale);
  const visible = planScale(input, scale, "visible", 30, 0);
  const visibleKeys = new Set(visible.map((tile) => tile.key));
  const ring = input.zoomDirection === 0
    ? planScale(input, scale, "ring", 20, HIGH_ZOOM_TILE_SIZE)
      .filter((tile) => !visibleKeys.has(tile.key))
      .slice(0, MAX_RING_PREFETCH_TILES)
    : [];

  const adjacentScale = normalizeTileScale(scale + input.zoomDirection * TILE_SCALE_STEP);
  const adjacent = input.zoomDirection === 0 || adjacentScale === scale
    ? []
    : planScale(input, adjacentScale, "adjacent", 20, 0)
      .slice(0, MAX_ADJACENT_PREFETCH_TILES);

  return [...visible, ...adjacent, ...ring].sort((left, right) => right.priority - left.priority);
}
