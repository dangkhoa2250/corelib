import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { createPageRenderQueue, PageRenderQueueError, type PageRenderQueueToken } from "./pageRenderQueue";
import {
  pdfTileCacheBudget,
  type PdfTileCacheBudget,
} from "./pdfTileCache";
import {
  normalizeTileScale,
  planViewportTiles,
  type PlannedViewportTile,
} from "./viewportTiles";

const HIGH_ZOOM_SCALE = 1.5;
// WebKit commonly keeps both a CPU bitmap and a GPU surface for a canvas.
// Account for both so the 64 MiB budget bounds resident pressure instead of
// merely counting the JavaScript-visible RGBA backing store.
const CANVAS_RESIDENT_COST_MULTIPLIER = 2;

type PageRenderQueue = ReturnType<typeof createPageRenderQueue>;

interface PdfViewportTilesProps {
  page: any;
  pageWidth: number;
  pageHeight: number;
  renderScale: number;
  pageContainerRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLDivElement | null>;
  queue: PageRenderQueue;
  cacheNamespace?: string;
  cacheBudget?: PdfTileCacheBudget;
}

interface CachedTileState extends PlannedViewportTile {
  cacheKey: string;
  ready: boolean;
  cached: boolean;
}

interface TileBenchmarkMetrics {
  targetScale: number;
  rasterJobs: number;
  firstExactMs: number | null;
  fullCoverageMs: number | null;
}

function tileIntersectsViewport(
  tile: Pick<CachedTileState, "x" | "y" | "width" | "height" | "scale">,
  viewport: { x: number; y: number; width: number; height: number },
) {
  const left = tile.x / tile.scale;
  const top = tile.y / tile.scale;
  const right = (tile.x + tile.width) / tile.scale;
  const bottom = (tile.y + tile.height) / tile.scale;
  return right > viewport.x
    && left < viewport.x + viewport.width
    && bottom > viewport.y
    && top < viewport.y + viewport.height;
}

function isExpectedCancellation(error: unknown) {
  return error instanceof PageRenderQueueError
    || (error instanceof Error && error.name === "RenderingCancelledException");
}

function PdfRasterTile({
  page,
  tile,
  queue,
  cacheKey,
  priority,
  visible,
  zIndex,
  onRasterStarted,
  onRendered,
}: {
  page: any;
  tile: PlannedViewportTile;
  queue: PageRenderQueue;
  cacheKey: string;
  priority: number;
  visible: boolean;
  zIndex: number;
  onRasterStarted: () => void;
  onRendered: (cacheKey: string, bytes: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const priorityRef = useRef(priority);
  priorityRef.current = priority;

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
      onRasterStarted();
      const viewport = page.getViewport({ scale: tile.scale });
      renderTask = page.render({
        canvasContext: context,
        viewport,
        background: "#ffffff",
        transform: [pixelRatio, 0, 0, pixelRatio, -tile.x * pixelRatio, -tile.y * pixelRatio],
      });
      await renderTask.promise;
      if (active) onRendered(
        cacheKey,
        canvas.width * canvas.height * 4 * CANVAS_RESIDENT_COST_MULTIPLIER,
      );
    }, { priority: priorityRef.current });

    void token.promise.catch((error) => {
      if (import.meta.env.DEV && active && !isExpectedCancellation(error)) {
        console.error("PDF tile render failed", { tile, error });
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
      queue.supersede(token.id);
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [cacheKey, onRasterStarted, onRendered, page, queue, tile.height, tile.key, tile.scale, tile.width, tile.x, tile.y]);

  return (
    <canvas
      ref={canvasRef}
      className="reader-raster-tile"
      data-cache-key={cacheKey}
      data-render-scale={tile.scale}
      style={{
        position: "absolute",
        left: `${tile.x / tile.scale}px`,
        top: `${tile.y / tile.scale}px`,
        width: `${tile.width / tile.scale}px`,
        height: `${tile.height / tile.scale}px`,
        opacity: visible ? 1 : 0,
        zIndex,
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
  cacheNamespace,
  cacheBudget = pdfTileCacheBudget,
}: PdfViewportTilesProps) {
  const localNamespace = useId();
  const namespacePrefix = `${cacheNamespace ?? localNamespace}:`;
  const [visibleRect, setVisibleRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const targetScale = normalizeTileScale(renderScale);
  const targetStartedAtRef = useRef(performance.now());
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<TileBenchmarkMetrics>({
    targetScale,
    rasterJobs: 0,
    firstExactMs: null,
    fullCoverageMs: null,
  });
  const previousScaleRef = useRef(targetScale);
  const [zoomDirection, setZoomDirection] = useState<-1 | 0 | 1>(0);

  useEffect(() => {
    const previous = previousScaleRef.current;
    const nextDirection = targetScale > previous ? 1 : targetScale < previous ? -1 : 0;
    previousScaleRef.current = targetScale;
    setZoomDirection(nextDirection);
    if (nextDirection === 0) return;
    const timeout = window.setTimeout(() => setZoomDirection(0), 240);
    return () => window.clearTimeout(timeout);
  }, [targetScale]);

  useEffect(() => {
    targetStartedAtRef.current = performance.now();
    setBenchmarkMetrics((current) => ({
      targetScale,
      rasterJobs: current.rasterJobs,
      firstExactMs: null,
      fullCoverageMs: null,
    }));
  }, [targetScale]);

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
      // Keep this rectangle in the stable scale-1 page coordinate system.
      // The planner converts it to each requested raster scale independently.
      const xScale = pageWidth / pageRect.width;
      const yScale = pageHeight / pageRect.height;
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

  const plan = useMemo(() => (
    visibleRect && renderScale >= HIGH_ZOOM_SCALE
      ? planViewportTiles({
        pageWidth,
        pageHeight,
        viewport: visibleRect,
        scale: targetScale,
        zoomDirection,
      })
      : []
  ), [pageHeight, pageWidth, renderScale, targetScale, visibleRect, zoomDirection]);
  const planWithKeys = useMemo(() => plan.map((tile) => ({
    ...tile,
    cacheKey: `${namespacePrefix}${tile.scale.toFixed(2)}:${tile.key}`,
  })), [namespacePrefix, plan]);
  const plannedKeys = useMemo(() => new Set(planWithKeys.map((tile) => tile.cacheKey)), [planWithKeys]);
  const [cachedTiles, setCachedTiles] = useState<CachedTileState[]>([]);

  useEffect(() => {
    if (planWithKeys.length === 0) {
      setCachedTiles((current) => current.filter((tile) => tile.cached));
      return;
    }
    setCachedTiles((current) => {
      const next = current.filter((tile) => tile.cached || plannedKeys.has(tile.cacheKey));
      const byKey = new Map(next.map((tile) => [tile.cacheKey, tile]));
      planWithKeys.forEach((planned) => {
        const existing = byKey.get(planned.cacheKey);
        if (existing) {
          const updated = { ...existing, kind: planned.kind, priority: planned.priority };
          next[next.indexOf(existing)] = updated;
          byKey.set(planned.cacheKey, updated);
          return;
        }
        const added: CachedTileState = { ...planned, ready: false, cached: false };
        next.push(added);
        byKey.set(added.cacheKey, added);
      });
      return next;
    });

    planWithKeys.forEach((tile) => {
      if (cacheBudget.has(tile.cacheKey)) cacheBudget.hit(tile.cacheKey);
    });
  }, [cacheBudget, planWithKeys, plannedKeys]);

  useEffect(() => cacheBudget.subscribe((removedKeys) => {
    const removed = new Set(removedKeys);
    setCachedTiles((current) => current.filter((tile) => !removed.has(tile.cacheKey)));
  }), [cacheBudget]);

  const markTileRendered = useCallback((cacheKey: string, bytes: number) => {
    const cached = cacheBudget.insert({ key: cacheKey, bytes });
    setCachedTiles((current) => current.map((tile) => (
      tile.cacheKey === cacheKey ? { ...tile, ready: true, cached } : tile
    )));
  }, [cacheBudget]);
  const markRasterStarted = useCallback(() => {
    setBenchmarkMetrics((current) => ({ ...current, rasterJobs: current.rasterJobs + 1 }));
  }, []);

  useEffect(() => {
    const visibleKeys = planWithKeys
      .filter((tile) => tile.kind === "visible" && tile.scale === targetScale)
      .map((tile) => tile.cacheKey);
    if (visibleKeys.length === 0) return;
    const readyKeys = new Set(cachedTiles.filter((tile) => tile.ready).map((tile) => tile.cacheKey));
    const readyCount = visibleKeys.filter((key) => readyKeys.has(key)).length;
    if (readyCount === 0) return;
    const elapsed = Math.max(0, Math.round(performance.now() - targetStartedAtRef.current));
    setBenchmarkMetrics((current) => {
      if (current.targetScale !== targetScale) return current;
      const firstExactMs = current.firstExactMs ?? elapsed;
      const fullCoverageMs = readyCount === visibleKeys.length
        ? current.fullCoverageMs ?? elapsed
        : current.fullCoverageMs;
      if (firstExactMs === current.firstExactMs && fullCoverageMs === current.fullCoverageMs) return current;
      return { ...current, firstExactMs, fullCoverageMs };
    });
  }, [cachedTiles, planWithKeys, targetScale]);

  const hasFullTargetCoverage = useMemo(() => {
    const visibleKeys = planWithKeys
      .filter((tile) => tile.kind === "visible" && tile.scale === targetScale)
      .map((tile) => tile.cacheKey);
    if (visibleKeys.length === 0) return false;
    const readyKeys = new Set(cachedTiles.filter((tile) => tile.ready).map((tile) => tile.cacheKey));
    return visibleKeys.every((key) => readyKeys.has(key));
  }, [cachedTiles, planWithKeys, targetScale]);

  const closestFallbackScale = useMemo(() => {
    if (!visibleRect || renderScale < HIGH_ZOOM_SCALE || hasFullTargetCoverage) return null;
    const coverage = new Map<number, number>();
    cachedTiles.forEach((tile) => {
      if (!tile.ready || tile.scale === targetScale || !tileIntersectsViewport(tile, visibleRect)) return;
      coverage.set(tile.scale, (coverage.get(tile.scale) ?? 0) + 1);
    });
    return [...coverage.entries()].sort((left, right) => (
      right[1] - left[1]
      || Math.abs(left[0] - targetScale) - Math.abs(right[0] - targetScale)
    ))[0]?.[0] ?? null;
  }, [cachedTiles, hasFullTargetCoverage, renderScale, targetScale, visibleRect]);
  const displayedKeys = useMemo(() => new Set(cachedTiles
    .filter((tile) => (
      renderScale >= HIGH_ZOOM_SCALE
      && visibleRect
      && tile.ready
      && (tile.scale === targetScale || tile.scale === closestFallbackScale)
      && tileIntersectsViewport(tile, visibleRect)
    ))
    .map((tile) => tile.cacheKey)), [cachedTiles, closestFallbackScale, renderScale, targetScale, visibleRect]);
  const pinnedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pinned = pinnedKeysRef.current;
    pinned.forEach((key) => {
      if (!displayedKeys.has(key)) {
        cacheBudget.unpin(key);
        pinned.delete(key);
      }
    });
    displayedKeys.forEach((key) => {
      if (!pinned.has(key)) {
        cacheBudget.pin(key);
        cacheBudget.touch(key);
        pinned.add(key);
      }
    });
  }, [cacheBudget, displayedKeys]);

  useEffect(() => () => {
    pinnedKeysRef.current.forEach((key) => cacheBudget.unpin(key));
    pinnedKeysRef.current.clear();
    cacheBudget.removeNamespace(namespacePrefix);
  }, [cacheBudget, namespacePrefix]);

  useEffect(() => {
    if (renderScale >= HIGH_ZOOM_SCALE) return;
    cacheBudget.removeNamespace(namespacePrefix);
    setCachedTiles([]);
  }, [cacheBudget, namespacePrefix, renderScale]);

  if (renderScale < HIGH_ZOOM_SCALE) return null;

  const cacheStats = cacheBudget.stats();
  const cacheLookups = cacheStats.hits + cacheStats.misses;
  const benchmarkSnapshot = {
    ...benchmarkMetrics,
    cacheBytes: cacheStats.bytes,
    cachePeakBytes: cacheStats.peakBytes,
    cacheEntries: cacheStats.entries,
    cacheHits: cacheStats.hits,
    cacheMisses: cacheStats.misses,
    cacheHitRatio: cacheLookups === 0 ? 0 : cacheStats.hits / cacheLookups,
    cacheEvictions: cacheStats.evictions,
  };

  return (
    <div
      className="reader-raster-tiles"
      data-target-scale={targetScale}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {cachedTiles.map((tile) => {
        const visible = tile.ready
          && (tile.scale === targetScale || tile.scale === closestFallbackScale);
        return (
          <PdfRasterTile
            key={tile.cacheKey}
            page={page}
            tile={tile}
            queue={queue}
            cacheKey={tile.cacheKey}
            priority={tile.priority}
            visible={visible}
            zIndex={tile.scale === targetScale ? 2 : 1}
            onRasterStarted={markRasterStarted}
            onRendered={markTileRendered}
          />
        );
      })}
      {import.meta.env.DEV && (
        <output
          aria-label="PDF tile benchmark metrics"
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            overflow: "hidden",
            clipPath: "inset(50%)",
          }}
        >
          {JSON.stringify(benchmarkSnapshot)}
        </output>
      )}
    </div>
  );
}
