import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import { convertFileSrc } from "@tauri-apps/api/core";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import { documentStatusLabel, type LibraryDocument } from "../../domain/document";
import { saveCover as saveCoverApi } from "../../lib/desktop";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const coverCache = new Map<string, string>();

interface DocumentCardProps {
  document: LibraryDocument;
  onOpen: () => void;
  onDelete?: () => void;
  onRename?: (newTitle: string) => void;
  menuOpen?: boolean;
  onMenuToggle?: (open: boolean) => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
}

function DynamicCover({
  document,
  getDocumentFileUrl,
}: {
  document: LibraryDocument;
  getDocumentFileUrl: (id: string) => Promise<string>;
}) {
  const coverRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  const cachedUrl = coverCache.get(document.id);

  useEffect(() => {
    const element = coverRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? false);
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || cachedUrl) return;
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
        const viewport = page.getViewport({ scale: 0.15 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        context.scale(dpr, dpr);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (!active) return;

        setRendered(true);

        if (!coverCache.has(document.id)) {
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            const blobUrl = URL.createObjectURL(blob);
            coverCache.set(document.id, blobUrl);

            const buffer = await blob.arrayBuffer();
            const data = Array.from(new Uint8Array(buffer));
            try {
              await saveCoverApi(document.id, data);
            } catch (_) {}
          }, "image/png");
        }
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
  }, [visible, document.id, document.source, document.status, getDocumentFileUrl, cachedUrl]);

  if (cachedUrl) {
    return (
      <div ref={coverRef} style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
        <img src={cachedUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }

  return (
    <div ref={coverRef} style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: rendered ? "block" : "none" }} />
      {!rendered && (
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
  menuOpen = false,
  onMenuToggle,
  getDocumentFileUrl,
}: DocumentCardProps) {
  const statusLabel = documentStatusLabel(document);

  return (
    <article className="document-card" style={{ position: "relative" }}>
      <button
        className="document-card__open"
        type="button"
        aria-label={`Open ${document.title}`}
        onClick={() => onOpen()}
      >
        <div className="document-card__cover">
          {document.coverUrl ? (
            <img src={convertFileSrc(document.coverUrl)} alt="" />
          ) : getDocumentFileUrl ? (
            <DynamicCover document={document} getDocumentFileUrl={getDocumentFileUrl} />
          ) : (
            <span aria-hidden="true">{document.title.charAt(0)}</span>
          )}
        </div>
        <span className="document-card__title">{document.title}</span>
        {document.author ? (
          <span className="document-card__author">{document.author}</span>
        ) : null}
        {statusLabel ? (
          <span className="document-card__status">{statusLabel}</span>
        ) : null}
      </button>
      {(onDelete || onRename) && (
        <div style={{ position: "absolute", top: "8px", right: "8px", zIndex: 10 }}>
          <button
            type="button"
            aria-label={`Actions for ${document.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle?.(!menuOpen);
            }}
            style={{
              background: "rgba(255, 255, 255, 0.9)",
              border: "none",
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              color: "#55555a",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.9)")}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <circle cx="5" cy="10" r="2" />
              <circle cx="10" cy="10" r="2" />
              <circle cx="15" cy="10" r="2" />
            </svg>
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute",
                top: "36px",
                right: "0",
                background: "rgba(255, 255, 255, 0.95)",
                border: "1px solid rgba(0, 0, 0, 0.12)",
                borderRadius: "10px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                backdropFilter: "blur(10px)",
                padding: "4px",
                minWidth: "120px",
                zIndex: 100,
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              {onRename && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMenuToggle?.(false);
                    const newTitle = window.prompt("Rename book:", document.title);
                    if (newTitle && newTitle.trim()) {
                      onRename(newTitle.trim());
                    }
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    textAlign: "left",
                    fontSize: "14px",
                    color: "#1d1d1f",
                    cursor: "pointer",
                    width: "100%",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e8f2ff")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  Rename
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMenuToggle?.(false);
                    if (window.confirm(`Are you sure you want to remove "${document.title}"?`)) {
                      onDelete();
                    }
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    textAlign: "left",
                    fontSize: "14px",
                    color: "#ff3b30",
                    cursor: "pointer",
                    width: "100%",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ffebeb")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
