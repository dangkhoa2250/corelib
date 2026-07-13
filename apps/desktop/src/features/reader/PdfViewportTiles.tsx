import React, { useEffect, useMemo, useRef, useState } from "react";

import { createPageRenderQueue, PageRenderQueueError, type PageRenderQueueToken } from "./pageRenderQueue";
import { getViewportTiles, type ViewportTile } from "./viewportTiles";

const HIGH_ZOOM_SCALE = 1.5;

type PageRenderQueue = ReturnType<typeof createPageRenderQueue>;

interface PdfViewportTilesProps {
  page: any;
  pageWidth: number;
  pageHeight: number;
  renderScale: number;
  pageContainerRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLDivElement | null>;
  queue: PageRenderQueue;
}

function isExpectedCancellation(error: unknown) {
  return error instanceof PageRenderQueueError
    || (error instanceof Error && error.name === "RenderingCancelledException");
}

function PdfRasterTile({ page, tile, renderScale, queue }: {
  page: any;
  tile: ViewportTile;
  renderScale: number;
  queue: PageRenderQueue;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let active = true;
    let renderTask: any = null;
    const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    canvas.width = Math.ceil(tile.width * pixelRatio);
    canvas.height = Math.ceil(tile.height * pixelRatio);

    const token: PageRenderQueueToken<void> = queue.run(async () => {
      if (!active) throw new PageRenderQueueError("SUPERSEDED");
      const viewport = page.getViewport({ scale: renderScale });
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: [pixelRatio, 0, 0, pixelRatio, -tile.x * pixelRatio, -tile.y * pixelRatio],
      });
      await renderTask.promise;
    }, { priority: 10 });

    void token.promise.catch((error) => {
      if (import.meta.env.DEV && active && !isExpectedCancellation(error)) {
        console.error("PDF tile render failed", { tile, renderScale, error });
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
      queue.supersede(token.id);
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [page, queue, renderScale, tile]);

  return (
    <canvas
      ref={canvasRef}
      className="reader-raster-tile"
      style={{
        position: "absolute",
        left: `${tile.x}px`,
        top: `${tile.y}px`,
        width: `${tile.width}px`,
        height: `${tile.height}px`,
      }}
    />
  );
}

export function PdfViewportTiles({
  page,
  pageWidth,
  pageHeight,
  renderScale,
  pageContainerRef,
  rootRef,
  queue,
}: PdfViewportTilesProps) {
  const [visibleRect, setVisibleRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (renderScale < HIGH_ZOOM_SCALE) {
      setVisibleRect(null);
      return;
    }
    const root = rootRef.current;
    const pageElement = pageContainerRef.current;
    if (!root || !pageElement) return;
    let frame = 0;

    const updateVisibleRect = () => {
      frame = 0;
      const rootRect = root.getBoundingClientRect();
      const pageRect = pageElement.getBoundingClientRect();
      if (pageRect.width <= 0 || pageRect.height <= 0) return;
      const left = Math.max(rootRect.left, pageRect.left);
      const top = Math.max(rootRect.top, pageRect.top);
      const right = Math.min(rootRect.right, pageRect.right);
      const bottom = Math.min(rootRect.bottom, pageRect.bottom);
      if (right <= left || bottom <= top) {
        setVisibleRect(null);
        return;
      }
      const xScale = pageWidth * renderScale / pageRect.width;
      const yScale = pageHeight * renderScale / pageRect.height;
      const next = {
        x: (left - pageRect.left) * xScale,
        y: (top - pageRect.top) * yScale,
        width: (right - left) * xScale,
        height: (bottom - top) * yScale,
      };
      setVisibleRect((current) => (
        current
        && current.x === next.x
        && current.y === next.y
        && current.width === next.width
        && current.height === next.height
          ? current
          : next
      ));
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateVisibleRect);
    };

    updateVisibleRect();
    root.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      root.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pageContainerRef, pageHeight, pageWidth, renderScale, rootRef]);

  const tiles = useMemo(() => (
    visibleRect
      ? getViewportTiles({
        pageWidth: pageWidth * renderScale,
        pageHeight: pageHeight * renderScale,
        viewport: visibleRect,
      })
      : []
  ), [pageHeight, pageWidth, renderScale, visibleRect]);

  if (renderScale < HIGH_ZOOM_SCALE) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {tiles.map((tile) => (
        <PdfRasterTile key={`${renderScale}:${tile.key}`} page={page} tile={tile} renderScale={renderScale} queue={queue} />
      ))}
    </div>
  );
}
