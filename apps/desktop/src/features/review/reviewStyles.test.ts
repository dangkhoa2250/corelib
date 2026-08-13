import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

test("moves lowered review states down responsively", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(readFileSync(join(currentDir, "review.css"), "utf8"));
  const lowered = css.match(/\.review-page--lowered \.review-page__done-content \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(lowered).toContain("transform: translateY(clamp(32px, 6vh, 64px));");
});

test("anchors the review route and source split to the viewport height", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = [
    normalizeNewlines(readFileSync(join(currentDir, "../../styles/base.css"), "utf8")),
    normalizeNewlines(readFileSync(join(currentDir, "review.css"), "utf8")),
  ].join("\n");
  const root = css.match(/html,\nbody,\n#root \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const reviewPage = css.match(/\.review-page \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const reviewSplit = css.match(/\.review-page__split \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(root).toMatch(/^  height: 100%;$/m);
  expect(reviewPage).toContain("height: 100vh;");
  expect(reviewPage).toContain("overflow: hidden;");
  expect(reviewPage).toContain("padding: 24px 24px 0 24px;");
  expect(reviewSplit).toContain("height: 100%;");
});

test("sizes review media modals by content and keeps them inside the viewport", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(readFileSync(join(currentDir, "review.css"), "utf8"));
  const backdrop = css.match(/\.review-media-modal__backdrop \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const pdf = css.match(/\.review-media-modal__dialog--pdf \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const video = css.match(/\.review-media-modal__dialog--video \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(backdrop).toContain("position: fixed;");
  expect(backdrop).toContain("inset: 0;");
  expect(pdf).toContain("width: min(1200px, calc(100vw - 48px));");
  expect(pdf).toContain("height: calc(100vh - 48px);");
  expect(video).toContain("width: min(916px, calc(100vw - 48px));");
  expect(video).toContain("max-height: calc(100vh - 48px);");
});

test("keeps the review PDF on ScrollArea with thumb-side content inset", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const cardsCss = normalizeNewlines(readFileSync(join(currentDir, "../cards/cards.css"), "utf8"));
  const sourceViewer = normalizeNewlines(readFileSync(join(currentDir, "../cards/SourceViewer.tsx"), "utf8"));
  const container = cardsCss.match(/\.source-viewer__pdf-container \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const content = cardsCss.match(/\.source-viewer__pdf-content \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(sourceViewer).toContain("<ScrollArea");
  expect(sourceViewer).toContain('className="source-viewer__pdf-content"');
  expect(container).not.toContain("overflow: auto;");
  expect(content).toContain("padding-right: 20px;");
});

test("removes nonessential review media motion for reduced-motion users", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(readFileSync(join(currentDir, "review.css"), "utf8"));
  const media = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(media).toContain(".review-media-modal__backdrop");
  expect(media).toContain("animation: none;");
  expect(media).toContain("transition: none;");
});

test("uses compact review rating controls", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(readFileSync(join(currentDir, "review.css"), "utf8"));
  const ratings = css.match(/\.review-page__ratings \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const ratingButton = css.match(/\.review-page__rating-btn \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(ratings).toContain("gap: 8px;");
  expect(ratingButton).toContain("gap: 2px;");
  expect(ratingButton).toContain("padding: 8px 6px;");
  expect(ratingButton).toContain("border-radius: 10px;");
});
