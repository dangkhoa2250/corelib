export const HIGH_ZOOM_TILE_SIZE = 768;
export const HIGH_ZOOM_TILE_PADDING = 128;

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
}

export function getViewportTiles({ pageWidth, pageHeight, viewport }: ViewportTileInput): ViewportTile[] {
  const left = Math.max(0, viewport.x - HIGH_ZOOM_TILE_PADDING);
  const top = Math.max(0, viewport.y - HIGH_ZOOM_TILE_PADDING);
  const right = Math.min(pageWidth, viewport.x + viewport.width + HIGH_ZOOM_TILE_PADDING);
  const bottom = Math.min(pageHeight, viewport.y + viewport.height + HIGH_ZOOM_TILE_PADDING);
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
