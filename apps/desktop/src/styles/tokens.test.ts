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

test("uses a semantic flat hover surface for shared comboboxes", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const hover = css.match(/\.combobox__trigger:hover\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(hover).toContain("background: var(--interactive-hover);");
  expect(hover).not.toMatch(/gradient|#[0-9a-fA-F]{3,8}\b/);
});

test("keeps disabled Statistics and shared combobox controls on their normal surfaces", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const tokensCss = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const statisticsCss = readFileSync(join(currentDir, "../features/statistics/statistics.css"), "utf8");
  const comboboxDisabledHover = tokensCss.match(/\.combobox__trigger:disabled:hover\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const statisticsDisabled = statisticsCss.match(/\.statistics-control:disabled,\s*\.statistics-control:disabled:hover,\s*\.statistics-control:disabled\[aria-pressed="true"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(comboboxDisabledHover).toContain("background: var(--surface-1);");
  expect(comboboxDisabledHover).toContain("border-color: var(--border-strong);");
  expect(statisticsDisabled).toContain("background: var(--surface-1);");
  expect(statisticsDisabled).toContain("color: var(--text-disabled);");
  expect(statisticsDisabled).toContain("cursor: not-allowed;");
});

test("defines the Statistics sparkline accent through a semantic warning token", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statisticsCss = readFileSync(join(currentDir, "../features/statistics/statistics.css"), "utf8");
  const sparkline = readFileSync(join(currentDir, "../features/statistics/components/MiniSparkline.tsx"), "utf8");

  expect(statisticsCss).toMatch(/\.statistics-shell\s*\{[\s\S]*?--statistics-accent:\s*var\(--warning\);/);
  expect(sparkline).toContain('stroke="var(--statistics-accent)"');
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
  const desktopCss = statCss.slice(0, statCss.indexOf("@media"));

  const shellContent = desktopCss.match(/\.statistics-shell__content\s*\{([^}]*)\}/)?.[1] ?? "";
  const decreaseComparison = desktopCss.match(/\.statistics-kpi-card__comparison\[data-kind="decrease"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  const kpiCard = desktopCss.match(/\.statistics-kpi-card\s*\{([^}]*)\}/)?.[1] ?? "";
  const section = desktopCss.match(/\.statistics-section \{\n  padding: 22px;\n  border-radius: 16px;\n\}/)?.[0] ?? "";
  const appCard = desktopCss.match(/\.statistics-app-card\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(shellContent).toContain("padding: 28px 20px 38px 28px;");
  expect(kpiCard).toContain("min-height: 156px;");
  expect(section).toContain("padding: 22px;");
  expect(section).toContain("border-radius: 16px;");
  expect(appCard).toContain("padding: 20px;");
  expect(appCard).toContain("border-radius: 14px;");
  expect(decreaseComparison).toContain("color: var(--text-secondary);");
  expect(decreaseComparison).not.toContain("var(--error)");
  expect(statCss).not.toContain("overflow: auto;");
  expect(statCss).not.toMatch(/#[0-9a-fA-F]{3,6};/);
});

test("keeps the statistics dashboard flat, responsive, and token-correct", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = readFileSync(join(currentDir, "../features/statistics/statistics.css"), "utf8");
  const kpiGrid = statCss.match(/\.statistics-kpi-grid\s*\{([^}]*)\}/)?.[1] ?? "";
  const appGrid = statCss.match(/\.statistics-app-grid\s*\{([^}]*)\}/)?.[1] ?? "";
  const emptyCell = statCss.match(/\.statistics-heatmap__cell\s*\{([^}]*)\}/)?.[1] ?? "";
  const yearHeatmap = statCss.match(/\.statistics-heatmap-wrapper--year\s*\{([^}]*)\}/)?.[1] ?? "";
  const yearCells = statCss.match(/\.statistics-heatmap-wrapper--year \.statistics-heatmap__cell\s*\{([^}]*)\}/)?.[1] ?? "";

  expect(statCss).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
  expect(statCss).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/);
  expect(statCss).not.toContain("width: max-content");
  expect(statCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(kpiGrid).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
  expect(appGrid).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
  expect(emptyCell).toContain("background: var(--surface-3);");
  expect(yearHeatmap).toContain("--heatmap-gap: 1px;");
  expect(yearHeatmap).toContain("--heatmap-row-height: 17px;");
  expect(yearCells).toContain("border-radius: 2px;");
  expect(statCss).toContain("color: var(--text-primary);");
  expect(statCss).toContain("color: var(--text-secondary);");
  expect(statCss).toContain("color: var(--success);");
  expect(statCss).toContain("outline: 2px solid var(--focus-ring);");
  expect(statCss).toContain("@media (max-width: 900px)");
  expect(statCss).toContain("@media (max-width: 720px)");
  expect(statCss).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.statistics-kpi-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-kpi-grid,\s*\.statistics-app-grid \{ grid-template-columns: minmax\(0, 1fr\);/);
  expect(statCss).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.statistics-shell__content \{ padding: 26px 20px 36px 24px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.statistics-kpi-card \{ min-height: 146px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.statistics-section \{ padding: 20px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-shell__content \{ padding: 22px 20px 34px 18px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-control \{ min-height: 36px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-kpi-card \{ min-height: 148px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-section \{ padding: 18px;/);
  expect(statCss).not.toContain(".statistics-color-picker");
});

test("keeps non-interactive Statistics insight cards free of clickable affordances", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = readFileSync(join(currentDir, "../features/statistics/statistics.css"), "utf8");

  expect(statCss).not.toContain(".statistics-app-card:not(:disabled)");
  expect(statCss).not.toContain(".statistics-app-card:disabled");
  expect(statCss).toContain(".statistics-app-card__open:hover");
  expect(statCss).toContain(".statistics-app-card__open:focus-visible");
});

test("keeps the calendar time heatmap inside its card without horizontal scrolling", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = readFileSync(join(currentDir, "../features/statistics/statistics.css"), "utf8");
  const heatmap = readFileSync(join(currentDir, "../features/statistics/components/ActivityHeatmap.tsx"), "utf8");

  expect(heatmap).not.toContain("ScrollArea");
  expect(heatmap).not.toContain("overflow-x");
  expect(heatmap).not.toContain("max-content");
  expect(statCss).not.toContain("statistics-heatmap-scroll");
  expect(statCss).not.toContain("max-content");
  expect(statCss).not.toContain("overflow-x");
  expect(statCss).toContain("repeat(var(--column-count), minmax(0, 1fr))");
  const yAxis = statCss.match(/\.statistics-heatmap__y-axis\s*\{([^}]*)\}/)?.[1] ?? "";
  const boundaries = statCss.match(/\.statistics-heatmap__y-axis-boundaries\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(yAxis).toContain("grid-template-rows: 27px auto;");
  expect(yAxis).not.toContain("padding-top");
  expect(boundaries).toContain("grid-template-rows: repeat(6, var(--heatmap-row-height));");
  const heatmapTooltip = statCss.match(/\.statistics-heatmap__tooltip\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(heatmapTooltip).toContain("min-height: 18px;");
  expect(heatmapTooltip).not.toContain("position: absolute;");
});

test("loads the Statistics stylesheet from the application entry point", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const entry = readFileSync(join(currentDir, "../main.tsx"), "utf8");

  expect(entry).toContain('import "./features/statistics/statistics.css";');
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
