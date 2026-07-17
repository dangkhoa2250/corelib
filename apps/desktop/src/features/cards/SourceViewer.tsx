import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PDFViewer as PDFViewerType } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { CardSource } from "../../domain/learning";
import { ScrollArea } from "../../components/ScrollArea";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
// pdfjs-dist/web/pdf_viewer.mjs reads its pdf.js API off `globalThis.pdfjsLib` at
// module-evaluation time. Set it ourselves (and import that module dynamically,
// below) instead of relying on static-import ordering to populate it first.
(globalThis as { pdfjsLib?: unknown }).pdfjsLib = pdfjs;

let pdfViewerModulePromise: Promise<typeof import("pdfjs-dist/web/pdf_viewer.mjs")> | null = null;
const SOURCE_SEARCH_CONCURRENCY = 8;

function setSourceFitScale(pdfViewer: PDFViewerType) {
  pdfViewer.currentScaleValue = "page-fit";
}

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

const completedSearchCache = new Map<string, TextMatch[]>();

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
  sourcePage: number,
): Promise<TextMatch[]> {
  const pageNumbers = [
    sourcePage,
    ...Array.from({ length: doc.numPages }, (_, i) => i + 1).filter((pageNumber) => pageNumber !== sourcePage),
  ];
  const matches: TextMatch[] = [];
  let nextPageIndex = 0;

  const searchNextPage = async () => {
    while (isActive()) {
      const pageNumber = pageNumbers[nextPageIndex++];
      if (!pageNumber) return;
      const page = await doc.getPage(pageNumber);
      if (!isActive()) return;
      const textContent = await page.getTextContent({ includeMarkedContent: true, disableNormalization: true } as never);
      if (!isActive()) return;
      const viewport = page.getViewport({ scale: 1.0 });
      const rectsPerMatch = findMatchesOnPage(textContent.items as TextItem[], viewport, query);
      matches.push(...rectsPerMatch.map((rects): TextMatch => ({ pageIndex: pageNumber - 1, rects })));
    }
  };

  const workers = Array.from(
    { length: Math.min(SOURCE_SEARCH_CONCURRENCY, pageNumbers.length) },
    () => searchNextPage(),
  );
  await Promise.all(workers);
  return matches.sort((a, b) => a.pageIndex - b.pageIndex);
}

export function SourceViewer({ source, getDocumentFileUrl, onClose }: SourceViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pdfViewerRef = useRef<PDFViewerType | null>(null);
  const matchesRef = useRef<TextMatch[]>([]);
  const highlightElsRef = useRef<HTMLDivElement[][]>([]);
  const savedHighlightElsRef = useRef<HTMLDivElement[]>([]);
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
    savedHighlightElsRef.current = [];
    currentMatchIndexRef.current = -1;

    let activeResizeObserver: ResizeObserver | null = null;
    let initialAnchorFrame: number | null = null;

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
        // Rects captured while creating the card identify the exact source
        // selection. Do not paint a second, text-search-based match on its
        // page: the same quote can occur more than once on that page.
        if (source.rects.length > 0 && match.pageIndex + 1 === source.page) return [];
        const pageView = pdfViewer.getPageView(match.pageIndex);
        const pageDiv: HTMLDivElement | undefined = pageView?.div;
        if (!pageDiv) return [];
        return match.rects.map((rect) => {
          const el = document.createElement("div");
          el.className = `source-viewer__highlight${match.pageIndex + 1 === source.page ? " source-viewer__highlight--source" : ""}`;
          el.style.left = `${rect.left}%`;
          el.style.top = `${rect.top}%`;
          el.style.width = `${rect.width}%`;
          el.style.height = `${rect.height}%`;
          pageDiv.appendChild(el);
          return el;
        });
      });
    };

    const renderSavedSourceHighlights = async () => {
      const pdfViewer = pdfViewerRef.current;
      if (!pdfViewer || !pdfDoc || source.rects.length === 0) return;
      const pageView = pdfViewer.getPageView(source.page - 1);
      const pageDiv: HTMLDivElement | undefined = pageView?.div;
      if (!pageDiv) return;

      const page = await pdfDoc.getPage(source.page);
      if (!active) return;
      // PDF.js replaces the contents of pageDiv when a page is rendered or
      // re-rendered. Remove stale handles and append the saved overlay only
      // after that render has completed.
      savedHighlightElsRef.current.forEach((el) => el.remove());
      savedHighlightElsRef.current = [];
      const viewport = page.getViewport({ scale: 1.0 });
      savedHighlightElsRef.current = source.rects.map((rect) => {
        const el = document.createElement("div");
        el.className = "source-viewer__highlight source-viewer__highlight--saved source-viewer__highlight--source";
        el.style.left = `${(100 * rect.x) / viewport.width}%`;
        el.style.top = `${(100 * rect.y) / viewport.height}%`;
        el.style.width = `${(100 * rect.width) / viewport.width}%`;
        el.style.height = `${(100 * rect.height) / viewport.height}%`;
        pageDiv.appendChild(el);
        return el;
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
        let hasInitialAnchor = false;
        let sourcePageRendered = false;
        let searchQuery = "";
        let searchStarted = false;

        const anchorAtSavedPage = () => {
          // Without a destination PDF.js only makes the page visible, which
          // may leave the viewport straddling two pages. An explicit XYZ
          // destination with y = null resolves to the top edge of this page.
          pdfViewer.scrollPageIntoView({
            pageNumber: source.page,
            destArray: [null, { name: "XYZ" }, 0, null, null],
          });
          // PDF.js may retain the previous page's scroll offset while it
          // recalculates the fit scale. Use the actual page element as the
          // final vertical position so the source never opens between pages.
          const pageDiv = pdfViewer.getPageView(source.page - 1)?.div;
          if (pageDiv) container.scrollTop = pageDiv.offsetTop;
        };

        const startDocumentSearch = () => {
          if (searchStarted || !pdfDoc || !searchQuery) return;
          searchStarted = true;
          setSearching(true);
          const searchCacheKey = `${source.documentId}:${searchQuery}`;
          const cachedMatches = completedSearchCache.get(searchCacheKey);
          const search = cachedMatches
            ? Promise.resolve(cachedMatches)
            : searchDocument(pdfDoc, searchQuery, () => active, source.page);
          void search
            .then((matches) => {
              if (!active) return;
              if (!cachedMatches) completedSearchCache.set(searchCacheKey, matches);
              matchesRef.current = matches;
              setSearching(false);
              setSearched(true);
              setMatchCount(matches.length);
              if (matches.length > 0) {
                renderHighlights(matches);
                const initialIndex = matches.findIndex((m) => m.pageIndex + 1 === source.page);
                if (initialIndex !== -1) selectMatch(initialIndex);
              }
            })
            .catch((e) => {
              if (!active) return;
              setSearching(false);
              setError(e instanceof Error ? e.message : String(e));
            });
        };

        const scheduleInitialAnchor = () => {
          if (hasInitialAnchor || initialAnchorFrame !== null) return;
          initialAnchorFrame = requestAnimationFrame(() => {
            initialAnchorFrame = null;
            if (!active) return;
            anchorAtSavedPage();
            if (!sourcePageRendered) return;
            hasInitialAnchor = true;
            startDocumentSearch();
          });
        };

        const resizeObserver = new ResizeObserver(() => {
          const activeViewer = pdfViewerRef.current;
          if (!activeViewer) return;
          setSourceFitScale(activeViewer);
          scheduleInitialAnchor();
        });
        resizeObserver.observe(container);
        activeResizeObserver = resizeObserver;

        eventBus.on("pagechanging", (evt: { pageNumber: number }) => {
          if (!active) return;
          setCurrentPage(evt.pageNumber);
        });

        eventBus.on("pagesinit", () => {
          if (!active) return;
          setSourceFitScale(pdfViewer);
          scheduleInitialAnchor();
          setLoading(false);
        });

        eventBus.on("pagerendered", (evt: { pageNumber: number }) => {
          if (!active || evt.pageNumber !== source.page) return;
          sourcePageRendered = true;
          scheduleInitialAnchor();
          void renderSavedSourceHighlights();
        });

        eventBus.on("pagesloaded", () => {
          if (!active) return;
          scheduleInitialAnchor();
        });

        const loadingTask = pdfjs.getDocument({ url: assetUrl });
        const doc = await loadingTask.promise;
        if (!active) { doc.destroy(); return; }
        pdfDoc = doc;

        linkService.setDocument(doc);
        pdfViewer.setDocument(doc);

        searchQuery = source.quote.replace(/\s+/g, " ").trim().toLowerCase();
        if (hasInitialAnchor) startDocumentSearch();
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
      activeResizeObserver?.disconnect();
      if (initialAnchorFrame !== null) cancelAnimationFrame(initialAnchorFrame);
      highlightElsRef.current.forEach((els) => els.forEach((el) => el.remove()));
      savedHighlightElsRef.current.forEach((el) => el.remove());
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
        <ScrollArea
          ref={containerRef}
          className="source-viewer__pdf-container"
          style={{ position: "absolute", inset: 0 }}
        >
          <div ref={viewerRef} className="pdfViewer" />
        </ScrollArea>
      </div>
    </section>
  );
}
