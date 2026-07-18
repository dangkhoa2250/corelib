import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import { convertFileSrc } from "@tauri-apps/api/core";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import { documentStatusLabel, type LibraryDocument } from "../../domain/document";
import { saveCover as saveCoverApi } from "../../lib/desktop";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface CachedCover {
  url: string;
  width: number;
  height: number;
}

const coverCache = new Map<string, CachedCover>();

interface DocumentCardProps {
  document: LibraryDocument;
  onOpen: () => void;
  onDelete?: () => void;
  onRename?: (newTitle: string) => void;
  onViewStatistics?: (documentId: string) => void;
  menuOpen?: boolean;
  onMenuToggle?: (open: boolean) => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
}

function DynamicCover({
  document,
  getDocumentFileUrl,
  fallbackUrl,
}: {
  document: LibraryDocument;
  getDocumentFileUrl: (id: string) => Promise<string>;
  fallbackUrl?: string;
}) {
  const coverRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [coverSize, setCoverSize] = useState<{ width: number; height: number } | null>(null);

  const dpr = window.devicePixelRatio || 1;
  const targetWidth = coverSize ? Math.ceil(coverSize.width * dpr) : 0;
  const targetHeight = coverSize ? Math.ceil(coverSize.height * dpr) : 0;
  const cachedCover = coverCache.get(document.id);
  const cachedUrl = cachedCover?.url;
  const cachedAtTargetResolution = Boolean(cachedCover && cachedCover.width >= targetWidth && cachedCover.height >= targetHeight);

  useEffect(() => {
    const element = coverRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? false);
    }, { rootMargin: "200px" });
    observer.observe(element);
    const frame = requestAnimationFrame(() => {
      const { bottom, left, right, top } = element.getBoundingClientRect();
      const margin = 200;
      setVisible(
        bottom >= -margin
          && top <= window.innerHeight + margin
          && right >= -margin
          && left <= window.innerWidth + margin,
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = coverRef.current;
    if (!element) return;
    const updateSize = (rect: Pick<DOMRectReadOnly, "width" | "height">) => {
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width <= 0 || height <= 0) return;
      setCoverSize((current) => current?.width === width && current.height === height ? current : { width, height });
    };
    updateSize(element.getBoundingClientRect());
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateSize(entry.contentRect);
    });
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !coverSize || cachedAtTargetResolution) return;
    let active = true;
    let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;
    let renderTask: { promise: Promise<unknown>; cancel: () => void } | undefined;
    const renderCover = async () => {
      if (document.source === "google_drive" && document.status === "download_required") {
        return;
      }
      try {
        const url = await getDocumentFileUrl(document.id);
        if (!active) return;
        const assetUrl = convertFileSrc(url);
        loadingTask = pdfjs.getDocument({ url: assetUrl, enableHWA: true });
        const pdf = await loadingTask.promise;
        if (!active) return;
        const page = await pdf.getPage(1);
        if (!active) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.max(targetWidth / baseViewport.width, targetHeight / baseViewport.height);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (!active) return;

        setRendered(true);

        canvas.toBlob(async (blob) => {
          if (!blob || !active) return;
            const blobUrl = URL.createObjectURL(blob);
            const previous = coverCache.get(document.id);
            coverCache.set(document.id, { url: blobUrl, width: canvas.width, height: canvas.height });
            if (previous) URL.revokeObjectURL(previous.url);

            const buffer = await blob.arrayBuffer();
            const data = Array.from(new Uint8Array(buffer));
            try {
              await saveCoverApi(document.id, data);
            } catch (_) {}
        }, "image/png");
      } catch (_) {}
    };
    void renderCover();
    return () => {
      active = false;
      renderTask?.cancel();
      if (loadingTask && typeof loadingTask.destroy === "function") {
        void loadingTask.destroy();
      }
    };
  }, [visible, coverSize, cachedAtTargetResolution, targetWidth, targetHeight, document.id, document.source, document.status, getDocumentFileUrl]);

  return (
    <div ref={coverRef} style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: rendered ? "block" : "none" }} />
      {!rendered && cachedUrl ? <img src={cachedUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      {!rendered && !cachedUrl && fallbackUrl ? <img src={fallbackUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      {!rendered && !cachedUrl && !fallbackUrl && (
        document.status === "processing" ? (
          <div className="cover-loading" aria-label="Preparing cover">
            <div className="cover-loading__bar" />
          </div>
        ) : (
          <span aria-hidden="true">{document.title.charAt(0)}</span>
        )
      )}
    </div>
  );
}

export function DocumentCard({
  document,
  onOpen,
  onDelete,
  onRename,
  onViewStatistics,
  menuOpen = false,
  onMenuToggle,
  getDocumentFileUrl,
}: DocumentCardProps) {
  const statusLabel = documentStatusLabel(document);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(document.title);

  useEffect(() => {
    setRenameTitle(document.title);
  }, [document.title]);

  return (
    <article className="document-card">
      <button
        className="document-card__open"
        type="button"
        aria-label={`Open ${document.title}`}
        onClick={() => onOpen()}
      >
        <div className="document-card__cover">
          {getDocumentFileUrl ? (
            <DynamicCover document={document} getDocumentFileUrl={getDocumentFileUrl} fallbackUrl={document.coverUrl ? convertFileSrc(document.coverUrl) : undefined} />
          ) : document.coverUrl ? (
            <img src={convertFileSrc(document.coverUrl)} alt="" />
          ) : (
            <span aria-hidden="true">{document.title.charAt(0)}</span>
          )}
        </div>
      </button>
      <div className="document-card__details">
        <div className="document-card__title-row">
          <span className="document-card__title">{document.title}</span>
          {(onDelete || onRename || onViewStatistics) && (
            <div className="document-card__actions">
              <button
                className="document-card__menu-trigger"
                type="button"
                aria-label={`Actions for ${document.title}`}
                aria-expanded={menuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuToggle?.(!menuOpen);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="10" r="2" />
                  <circle cx="10" cy="10" r="2" />
                  <circle cx="15" cy="10" r="2" />
                </svg>
              </button>
              {menuOpen && (
                <div className="document-card__menu-popover">
                  {onViewStatistics && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMenuToggle?.(false);
                        onViewStatistics(document.id);
                      }}
                    >
                      View statistics
                    </button>
                  )}
                  {onRename && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMenuToggle?.(false);
                        setRenameTitle(document.title);
                        setIsRenameOpen(true);
                      }}
                    >
                      Rename
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="document-card__menu-delete"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMenuToggle?.(false);
                        if (window.confirm(`Are you sure you want to remove "${document.title}"?`)) {
                          onDelete();
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
              {isRenameOpen && onRename && (
                <form
                  className="document-card__rename-popover"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const nextTitle = renameTitle.trim();
                    if (nextTitle && nextTitle !== document.title) onRename(nextTitle);
                    setIsRenameOpen(false);
                  }}
                >
                  <input
                    aria-label="Rename document title"
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.currentTarget.value)}
                    autoFocus
                  />
                  <div className="document-card__rename-actions">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setIsRenameOpen(false); }}>
                      Cancel
                    </button>
                    <button type="submit" aria-label="Save title">Save</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
        {document.author ? (
          <span className="document-card__author">{document.author}</span>
        ) : null}
        {document.lastReadPage && document.numPages && document.numPages > 0 ? (
          <span className="document-card__progress">
            <span className="document-card__progress-track">
              <span
                className="document-card__progress-fill"
                style={{ width: `${Math.round((document.lastReadPage / document.numPages) * 100)}%` }}
              />
            </span>
            <span className="document-card__progress-label">
              {Math.round((document.lastReadPage / document.numPages) * 100)}%
            </span>
          </span>
        ) : statusLabel ? (
          <span className="document-card__status">{statusLabel}</span>
        ) : null}
      </div>
    </article>
  );
}
