import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as pdfjs from "pdfjs-dist";
import { convertFileSrc } from "@tauri-apps/api/core";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import type { LibraryDocument } from "../../domain/document";
import type { CardSource, SelectionRect } from "../../domain/learning";
import { selectionDraft, selectionIsWithinPage } from "./readerSelection";
import { CardSelectionToolbar } from "./CardSelectionToolbar";
import { CardComposer, type CardSaveInput, type CardComposerDeck } from "../cards/CardComposer";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

let lastSelectionRange: Range | null = null;

const MIN_ZOOM_SCALE = 0.5;
const MAX_ZOOM_SCALE = 3;
const MAX_CANVAS_PIXEL_RATIO = 3.0;
// Hard budget per page canvas (~16MP, pdf.js viewer default). Zoom × Retina can
// otherwise multiply to 36x the page's pixels and rasterization heats the CPU.
const MAX_CANVAS_PIXELS = 16_777_216;

export function clampZoomScale(scale: number) {
  return Math.min(Math.max(scale, MIN_ZOOM_SCALE), MAX_ZOOM_SCALE);
}

export function getCanvasPixelRatio(devicePixelRatio: number, cssWidth = 0, cssHeight = 0) {
  const ratio = Math.min(Math.max(devicePixelRatio, 1), MAX_CANVAS_PIXEL_RATIO);
  const area = cssWidth * cssHeight;
  if (area <= 0) return ratio;
  return Math.max(Math.min(ratio, Math.sqrt(MAX_CANVAS_PIXELS / area)), 0.25);
}

export function getCenteredPageOffset(viewportWidth: number, contentWidth: number) {
  return Math.max(0, (viewportWidth - contentWidth) / 2);
}

export function getZoomAnchorScrollPosition({
  scrollLeft,
  scrollTop,
  pointerX,
  pointerY,
  previousScale,
  nextScale,
}: {
  scrollLeft: number;
  scrollTop: number;
  pointerX: number;
  pointerY: number;
  previousScale: number;
  nextScale: number;
}) {
  const scaleRatio = nextScale / previousScale;

  return {
    scrollLeft: Math.max(0, (scrollLeft + pointerX) * scaleRatio - pointerX),
    scrollTop: Math.max(0, (scrollTop + pointerY) * scaleRatio - pointerY),
  };
}

interface ThumbnailPageProps {
  pdfDoc: pdfjs.PDFDocumentProxy;
  pageNumber: number;
  onClick: () => void;
  active: boolean;
}

function ThumbnailPage({ pdfDoc, pageNumber, onClick, active }: ThumbnailPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible || rendered) return;
    let isCurrent = true;
    const renderThumb = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (!isCurrent) return;
        const viewport = page.getViewport({ scale: 0.12 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        const dpr = getCanvasPixelRatio(window.devicePixelRatio || 1, viewport.width, viewport.height);
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        context.scale(dpr, dpr);
        await page.render({ canvasContext: context, viewport }).promise;
        if (isCurrent) {
          setRendered(true);
        }
      } catch (_) {}
    };
    void renderThumb();
    return () => {
      isCurrent = false;
    };
  }, [pdfDoc, pageNumber, isVisible, rendered]);

  return (
    <button
      ref={containerRef}
      type="button"
      className={`reader-thumbnail ${active ? "reader-thumbnail--active" : ""}`}
      onClick={onClick}
      aria-label={`Go to page ${pageNumber}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px",
        border: "none",
        background: "transparent",
        borderRadius: "8px",
        cursor: "pointer",
        width: "100%",
        minHeight: "120px",
        justifyContent: "center",
      }}
    >
      <div className={`reader-thumbnail__frame ${active ? "reader-thumbnail__frame--active" : ""}`}>
        <div
          className="reader-thumbnail__page"
          style={{
            width: "80px",
            height: "110px",
            background: "#ffffff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            borderRadius: "4px",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: rendered ? "block" : "none" }} />
          {!rendered && <span style={{ color: "#8e8e93", fontSize: "14px" }}>{pageNumber}</span>}
        </div>
      </div>
      <span className={`reader-thumbnail__label ${active ? "reader-thumbnail__label--active" : ""}`}>{pageNumber}</span>
    </button>
  );
}

interface PdfPageProps {
  pdfDoc: pdfjs.PDFDocumentProxy;
  pageNumber: number;
  renderScale: number;
  defaultWidth: number;
  defaultHeight: number;
  pagesContainerRef: React.RefObject<HTMLDivElement | null>;
  onVisible: () => void;
  onSelection: (source: CardSource, focusPage: number) => void;
}

const PdfPage = React.memo(
  function PdfPage({
    pdfDoc,
    pageNumber,
    renderScale,
    defaultWidth,
    defaultHeight,
    pagesContainerRef,
    onVisible,
    onSelection,
  }: PdfPageProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const textLayerRef = useRef<HTMLDivElement | null>(null);
    const annotationLayerRef = useRef<HTMLDivElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);

    const currentWidth = pageSize ? pageSize.width : defaultWidth;
    const currentHeight = pageSize ? pageSize.height : defaultHeight;

    const captureSelection = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      lastSelectionRange = range;
      const pageElement = containerRef.current;
      if (!pageElement) return;
      if (!selectionIsWithinPage(selection, pageElement)) return;
      const focusPageElement = (selection.focusNode instanceof Element
        ? selection.focusNode
        : selection.focusNode?.parentElement)?.closest("[id^='pdf-page-']");
      const focusPage = Number(focusPageElement?.id.replace("pdf-page-", "")) || pageNumber;
      const pageRect = pageElement.getBoundingClientRect();
      const scaleX = pageRect.width > 0 ? pageRect.width / currentWidth : 1;
      const scaleY = pageRect.height > 0 ? pageRect.height / currentHeight : 1;
      const rects: SelectionRect[] = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          x: (rect.left - pageRect.left) / scaleX,
          y: (rect.top - pageRect.top) / scaleY,
          width: rect.width / scaleX,
          height: rect.height / scaleY,
        }));
      onSelection({
        documentId: null,
        page: pageNumber,
        quote: selection.toString(),
        rects,
      }, focusPage);
    }, [currentHeight, currentWidth, onSelection, pageNumber]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting) {
            setIsVisible(true);
            onVisible();
          } else {
            setIsVisible(false);
          }
        },
        {
          root: pagesContainerRef?.current || null,
          rootMargin: "360px",
        }
      );
      observer.observe(container);

      return () => {
        observer.disconnect();
      };
    }, [pagesContainerRef, onVisible]);

    useEffect(() => {
      if (!isVisible) return;
      let isCurrent = true;
      let renderTask: any = null;

      const renderPage = async () => {
        try {
          const page = await pdfDoc.getPage(pageNumber);
          if (!isCurrent) return;

          const sizeViewport = page.getViewport({ scale: 1.0 });
          setPageSize({ width: sizeViewport.width, height: sizeViewport.height });

          const viewport = page.getViewport({ scale: renderScale });
          const canvas = canvasRef.current;
          const textLayerContainer = textLayerRef.current;
          const annotationLayerContainer = annotationLayerRef.current;
          if (!canvas || !textLayerContainer || !annotationLayerContainer) return;

          // pdf.js positions text spans using --scale-factor. Keep it in sync
          // with the viewport scale so selection geometry matches the canvas.
          textLayerContainer.style.setProperty("--scale-factor", String(renderScale));
          annotationLayerContainer.style.setProperty("--scale-factor", String(renderScale));

          // Stretch the stale bitmap to the new page size immediately, then
          // rasterize offscreen and swap in a single blit — during a zoom the
          // page shows a scaled (blurry) preview instead of going blank.
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          const dpr = getCanvasPixelRatio(window.devicePixelRatio || 1, viewport.width, viewport.height);
          const offscreen = window.document.createElement("canvas");
          offscreen.width = viewport.width * dpr;
          offscreen.height = viewport.height * dpr;
          const offscreenContext = offscreen.getContext("2d");
          if (!offscreenContext) return;
          offscreenContext.scale(dpr, dpr);

          renderTask = page.render({
            canvasContext: offscreenContext,
            viewport: viewport,
          });
          await renderTask.promise;
          if (!isCurrent) return;

          const context = canvas.getContext("2d");
          if (!context) return;
          canvas.width = offscreen.width;
          canvas.height = offscreen.height;
          context.drawImage(offscreen, 0, 0);
          offscreen.width = 0;
          offscreen.height = 0;

          if (isCurrent) {
            // Text Layer
            textLayerContainer.innerHTML = "";
            const textStream = page.streamTextContent();
            const textLayer = new pdfjs.TextLayer({
              textContentSource: textStream,
              container: textLayerContainer,
              viewport: viewport,
            });
            await textLayer.render();

            // Annotation Layer (Citations and links)
            if (isCurrent) {
              annotationLayerContainer.innerHTML = "";
              const annotations = await page.getAnnotations({ intent: "display" });
              if (!isCurrent) return;

              const linkService = {
                addLinkAttributes(link: any, url: string, newWindow: boolean) {
                  link.href = url;
                  if (newWindow) {
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                  }
                },
                getDestinationHash() {
                  return "#";
                },
                getAnchorUrl() {
                  return "#";
                },
                async goToDestination(destination: any) {
                  try {
                    let destRef = destination;
                    if (typeof destRef === "string") {
                      const explicitDest = await pdfDoc.getDestination(destRef);
                      if (explicitDest && explicitDest.length > 0) {
                        destRef = explicitDest[0];
                      }
                    } else if (Array.isArray(destRef)) {
                      destRef = destRef[0];
                    }
                    if (destRef && typeof destRef === "object" && destRef.num !== undefined) {
                      const pageIdx = await pdfDoc.getPageIndex(destRef);
                      const targetPageNo = pageIdx + 1;
                      const element = window.document.getElementById(`pdf-page-${targetPageNo}`);
                      if (element) {
                        element.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }
                  } catch (_) {}
                },
                executeNamedAction() {},
                executeSetOCGState() {},
              };

              const annotationLayer = new pdfjs.AnnotationLayer({
                div: annotationLayerContainer,
                accessibilityManager: null,
                annotationCanvasMap: null,
                annotationEditorUIManager: null,
                page: page,
                viewport: viewport,
                structTreeLayer: null,
              });
              await annotationLayer.render({
                viewport: viewport,
                div: annotationLayerContainer,
                annotations: annotations,
                page: page,
                linkService: linkService as any,
                renderForms: false,
              });
            }
          }
        } catch (_) {}
      };

      void renderPage();

      return () => {
        isCurrent = false;
        if (renderTask) {
          renderTask.cancel();
        }
      };
    }, [pdfDoc, pageNumber, renderScale, isVisible]);

    // Release the raster and DOM layers only once the page scrolls off-screen,
    // so zoom re-renders keep the previous bitmap visible until replaced.
    useEffect(() => {
      if (isVisible) return;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = "";
      }
      if (annotationLayerRef.current) {
        annotationLayerRef.current.innerHTML = "";
      }
    }, [isVisible]);

    const cssScale = 1 / renderScale;

    return (
      <div
        ref={containerRef}
        id={`pdf-page-${pageNumber}`}
        className="reader-pdf-page"
        style={{
          width: `${currentWidth}px`,
          height: `${currentHeight}px`,
          position: "relative",
          background: "#ffffff",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          margin: "0 auto 20px auto",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${currentWidth * renderScale}px`,
            height: `${currentHeight * renderScale}px`,
            transform: `scale(${cssScale})`,
            transformOrigin: "top left",
            display: isVisible ? "block" : "none",
          }}
        >
          <canvas ref={canvasRef} style={{ background: "#ffffff" }} />
          <div
            ref={textLayerRef}
            className="textLayer"
            onMouseUp={captureSelection}
            onTouchEnd={captureSelection}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: 1,
              lineHeight: 1,
            }}
          />
          <div
            ref={annotationLayerRef}
            className="annotationLayer"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
        </div>

        {!isVisible && (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#8e8e93",
              fontSize: "20px",
              position: "absolute",
              top: 0,
              left: 0,
              background: "#ffffff",
            }}
          >
            Page {pageNumber}
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.pdfDoc === nextProps.pdfDoc &&
      prevProps.pageNumber === nextProps.pageNumber &&
      prevProps.renderScale === nextProps.renderScale &&
      prevProps.defaultWidth === nextProps.defaultWidth &&
      prevProps.defaultHeight === nextProps.defaultHeight &&
      prevProps.pagesContainerRef === nextProps.pagesContainerRef
      && prevProps.onSelection === nextProps.onSelection
    );
  }
);

function OutlineNode({ node, onNavigate }: { node: any; onNavigate: (dest: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.items && node.items.length > 0;

  return (
    <div style={{ marginLeft: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 8px",
          borderRadius: "4px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => {
          if (node.dest) {
            onNavigate(node.dest);
          }
          if (hasChildren) {
            setExpanded(!expanded);
          }
        }}
        className="outline-node-title"
      >
        {hasChildren && (
          <span style={{ fontSize: "10px", width: "12px" }}>{expanded ? "▼" : "▶"}</span>
        )}
        <span style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.title}
        </span>
      </div>
      {hasChildren && expanded && (
        <div style={{ borderLeft: "1px solid #d1d1d6", marginLeft: "6px" }}>
          {node.items.map((subNode: any, idx: number) => (
            <OutlineNode key={idx} node={subNode} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ReaderPageProps {
  document: LibraryDocument;
  onBack: () => void;
  getDocumentFileUrl: (id: string) => Promise<string>;
  onPageChange: (id: string, page: number) => Promise<void>;
  onCreateCard?: (draft: CardSource) => void;
  composerSource?: CardSource | null;
  composerDecks?: CardComposerDeck[];
  composerError?: string | null;
  onSaveCard?: (input: CardSaveInput) => Promise<void>;
  onCloseComposer?: () => void;
}

export function ReaderPage({
  document,
  onBack,
  getDocumentFileUrl,
  onPageChange,
  onCreateCard,
  composerSource,
  composerDecks,
  composerError,
  onSaveCard,
  onCloseComposer,
}: ReaderPageProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(document.lastReadPage ?? 1);
  const [renderScale, setRenderScale] = useState(1);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultSize, setDefaultSize] = useState<{ width: number; height: number }>({ width: 600, height: 800 });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [searching, setSearching] = useState(false);

  const [sidebarTab, setSidebarTab] = useState<"pages" | "outline">("pages");
  const [outline, setOutline] = useState<any[] | null>(null);
  const [selection, setSelection] = useState<CardSource | null>(null);
  // Real per-page dimensions, fetched (metadata only, no rendering) once the
  // document loads. Without this, pages default to a single averaged size
  // until each one individually scrolls into view — so a jump to a distant
  // page reflows the stack mid-scroll as pages resize underneath the
  // in-flight scrollIntoView, landing on the wrong page.
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[] | null>(null);

  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  const zoomLayoutRef = useRef<HTMLDivElement | null>(null);
  const scalingDivRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLSpanElement | null>(null);
  const savePageTimeoutRef = useRef<any>(null);
  const scaleRef = useRef(1.0);
  const isZoomingRef = useRef(false);
  const zoomDebounceRef = useRef<any>(null);
  // Set while a programmatic scrollToPage animation is in flight. Pages
  // neighboring the target also enter the 360px IntersectionObserver margin
  // as the scroll passes them, and each fires onVisible — without this guard
  // whichever one fires last overwrites currentPage, so the highlighted
  // thumbnail can end up on a different page than the one that was clicked.
  const isNavigatingRef = useRef(false);
  const navigateSettleTimeoutRef = useRef<any>(null);

  const debouncedSavePage = useCallback((pageNo: number) => {
    if (savePageTimeoutRef.current) {
      clearTimeout(savePageTimeoutRef.current);
    }
    const delay = import.meta.env.MODE === "test" ? 0 : 1000;
    savePageTimeoutRef.current = setTimeout(() => {
      void onPageChange(document.id, pageNo);
    }, delay);
  }, [document.id, onPageChange]);

  useEffect(() => {
    return () => {
      if (savePageTimeoutRef.current) {
        clearTimeout(savePageTimeoutRef.current);
      }
      if (zoomDebounceRef.current) {
        clearTimeout(zoomDebounceRef.current);
      }
      if (navigateSettleTimeoutRef.current) {
        clearTimeout(navigateSettleTimeoutRef.current);
      }
    };
  }, []);

  // Sum of each page's real height (once known) instead of an assumed
  // uniform average, so the scrollable stack's total size matches reality
  // before any individual page has rendered.
  const stackContentSize = useMemo(() => {
    if (pageSizes && pageSizes.length > 0) {
      return {
        width: Math.max(...pageSizes.map((s) => s.width)),
        height: pageSizes.reduce((sum, s) => sum + s.height + 20, 0),
      };
    }
    return {
      width: defaultSize.width,
      height: (pdfDoc?.numPages ?? 0) * (defaultSize.height + 20),
    };
  }, [pageSizes, defaultSize, pdfDoc]);

  // Keep the transformed visual surface and the scroll layout in the same coordinate system.
  const applyScaleToDOM = useCallback((scale = scaleRef.current) => {
    const baseWidth = stackContentSize.width + 48;
    const baseHeight = stackContentSize.height + 48;

    if (zoomLayoutRef.current) {
      zoomLayoutRef.current.style.width = `${baseWidth * scale}px`;
      zoomLayoutRef.current.style.height = `${baseHeight * scale}px`;
    }
    if (scalingDivRef.current) {
      scalingDivRef.current.style.transform = `scale(${scale})`;
      const viewportWidth = pagesContainerRef.current?.clientWidth ?? 0;
      scalingDivRef.current.style.left = `${getCenteredPageOffset(viewportWidth, baseWidth * scale)}px`;
    }
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(scale * 100)}%`;
    }
  }, [stackContentSize]);

  useEffect(() => {
    const container = pagesContainerRef.current;
    if (!container) return;

    const updatePageStackPosition = () => {
      if (!scalingDivRef.current) return;
      const baseWidth = stackContentSize.width + 48;
      const contentWidth = baseWidth * scaleRef.current;
      scalingDivRef.current.style.left = `${getCenteredPageOffset(container.clientWidth, contentWidth)}px`;
    };

    updatePageStackPosition();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePageStackPosition) : null;
    observer?.observe(container);
    window.addEventListener("resize", updatePageStackPosition);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePageStackPosition);
    };
  }, [stackContentSize]);

  // Debounce renderScale: only re-render canvases after zoom gesture ends
  const scheduleRenderScaleSync = useCallback((newScale: number) => {
    if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    zoomDebounceRef.current = setTimeout(() => {
      setRenderScale(newScale);
      isZoomingRef.current = false;
    }, 300);
  }, []);

  const zoomAtViewportPoint = useCallback((requestedScale: number, pointerX: number, pointerY: number) => {
    const container = pagesContainerRef.current;
    const previousScale = scaleRef.current;
    const nextScale = clampZoomScale(requestedScale);
    if (!container || nextScale === previousScale) {
      isZoomingRef.current = false;
      return;
    }

    const nextScrollPosition = getZoomAnchorScrollPosition({
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      pointerX,
      pointerY,
      previousScale,
      nextScale,
    });

    isZoomingRef.current = true;
    scaleRef.current = nextScale;
    applyScaleToDOM(nextScale);
    container.scrollLeft = nextScrollPosition.scrollLeft;
    container.scrollTop = nextScrollPosition.scrollTop;
    scheduleRenderScaleSync(nextScale);
  }, [applyScaleToDOM, scheduleRenderScaleSync]);

  useEffect(() => {
    let active = true;
    const loadFileAndDoc = async () => {
      setLoadingDoc(true);
      setError(null);
      setPageSizes(null);
      try {
        const url = await getDocumentFileUrl(document.id);
        if (!active) return;
        const assetUrl = convertFileSrc(url);
        const loadingTask = pdfjs.getDocument({ url: assetUrl, enableHWA: true });
        const doc = await loadingTask.promise;
        if (active) {
          setPdfDoc(doc);
          setLoadingDoc(false);

          try {
            const pageForSize = doc.numPages > 1 ? await doc.getPage(2) : await doc.getPage(1);
            const defaultViewport = pageForSize.getViewport({ scale: 1.0 });
            setDefaultSize({ width: defaultViewport.width, height: defaultViewport.height });
          } catch (_) {
            try {
              const firstPage = await doc.getPage(1);
              const defaultViewport = firstPage.getViewport({ scale: 1.0 });
              setDefaultSize({ width: defaultViewport.width, height: defaultViewport.height });
            } catch (_) {}
          }

          try {
            const rawOutline = await doc.getOutline();
            if (rawOutline && rawOutline.length > 0) {
              setOutline(rawOutline);
              setSidebarTab("outline");
            }
          } catch (_) {}

          try {
            // Metadata only (no rendering) — needed up front so the page
            // stack's layout is correct from the start, before individual
            // pages have scrolled into view and rendered.
            const sizes = await Promise.all(
              Array.from({ length: doc.numPages }, (_, i) =>
                doc.getPage(i + 1).then((page) => {
                  const viewport = page.getViewport({ scale: 1.0 });
                  return { width: viewport.width, height: viewport.height };
                })
              )
            );
            if (active) setPageSizes(sizes);
          } catch (_) {}
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
          setLoadingDoc(false);
        }
      }
    };
    void loadFileAndDoc();
    return () => {
      active = false;
    };
  }, [document.id, getDocumentFileUrl]);

  const scrollToPage = useCallback((pageNo: number) => {
    const element = window.document.getElementById(`pdf-page-${pageNo}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handlePageSelect = (pageNo: number) => {
    isNavigatingRef.current = true;
    if (navigateSettleTimeoutRef.current) {
      clearTimeout(navigateSettleTimeoutRef.current);
    }
    // Long enough to cover the smooth-scroll animation across the whole
    // document; onVisible stays suppressed until then so pages the scroll
    // passes through can't steal currentPage from the clicked target.
    navigateSettleTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
    }, 700);

    setCurrentPage(pageNo);
    debouncedSavePage(pageNo);
    scrollToPage(pageNo);
  };

  const handleSelection = useCallback((source: CardSource, focusPage: number) => {
    const draft = selectionDraft({ ...source, documentId: document.id }, focusPage);
    if (draft) setSelection(draft);
  }, [document.id]);

  const handleOutlineNavigate = async (destination: any) => {
    if (!pdfDoc) return;
    try {
      let destRef = destination;
      if (typeof destRef === "string") {
        const explicitDest = await pdfDoc.getDestination(destRef);
        if (explicitDest && explicitDest.length > 0) {
          destRef = explicitDest[0];
        }
      } else if (Array.isArray(destRef)) {
        destRef = destRef[0];
      }
      if (destRef && typeof destRef === "object" && destRef.num !== undefined) {
        const pageIdx = await pdfDoc.getPageIndex(destRef);
        const targetPageNo = pageIdx + 1;
        handlePageSelect(targetPageNo);
      }
    } catch (_) {}
  };

  // Pinch to zoom or Ctrl+wheel zoom — zero React re-renders, pure DOM manipulation
  useEffect(() => {
    const container = pagesContainerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();

        const factor = 0.05;
        const containerRect = container.getBoundingClientRect();
        zoomAtViewportPoint(
          scaleRef.current + (e.deltaY < 0 ? factor : -factor),
          e.clientX - containerRect.left,
          e.clientY - containerRect.top,
        );
      }
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, [pdfDoc, zoomAtViewportPoint]);

  // Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfDoc || !searchQuery) return;
    setSearching(true);
    const results: number[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => item.str).join(" ");
      if (text.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.push(i);
      }
    }
    setSearchResults(results);
    setSearching(false);
    if (results.length > 0) {
      setSearchIndex(0);
      handlePageSelect(results[0]);
    } else {
      setSearchIndex(-1);
    }
  };

  const handleNextSearchResult = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (searchIndex + 1) % searchResults.length;
    setSearchIndex(nextIdx);
    handlePageSelect(searchResults[nextIdx]);
  };

  if (loadingDoc) {
    return (
      <main className="reader-loading" style={{ padding: "32px", textAlign: "center" }}>
        <div role="status" aria-label="Loading document">Loading document...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="reader-error" style={{ padding: "32px", textAlign: "center" }}>
        <div role="alert">
          <p>{error === "reconnect_required" ? "Google Drive connection lost. Please reconnect." : `Failed to load document: ${error}`}</p>
          <button type="button" onClick={onBack}>Back to Library</button>
        </div>
      </main>
    );
  }

  const pagesArray = Array.from({ length: pdfDoc?.numPages ?? 0 }, (_, i) => i + 1);

  return (
    <main className="reader-page" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        className="reader-sidebar"
        style={{
          width: "260px",
          borderRight: "1px solid #e5e5ea",
          display: "flex",
          flexDirection: "column",
          background: "#f5f5f7",
        }}
      >
        {/* Tab switcher */}
        <div className="reader-sidebar__tabs">
          <button
            type="button"
            className={`reader-sidebar__tab ${sidebarTab === "pages" ? "is-active" : ""}`}
            onClick={() => setSidebarTab("pages")}
          >
            Pages
          </button>
          {outline && (
            <button
            type="button"
            className={`reader-sidebar__tab ${sidebarTab === "outline" ? "is-active" : ""}`}
            onClick={() => setSidebarTab("outline")}
            >
              Outline
            </button>
          )}
        </div>

        {/* Content */}
        <div className="reader-sidebar__content">
          {sidebarTab === "pages" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {pagesArray.map((pageNumber) => (
                <ThumbnailPage
                  key={pageNumber}
                  pdfDoc={pdfDoc!}
                  pageNumber={pageNumber}
                  active={currentPage === pageNumber}
                  onClick={() => handlePageSelect(pageNumber)}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {outline?.map((node, idx) => (
                <OutlineNode key={idx} node={node} onNavigate={handleOutlineNavigate} />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main View Area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "#f5f5f7" }}>
      <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Toolbar */}
        <header
          className="reader-toolbar"
          style={{
            height: "52px",
            borderBottom: "1px solid #e5e5ea",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
          }}
        >
          <button
            type="button"
            className="reader-icon-button reader-icon-button--back"
            aria-label="Back to Library"
            title="Back to Library"
            onClick={onBack}
          >
            ‹
          </button>

          <h1 className="reader-toolbar__title">{document.title}</h1>

          <div className="reader-toolbar__group reader-toolbar__group--page">
            <button
              type="button"
              className="reader-icon-button"
              aria-label="Previous page"
              title="Previous page"
              disabled={currentPage <= 1}
              onClick={() => handlePageSelect(currentPage - 1)}
            >
              ‹
            </button>
            <span className="reader-page-indicator">
              Page {currentPage} of {pdfDoc?.numPages}
            </span>
            <button
              type="button"
              className="reader-icon-button"
              aria-label="Next page"
              title="Next page"
              disabled={currentPage >= (pdfDoc?.numPages ?? 1)}
              onClick={() => handlePageSelect(currentPage + 1)}
            >
              ›
            </button>
          </div>

          <div className="reader-toolbar__group">
            <button
              type="button"
              className="reader-icon-button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => {
                const container = pagesContainerRef.current;
                if (!container) return;
                zoomAtViewportPoint(
                  scaleRef.current - 0.1,
                  container.clientWidth / 2,
                  container.clientHeight / 2,
                );
              }}
            >
              −
            </button>
            <span ref={zoomLabelRef} className="reader-zoom-label">
              100%
            </span>
            <button
              type="button"
              className="reader-icon-button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => {
                const container = pagesContainerRef.current;
                if (!container) return;
                zoomAtViewportPoint(
                  scaleRef.current + 0.1,
                  container.clientWidth / 2,
                  container.clientHeight / 2,
                );
              }}
            >
              +
            </button>
          </div>

          {/* Search box */}
          <form className="reader-search" onSubmit={(e) => void handleSearch(e)}>
            <input
              type="search"
              className="reader-search__input"
              placeholder="Search in PDF..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchResults.length > 0 && (
              <div className="reader-search__results">
                <span>
                  {searchIndex + 1}/{searchResults.length}
                </span>
                <button
                  type="button"
                  className="reader-icon-button"
                  aria-label="Next search match"
                  onClick={handleNextSearchResult}
                >
                  Next Match
                </button>
              </div>
            )}
            {searching && <span className="reader-search__results">Searching...</span>}
          </form>
        </header>

        {/* Scrollable pages container */}
        <div
          ref={pagesContainerRef}
          className="reader-canvas-container"
          style={{
            flex: 1,
            overflow: "auto",
            background: "#8e8e93",
          }}
        >
          <div
            ref={zoomLayoutRef}
            className="reader-page-stack"
            style={{
              width: `${(stackContentSize.width + 48) * scaleRef.current}px`,
              height: `${(stackContentSize.height + 48) * scaleRef.current}px`,
              position: "relative",
            }}
          >
            <div
            ref={scalingDivRef}
            className="reader-page-column"
            style={{
              width: `${stackContentSize.width + 48}px`,
              height: `${stackContentSize.height + 48}px`,
              padding: "24px",
              boxSizing: "border-box",
              position: "absolute",
              top: 0,
              left: 0,
              transform: `scale(${scaleRef.current})`,
              transformOrigin: "top left",
              willChange: "transform",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {pagesArray.map((pageNumber) => (
              <PdfPage
                key={pageNumber}
                pdfDoc={pdfDoc!}
                pageNumber={pageNumber}
                renderScale={renderScale}
                defaultWidth={pageSizes?.[pageNumber - 1]?.width ?? defaultSize.width}
                defaultHeight={pageSizes?.[pageNumber - 1]?.height ?? defaultSize.height}
                pagesContainerRef={pagesContainerRef}
                onVisible={() => {
                  if (!isZoomingRef.current && !isNavigatingRef.current) {
                    setCurrentPage(pageNumber);
                    debouncedSavePage(pageNumber);
                  }
                }}
                onSelection={handleSelection}
              />
            ))}
            </div>
          </div>
        </div>
        {selection && onCreateCard ? (
          <div style={{ position: "fixed", left: "50%", bottom: "24px", zIndex: 10, transform: "translateX(-50%)" }}>
            <CardSelectionToolbar
              quote={selection.quote}
              onDismiss={() => {
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              }}
              onCreate={() => {
                onCreateCard(selection);
                setSelection(null);
                const savedRange = lastSelectionRange;
                if (savedRange) {
                  requestAnimationFrame(() => {
                    const sel = window.getSelection();
                    if (sel) {
                      sel.removeAllRanges();
                      sel.addRange(savedRange);
                    }
                  });
                }
              }}
            />
          </div>
        ) : null}
      </section>
      {composerSource && onSaveCard && onCloseComposer ? (
        <CardComposer
          draft={composerSource}
          decks={composerDecks ?? []}
          onCancel={onCloseComposer}
          onSave={onSaveCard}
          variant="panel"
          externalError={composerError}
        />
      ) : null}
      </div>
    </main>
  );
}
