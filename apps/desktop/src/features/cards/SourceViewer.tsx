import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { CardSource } from "../../domain/learning";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface SourceViewerProps {
  source: CardSource;
  getDocumentFileUrl: (id: string) => Promise<string>;
  onClose: () => void;
}

export function SourceViewer({ source, getDocumentFileUrl, onClose }: SourceViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let active = true;
    let renderTask: any = null;

    const load = async () => {
      if (!source.documentId) return;
      try {
        const path = await getDocumentFileUrl(source.documentId);
        if (!active) return;
        const assetUrl = convertFileSrc(path);
        const doc = await pdfjs.getDocument({ url: assetUrl }).promise;
        if (!active) { doc.destroy(); return; }

        const page = await doc.getPage(source.page);
        if (!active) { doc.destroy(); return; }

        const viewport = page.getViewport({ scale: 1.0 });
        const containerWidth = containerRef.current?.clientWidth ?? 320;
        const s = Math.min(containerWidth / viewport.width, 1.5);
        const scaled = page.getViewport({ scale: s });

        setPageDims({ width: scaled.width, height: scaled.height });
        setScale(s);

        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = scaled.width * dpr;
        canvas.height = scaled.height * dpr;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        renderTask = page.render({ canvasContext: ctx, viewport: scaled });
        await renderTask.promise;

        setLoading(false);
        doc.destroy();
      } catch (_) {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      if (renderTask) renderTask.cancel();
    };
  }, [source.documentId, source.page, getDocumentFileUrl]);

  return (
    <section className="source-viewer" aria-label="Card source PDF">
      <header className="source-viewer__header">
        <h3 className="source-viewer__title">Source</h3>
        <button
          type="button"
          className="source-viewer__close-btn"
          onClick={onClose}
          aria-label="Close source viewer"
        >
          ×
        </button>
      </header>
      <div className="source-viewer__info">
        Page {source.page}
      </div>
      <div ref={containerRef} className="source-viewer__page">
        {loading && <div className="source-viewer__loading">Loading PDF…</div>}
        {pageDims && (
          <div style={{ position: "relative", width: pageDims.width, margin: "0 auto" }}>
            <canvas ref={canvasRef} style={{ width: pageDims.width, height: pageDims.height, display: "block" }} />
            {source.rects.map((rect, i) => (
              <div key={i} style={{
                position: "absolute",
                left: `${rect.x * scale}px`,
                top: `${rect.y * scale}px`,
                width: `${rect.width * scale}px`,
                height: `${rect.height * scale}px`,
                background: "rgba(255, 230, 0, 0.35)",
                pointerEvents: "none",
                zIndex: 1,
              }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
