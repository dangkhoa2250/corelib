import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("moves lowered review states down responsively", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "review.css"), "utf8");
  const lowered = css.match(/\.review-page--lowered \.review-page__done-content \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(lowered).toContain("transform: translateY(clamp(32px, 6vh, 64px));");
});

test("anchors the review route and source split to the viewport height", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = [
    readFileSync(join(currentDir, "../../styles/base.css"), "utf8"),
    readFileSync(join(currentDir, "review.css"), "utf8"),
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

test("keeps the flashcard compact while the source panel can fill the viewport", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "review.css"), "utf8");
  const card = css.match(/\.review-page__card \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const sourcePanel = css.match(/\.review-page__split > \.source-viewer \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(card).toContain("flex: 0 0 min(440px, calc(100vh - 180px));");
  expect(card).toContain("height: min(440px, calc(100vh - 180px));");
  expect(sourcePanel).toContain("align-self: stretch;");
  expect(sourcePanel).not.toContain("margin-bottom");
});

test("splits the review and source panes evenly", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "review.css"), "utf8");
  const reviewPane = css.match(/\.review-page__split--with-source \.review-page__body \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const sourcePane = css.match(/\.review-page__split--with-source > \.source-viewer \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(reviewPane).toContain("flex: 1 1 0;");
  expect(reviewPane).not.toContain("max-width");
  expect(sourcePane).toContain("flex: 1 1 0;");
});

test("keeps the flashcard geometry stable while a video is open", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "review.css"), "utf8");
  const videoCard = css.match(/\.review-page__body--with-video \.review-page__card \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(videoCard).toBe("");
  const reviewBody = css.match(/\.review-page__body \{([\s\S]*?)\n\}/)?.[1] ?? "";
  expect(reviewBody).toContain("padding-right: 20px;");

  const cardFace = css.match(/\.review-page__card-face-scroll \{([\s\S]*?)\n\}/)?.[1] ?? "";
  expect(cardFace).toContain("padding-right: 20px;");
  expect(cardFace).not.toContain("overflow-y: auto;");
});

test("uses compact review rating controls", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "review.css"), "utf8");
  const ratings = css.match(/\.review-page__ratings \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const ratingButton = css.match(/\.review-page__rating-btn \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(ratings).toContain("gap: 8px;");
  expect(ratingButton).toContain("gap: 2px;");
  expect(ratingButton).toContain("padding: 8px 6px;");
  expect(ratingButton).toContain("border-radius: 10px;");
});
