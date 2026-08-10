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
  const css = readFileSync(join(currentDir, "../../styles/tokens.css"), "utf8");

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

test("fits the complete source page within the available viewer display", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain('currentScaleValue = "page-fit"');
  expect(viewer).not.toContain('currentScaleValue = "page-width"');
  expect(viewer).not.toContain("SOURCE_PAGE_FIT_SCALE");
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
