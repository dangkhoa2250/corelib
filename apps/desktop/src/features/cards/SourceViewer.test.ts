import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("opens the saved source page before showing search results from the whole document", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain("eventBus.on(\"pagesloaded\"");
  expect(viewer).toContain('name: "XYZ"');
  expect(viewer).toContain("matches.findIndex((m) => m.pageIndex + 1 === source.page)");
});

test("marks highlights on the saved source page separately", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");
  const css = readFileSync(join(currentDir, "cards.css"), "utf8");

  expect(viewer).toContain("source-viewer__highlight--source");
  expect(css).toContain(".source-viewer__highlight--source,");
  expect(css).toContain("--color-highlight-source");
});

test("anchors the viewer at the start of the saved page and uses saved selection rectangles", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain("pdfViewer.scrollPageIntoView({");
  expect(viewer).toContain("source.rects.map((rect)");
  expect(viewer).toContain("(100 * rect.x) / viewport.width");
  expect(viewer).toContain("source-viewer__highlight--saved");
  expect(viewer).toContain("savedHighlightElsRef.current.forEach((el) => el.remove());");
  expect(viewer).toContain("void renderSavedSourceHighlights();");
  expect(viewer).not.toContain("savedHighlightElsRef.current.length > 0");
});

test("keeps whole-page fit for the non-modal source viewer", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain('presentation === "modal" ? "1.5" : "page-fit"');
  expect(viewer).toContain('presentation === "modal"');
  expect(viewer).not.toContain("pdfViewer.currentScale = pdfViewer.currentScale *");
});

test("limits concurrent PDF text extraction while searching the full source", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain("SOURCE_SEARCH_CONCURRENCY");
  expect(viewer).toContain("const workers = Array.from");
  expect(viewer).not.toContain("const perPage = await Promise.all");
});

test("locks the initial viewport to the saved page top before searching the rest of the document", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8").replace(/\r\n?/g, "\n");

  expect(viewer).toContain("container.scrollTop = pageDiv.offsetTop;");
  expect(viewer).toContain("const startDocumentSearch = () => {");
  expect(viewer).toContain("hasInitialAnchor = true;\n            startDocumentSearch();");
});

test("caches completed full-document searches for the same PDF and quote", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain("const completedSearchCache = new Map<string, TextMatch[]>();");
  expect(viewer).toContain("const searchCacheKey = `${source.documentId}:${searchQuery}`;");
  expect(viewer).toContain("completedSearchCache.set(searchCacheKey, matches);");
});

test("supports panel and modal presentation without duplicating modal chrome", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain('presentation = "panel"');
  expect(viewer).toContain("source-viewer--${presentation}");
  expect(viewer).toContain('presentation === "panel"');
  expect(viewer).toContain('className="source-viewer__pdf-content"');
});

test("uses a fixed 1.5x PDF scale for modal presentation while the panel keeps whole-page fit", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain('presentation === "modal" ? "1.5" : "page-fit"');
});

test("reapplies the presentation-aware scale when the source viewer is resized", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");
  const resizeObserver = viewer.match(/const resizeObserver = new ResizeObserver\(\(\) => \{([\s\S]*?)\n        \}\);/)?.[1] ?? "";

  expect(resizeObserver).toContain("setSourceFitScale");
  expect(resizeObserver).toContain("presentation");
});
