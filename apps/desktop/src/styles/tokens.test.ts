import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("does not apply global color transitions to every element", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");

  expect(css).not.toContain("transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;");
});

test("moves lowered review states down responsively", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const lowered = css.match(/\.review-page--lowered \.review-page__done-content \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(lowered).toContain("transform: translateY(clamp(32px, 6vh, 64px));");
});

test("uses a dark-theme-safe compact surface for the import trigger", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const trigger = css.match(/\.library-import-menu__trigger \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(trigger).toContain("border: 1px solid var(--border-strong);");
  expect(trigger).toContain("border-radius: 8px;");
  expect(trigger).toContain("padding: 8px 10px;");
  expect(trigger).toContain("color: var(--text-primary);");
  expect(trigger).toContain("background: var(--surface-1);");
  expect(trigger).not.toContain("--button-primary");
  expect(css).toContain(".library-import-menu__trigger:hover:not(:disabled) {");
});

test("keeps the native window transparent for the sidebar glass surface", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(readFileSync(join(currentDir, "../../src-tauri/tauri.conf.json"), "utf8"));

  expect(config.app.windows[0].transparent).toBe(true);
});

test("uses a tinted glass fallback instead of a fully transparent sidebar", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const sidebar = css.match(/\.app-sidebar \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(css).toMatch(/--sidebar-bg:\s*rgb\([^)]*\/\s*\d+%\);/);
  expect(sidebar).toContain("background: var(--sidebar-bg);");
  expect(sidebar).toContain("backdrop-filter: blur(24px) saturate(1.15);");
  expect(sidebar).toContain("-webkit-backdrop-filter: blur(24px) saturate(1.15);");
});

test("uses one transparent-track scrollbar primitive across the app", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");

  expect(css).toContain("--scrollbar-track: transparent;");
  expect(css).toContain("--scrollbar-thumb:");
  expect(css).toContain(":where(*) {\n  scrollbar-width: thin;\n  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);");
  expect(css).toContain(":where(*)::-webkit-scrollbar-track {\n  background: var(--scrollbar-track);");
  expect(css).toContain(":where(*)::-webkit-scrollbar-track-piece {\n  background: var(--scrollbar-track);");
  expect(css).toContain(":where(*)::-webkit-scrollbar-thumb {");
  expect(css).not.toContain("scrollbar-width: none;");
  expect(css).not.toContain("scrollbar-color: var(--border-subtle) transparent;");
});

test("uses semantic tokens in Statistics CSS with proper scroll-surface padding", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = readFileSync(join(currentDir, "../features/statistics/statistics.css"), "utf8");

  const shellContent = statCss.match(/\.statistics-shell__content\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(shellContent).toContain("padding: 28px 20px 40px 28px;");
  expect(statCss).not.toContain("overflow: auto;");
  expect(statCss).not.toMatch(/#[0-9a-fA-F]{3,6};/);
});

test("uses only public macOS view APIs to enable overlay scrollers", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const nativeApp = readFileSync(join(currentDir, "../../src-tauri/src/lib.rs"), "utf8");
  const manifest = readFileSync(join(currentDir, "../../src-tauri/Cargo.toml"), "utf8");

  expect(nativeApp).toContain("configure_macos_overlay_scrollers(&window);");
  expect(nativeApp).toContain("setScrollerStyle(NSScrollerStyle::Overlay)");
  expect(nativeApp).toContain("subviews()");
  expect(nativeApp).not.toContain("_scrollView");
  expect(manifest).toContain('objc2-app-kit = { version = "0.3", features = ["NSView", "NSScrollView", "NSScroller"] }');
});

test("anchors the review route and source split to the viewport height", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
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
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const card = css.match(/\.review-page__card \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const sourcePanel = css.match(/\.review-page__split > \.source-viewer \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(card).toContain("flex: 0 0 min(440px, calc(100vh - 180px));");
  expect(card).toContain("height: min(440px, calc(100vh - 180px));");
  expect(sourcePanel).toContain("align-self: stretch;");
  expect(sourcePanel).not.toContain("margin-bottom");
});

test("splits the review and source panes evenly", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const reviewPane = css.match(/\.review-page__split--with-source \.review-page__body \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const sourcePane = css.match(/\.review-page__split--with-source > \.source-viewer \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(reviewPane).toContain("flex: 1 1 0;");
  expect(reviewPane).not.toContain("max-width");
  expect(sourcePane).toContain("flex: 1 1 0;");
});

test("keeps the flashcard geometry stable while a video is open", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
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
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const ratings = css.match(/\.review-page__ratings \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const ratingButton = css.match(/\.review-page__rating-btn \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(ratings).toContain("gap: 8px;");
  expect(ratingButton).toContain("gap: 2px;");
  expect(ratingButton).toContain("padding: 8px 6px;");
  expect(ratingButton).toContain("border-radius: 10px;");
});

test("uses the reusable ScrollArea for the reader's thumbnail and PDF panes", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const reader = readFileSync(join(currentDir, "../features/reader/ReaderPage.tsx"), "utf8");

  expect(reader).toContain('import { ScrollArea } from "../../components/ScrollArea";');
  expect(reader.match(/<ScrollArea/g)?.length).toBeGreaterThanOrEqual(2);
});

test("uses neutral palette-specific scrollbars and match highlights", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const paletteStart = css.indexOf(".command-palette__backdrop");
  const paletteEnd = css.indexOf("@media", paletteStart);
  const paletteCss = css.slice(paletteStart, paletteEnd);

  const paletteInput = paletteCss.match(/\.command-palette__input \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const resultList = paletteCss.match(/\.command-palette__result-list \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(paletteInput).toContain("border: 0;");
  expect(paletteInput).not.toContain("border-bottom");
  expect(paletteInput).toContain("-webkit-appearance: none;");
  expect(paletteInput).toContain("box-shadow: none;");
  expect(paletteCss).not.toContain(".command-palette__results button::before");
  expect(paletteCss).not.toContain(".command-palette__results::-webkit-scrollbar");
  expect(resultList).toContain("padding: 6px 20px 6px 6px;");
  expect(paletteCss).toContain(".command-palette__match {");
  expect(paletteCss).toContain("background: transparent;");
  expect(paletteCss).toContain("color: var(--text-primary);");
  expect(paletteCss).toContain("background: var(--interactive-selected);");
  expect(paletteCss).not.toContain("#0e9df4");
});
