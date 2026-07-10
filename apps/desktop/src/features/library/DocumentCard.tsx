import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import { convertFileSrc } from "@tauri-apps/api/core";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import { documentStatusLabel, type LibraryDocument } from "../../domain/document";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface DocumentCardProps {
  document: LibraryDocument;
  onOpen: () => void;
  onDelete?: () => void;
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
    if (!visible) return;
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
        loadingTask = pdfjs.getDocument({ url: assetUrl });
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
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.scale(dpr, dpr);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (active) {
          setRendered(true);
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
  }, [visible, document.id, document.source, document.status, getDocumentFileUrl]);

  return (
    <div ref={coverRef} style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: rendered ? "block" : "none" }} />
      {!rendered && <span aria-hidden="true">{document.title.charAt(0)}</span>}
    </div>
  );
}

export function DocumentCard({ document, onOpen, onDelete, getDocumentFileUrl }: DocumentCardProps) {
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
            <img src={document.coverUrl} alt="" />
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
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${document.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "rgba(255, 59, 48, 0.9)",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: "24px",
            height: "24px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: "bold",
            zIndex: 10,
          }}
        >
          ✕
        </button>
      )}
    </article>
  );
}
