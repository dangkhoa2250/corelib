import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PDFViewer as PDFViewerType } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { CardSource } from "../../domain/learning";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
// pdfjs-dist/web/pdf_viewer.mjs reads its pdf.js API off `globalThis.pdfjsLib` at
// module-evaluation time. Set it ourselves (and import that module dynamically,
// below) instead of relying on static-import ordering to populate it first.
(globalThis as { pdfjsLib?: unknown }).pdfjsLib = pdfjs;

let pdfViewerModulePromise: Promise<typeof import("pdfjs-dist/web/pdf_viewer.mjs")> | null = null;
function loadPdfViewerModule() {
  return (pdfViewerModulePromise ??= import("pdfjs-dist/web/pdf_viewer.mjs"));
}

export interface SourceViewerProps {
  source: CardSource;
  getDocumentFileUrl: (id: string) => Promise<string>;
  onClose: () => void;
}

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TextMatch {
  pageIndex: number;
  rects: HighlightRect[];
}

type TextItem = { str?: string; transform: number[]; width: number; height: number };
type Viewport = { transform: number[]; width: number; height: number };

// pdf.js's own PDFFindController highlighter positions matches using an offset
// space that doesn't line up with the text layer's for documents where lines
// wrap a lot (drift grows with every wrapped line - verified empirically
// against this component's own text items). Search and place highlights
// ourselves instead, straight from each page's text item geometry.
function findMatchesOnPage(items: TextItem[], viewport: Viewport, query: string): HighlightRect[][] {
  let text = "";
  const ranges: { itemIndex: number; start: number; end: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.str === undefined) continue;
    const start = text.length;
    text += it.str;
    ranges.push({ itemIndex: i, start, end: text.length });
    text += " ";
  }

  const lower = text.toLowerCase();
  const matches: HighlightRect[][] = [];
  let searchFrom = 0;
  while (true) {
    const idx = lower.indexOf(query, searchFrom);
    if (idx === -1) break;
    const matchEnd = idx + query.length;
    const spanned = ranges.filter((r) => r.start < matchEnd && r.end > idx);
    const rects = spanned.map((r) => {
      const it = items[r.itemIndex];
      const fullLen = it.str!.length;
      const localStart = Math.max(idx, r.start) - r.start;
      const localEnd = Math.min(matchEnd, r.end) - r.start;
      const xStartFrac = fullLen > 0 ? localStart / fullLen : 0;
      const xEndFrac = fullLen > 0 ? localEnd / fullLen : 1;

      const tx = pdfjs.Util.transform(viewport.transform, it.transform);
      const angle = Math.atan2(tx[1], tx[0]);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const left = tx[4] + it.width * xStartFrac * Math.cos(angle);
      const top = tx[5] - fontHeight;
      const rectWidth = it.width * (xEndFrac - xStartFrac);

      return {
        left: (100 * left) / viewport.width,
        top: (100 * top) / viewport.height,
        width: (100 * rectWidth) / viewport.width,
        height: (100 * it.height) / viewport.height,
      };
    });
    matches.push(rects);
    searchFrom = idx + 1;
  }
  return matches;
}

async function searchDocument(
  doc: pdfjs.PDFDocumentProxy,
  query: string,
  isActive: () => boolean,
): Promise<TextMatch[]> {
  const pageNumbers = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const perPage = await Promise.all(
    pageNumbers.map(async (pageNumber) => {
      const page = await doc.getPage(pageNumber);
      if (!isActive()) return [];
      const [textContent, viewport] = await Promise.all([
        page.getTextContent({ includeMarkedContent: true, disableNormalization: true } as never),
        Promise.resolve(page.getViewport({ scale: 1.0 })),
      ]);
      const rectsPerMatch = findMatchesOnPage(textContent.items as TextItem[], viewport, query);
      return rectsPerMatch.map((rects): TextMatch => ({ pageIndex: pageNumber - 1, rects }));
    }),
  );
  return perPage.flat();
}

export function SourceViewer({ source, getDocumentFileUrl, onClose }: SourceViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pdfViewerRef = useRef<PDFViewerType | null>(null);
  const matchesRef = useRef<TextMatch[]>([]);
  const highlightElsRef = useRef<HTMLDivElement[][]>([]);
  const currentMatchIndexRef = useRef(-1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(source.page);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let active = true;
    let pdfDoc: pdfjs.PDFDocumentProxy | null = null;

    setLoading(true);
    setError(null);
    setCurrentPage(source.page);
    setMatchCount(0);
    setCurrentMatchIndex(-1);
    setSearching(false);
    setSearched(false);
    matchesRef.current = [];
    highlightElsRef.current = [];
    currentMatchIndexRef.current = -1;

    const selectMatch = (index: number) => {
      const prevIndex = currentMatchIndexRef.current;
      if (prevIndex >= 0) {
        highlightElsRef.current[prevIndex]?.forEach((el) => el.classList.remove("source-viewer__highlight--selected"));
      }
      currentMatchIndexRef.current = index;
      setCurrentMatchIndex(index);
      if (index >= 0) {
        highlightElsRef.current[index]?.forEach((el) => el.classList.add("source-viewer__highlight--selected"));
      }
    };

    const renderHighlights = (matches: TextMatch[]) => {
      const pdfViewer = pdfViewerRef.current;
      if (!pdfViewer) return;
      highlightElsRef.current = matches.map((match) => {
        const pageView = pdfViewer.getPageView(match.pageIndex);
        const pageDiv: HTMLDivElement | undefined = pageView?.div;
        if (!pageDiv) return [];
        return match.rects.map((rect) => {
          const el = document.createElement("div");
          el.className = "source-viewer__highlight";
          el.style.left = `${rect.left}%`;
          el.style.top = `${rect.top}%`;
          el.style.width = `${rect.width}%`;
          el.style.height = `${rect.height}%`;
          pageDiv.appendChild(el);
          return el;
        });
      });
    };

    const load = async () => {
      if (!source.documentId) {
        setError("No source document");
        setLoading(false);
        return;
      }
      const container = containerRef.current;
      const viewerEl = viewerRef.current;
      if (!container || !viewerEl) {
        setLoading(false);
        return;
      }

      try {
        const path = await getDocumentFileUrl(source.documentId);
        if (!active) return;
        const assetUrl = convertFileSrc(path);

        const { EventBus, PDFLinkService, PDFViewer } = await loadPdfViewerModule();
        if (!active) return;

        const eventBus = new EventBus();
        const linkService = new PDFLinkService({ eventBus });
        const pdfViewer = new PDFViewer({ container, viewer: viewerEl, eventBus, linkService });
        linkService.setViewer(pdfViewer);
        pdfViewerRef.current = pdfViewer;

        eventBus.on("pagechanging", (evt: { pageNumber: number }) => {
          if (!active) return;
          setCurrentPage(evt.pageNumber);
        });

        eventBus.on("pagesinit", () => {
          if (!active) return;
          pdfViewer.currentScaleValue = "page-width";
          pdfViewer.currentPageNumber = source.page;
          setLoading(false);
        });

        const loadingTask = pdfjs.getDocument({ url: assetUrl });
        const doc = await loadingTask.promise;
        if (!active) { doc.destroy(); return; }
        pdfDoc = doc;

        linkService.setDocument(doc);
        pdfViewer.setDocument(doc);

        const query = source.quote.replace(/\s+/g, " ").trim().toLowerCase();
        if (query) {
          setSearching(true);
          const matches = await searchDocument(doc, query, () => active);
          if (!active) return;
          matchesRef.current = matches;
          setSearching(false);
          setSearched(true);
          setMatchCount(matches.length);
          if (matches.length > 0) {
            renderHighlights(matches);
            const initialIndex = matches.findIndex((m) => m.pageIndex + 1 >= source.page);
            selectMatch(initialIndex === -1 ? 0 : initialIndex);
          }
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
      highlightElsRef.current.forEach((els) => els.forEach((el) => el.remove()));
      pdfViewerRef.current?.setDocument(null as unknown as pdfjs.PDFDocumentProxy);
      pdfViewerRef.current = null;
      pdfDoc?.destroy();
    };
  }, [source.documentId, source.page, source.quote, getDocumentFileUrl]);

  const goToMatch = (step: 1 | -1) => {
    const matches = matchesRef.current;
    const pdfViewer = pdfViewerRef.current;
    if (!pdfViewer || matches.length === 0) return;
    const nextIndex = (currentMatchIndexRef.current + step + matches.length) % matches.length;

    const prevIndex = currentMatchIndexRef.current;
    if (prevIndex >= 0) {
      highlightElsRef.current[prevIndex]?.forEach((el) => el.classList.remove("source-viewer__highlight--selected"));
    }
    currentMatchIndexRef.current = nextIndex;
    setCurrentMatchIndex(nextIndex);
    highlightElsRef.current[nextIndex]?.forEach((el) => el.classList.add("source-viewer__highlight--selected"));

    pdfViewer.currentPageNumber = matches[nextIndex].pageIndex + 1;
  };

  const hasQuery = source.quote.trim().length > 0;

  return (
    <section className="source-viewer" aria-label="Card source PDF">
      <header className="source-viewer__header">
        <h3 className="source-viewer__title">Source</h3>
        <span className="source-viewer__page-label">Page {currentPage}</span>
        {hasQuery && matchCount > 0 && (
          <div className="source-viewer__match-nav">
            <span className="source-viewer__match-count">{currentMatchIndex + 1}/{matchCount}</span>
            <button
              type="button"
              className="source-viewer__match-btn"
              onClick={() => goToMatch(-1)}
              aria-label="Previous match"
            >
              ‹
            </button>
            <button
              type="button"
              className="source-viewer__match-btn"
              onClick={() => goToMatch(1)}
              aria-label="Next match"
            >
              ›
            </button>
          </div>
        )}
        {hasQuery && searching && <span className="source-viewer__match-searching">Searching…</span>}
        {hasQuery && searched && !searching && matchCount === 0 && (
          <span className="source-viewer__match-empty">Not found</span>
        )}
        <button
          type="button"
          className="source-viewer__close-btn"
          onClick={onClose}
          aria-label="Close source viewer"
        >
          ×
        </button>
      </header>
      <div className="source-viewer__page">
        {loading && <div className="source-viewer__loading">Loading PDF…</div>}
        {error && <div className="source-viewer__error">{error}</div>}
        <div ref={containerRef} className="source-viewer__pdf-container">
          <div ref={viewerRef} className="pdfViewer" />
        </div>
      </div>
    </section>
  );
}
