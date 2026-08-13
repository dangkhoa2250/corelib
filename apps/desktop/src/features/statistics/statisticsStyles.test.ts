import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

test("defines a theme-aware blue Statistics accent for charts and sparklines", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statisticsCss = normalizeNewlines(readFileSync(join(currentDir, "statistics.css"), "utf8"));
  const sparkline = normalizeNewlines(readFileSync(join(currentDir, "components/MiniSparkline.tsx"), "utf8"));

  expect(statisticsCss).toMatch(/\.statistics-shell\s*\{[\s\S]*?--statistics-accent:\s*#456079;/);
  expect(statisticsCss).toMatch(/\[data-theme="dark"\]\s+\.statistics-shell\s*\{[\s\S]*?--statistics-accent:\s*#83c3ff;/);
  expect(statisticsCss).not.toMatch(/--statistics-accent:\s*var\(--warning\)/);
  expect(sparkline).toContain('stroke="var(--statistics-accent)"');
});

test("uses semantic tokens in Statistics CSS with proper scroll-surface padding", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = normalizeNewlines(readFileSync(join(currentDir, "statistics.css"), "utf8"));
  const desktopCss = statCss.slice(0, statCss.indexOf("@media"));
  const statCssWithoutStatisticsAccent = statCss.replace(/--statistics-accent:\s*#[0-9a-fA-F]{3,8};/g, "");

  const shellContent = desktopCss.match(/\.statistics-shell__content\s*\{([^}]*)\}/)?.[1] ?? "";
  const decreaseComparison = desktopCss.match(/\.statistics-kpi-card__comparison\[data-kind="decrease"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  const kpiCard = desktopCss.match(/\.statistics-kpi-card\s*\{([^}]*)\}/)?.[1] ?? "";
  const section = desktopCss.match(/\.statistics-section \{\n  padding: 22px;\n  border-radius: 16px;\n\}/)?.[0] ?? "";
  const appCard = desktopCss.match(/\.statistics-app-card\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(shellContent).toContain("padding: 0 20px 38px 28px;");
  expect(kpiCard).toContain("min-height: 156px;");
  expect(section).toContain("padding: 22px;");
  expect(section).toContain("border-radius: 16px;");
  expect(appCard).toContain("padding: 20px;");
  expect(appCard).toContain("border-radius: 14px;");
  expect(decreaseComparison).toContain("color: var(--text-secondary);");
  expect(decreaseComparison).not.toContain("var(--error)");
  expect(statCss).not.toMatch(/\boverflow(?:-y)?\s*:\s*(?:auto|scroll)\s*;/);
  expect(statCssWithoutStatisticsAccent).not.toMatch(/#[0-9a-fA-F]{3,6};/);
});

test("pins every approved desktop Statistics density token", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = normalizeNewlines(readFileSync(join(currentDir, "statistics.css"), "utf8"));
  const desktopCss = statCss.slice(0, statCss.indexOf("@media"));
  const block = (selector: string) => desktopCss.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  const shellPaddings = [...statCss.matchAll(/\.statistics-shell__content\s*\{[^}]*padding:\s*([^;]+);/g)].map((match) => match[1].trim());
  const sharedContent = block("\\.statistics-shell__header,\\s*\\.statistics-page,\\s*\\.statistics-shell__content > :not\\(\\.statistics-shell__header\\)");
  const adjacentSections = block("\\.statistics-section \\+ \\.statistics-section,\\s*\\.statistics-kpi-grid \\+ \\.statistics-section");
  const screenReaderOnly = block("\\.sr-only");

  expect(sharedContent).toContain("max-width: 1180px;");
  expect(block("\\.statistics-shell__header")).toContain("gap: 20px;");
  expect(block("\\.statistics-shell__header")).toContain("margin-bottom: 24px;");
  expect(block("\\.statistics-shell__heading h1")).toContain("font-size: clamp(28px, 2.7vw, 36px);");
  expect(block("\\.statistics-card")).toContain("padding: 18px;");
  expect(block("\\.statistics-card")).toContain("border-radius: 14px;");
  expect(block("\\.statistics-card__label")).toContain("font-size: 13px;");
  expect(block("\\.statistics-card__value")).toContain("font-size: clamp(26px, 2.4vw, 32px);");
  expect(block("\\.statistics-kpi-grid")).toContain("gap: 16px;");
  expect(block("\\.statistics-kpi-card")).toContain("min-height: 156px;");
  expect(block("\\.statistics-kpi-card__icon,\\s*\\.statistics-icon-tile")).toContain("width: 38px;");
  expect(block("\\.statistics-kpi-card__icon,\\s*\\.statistics-icon-tile")).toContain("height: 38px;");
  expect(block("\\.statistics-kpi-card__icon svg")).toContain("width: 19px;");
  expect(block("\\.statistics-kpi-card__icon svg")).toContain("height: 19px;");
  expect(block("\\.statistics-mini-sparkline")).toContain("width: min(108px, 42%);");
  expect(block("\\.statistics-mini-sparkline")).toContain("height: 36px;");
  expect(block("\\.statistics-mini-sparkline")).toContain("flex: 0 1 108px;");
  expect(block("\\.statistics-control")).toContain("min-height: 34px;");
  expect(block("\\.statistics-control")).toContain("padding: 6px 10px;");
  expect(block("\\.statistics-control")).toContain("font-size: 13px;");
  expect(desktopCss).toContain(".statistics-section {\n  padding: 22px;\n  border-radius: 16px;\n}");
  expect(adjacentSections).toContain("margin-top: 18px;");
  expect(block("\\.statistics-section__header")).toContain("margin-bottom: 16px;");
  expect(block("\\.statistics-section__title")).toContain("font-size: 20px;");
  expect(block("\\.statistics-app-grid")).toContain("gap: 16px;");
  expect(block("\\.statistics-app-card")).toContain("gap: 18px 16px;");
  expect(block("\\.statistics-app-card")).toContain("padding: 20px;");
  expect(block("\\.statistics-app-card")).toContain("border-radius: 14px;");
  expect(block("\\.statistics-app-card__icon")).toContain("width: 40px;");
  expect(block("\\.statistics-app-card__icon")).toContain("height: 40px;");
  expect(block("\\.statistics-app-card__heading h3")).toContain("font-size: 18px;");
  expect(block("\\.statistics-app-card__metrics strong")).toContain("font-size: 25px;");
  expect(block("\\.statistics-app-card \\.statistics-mini-sparkline")).toContain("width: 92px;");
  expect(block("\\.statistics-app-card \\.statistics-mini-sparkline")).toContain("height: 36px;");
  expect(block("\\.statistics-chart-card__controls")).toContain("margin-bottom: 16px;");
  expect(block("\\.statistics-heatmap__x-axis")).toContain("margin-bottom: 6px;");
  expect(block("\\.statistics-heatmap__tooltip")).toContain("margin: 10px 0 0;");
  expect(block("\\.statistics-heatmap__summary")).toContain("margin: 10px 0 0;");
  expect(desktopCss).toContain("--statistics-accent: #456079;");
  expect(statCss).toContain("--statistics-accent: #83c3ff;");
  expect(statCss).not.toContain(".statistics-color-picker");
  expect(block("\\.statistics-heatmap-wrapper--year")).toContain("--heatmap-gap: 1px;");
  expect(block("\\.statistics-heatmap-wrapper--year")).toContain("--heatmap-row-height: 17px;");
  expect(block("\\.statistics-heatmap-wrapper--year \\.statistics-heatmap__cell")).toContain("border-radius: 2px;");
  expect(screenReaderOnly).toContain("position: absolute;");
  expect(screenReaderOnly).toContain("width: 1px;");
  expect(screenReaderOnly).toContain("height: 1px;");
  expect(screenReaderOnly).toContain("overflow: hidden;");
  expect(screenReaderOnly).toContain("clip: rect(0,0,0,0);");
  expect(shellPaddings).toEqual(["0 20px 38px 28px", "0 20px 36px 24px", "0 20px 34px 18px"]);
  expect(shellPaddings.map((padding) => padding.split(/\s+/)[1])).toEqual(["20px", "20px", "20px"]);
});

test("keeps the statistics dashboard flat, responsive, and token-correct", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = normalizeNewlines(readFileSync(join(currentDir, "statistics.css"), "utf8"));
  const statCssWithoutStatisticsAccent = statCss.replace(/--statistics-accent:\s*#[0-9a-fA-F]{3,8};/g, "");
  const kpiGrid = statCss.match(/\.statistics-kpi-grid\s*\{([^}]*)\}/)?.[1] ?? "";
  const appGrid = statCss.match(/\.statistics-app-grid\s*\{([^}]*)\}/)?.[1] ?? "";
  const emptyCell = statCss.match(/\.statistics-heatmap__cell\s*\{([^}]*)\}/)?.[1] ?? "";
  const yearHeatmap = statCss.match(/\.statistics-heatmap-wrapper--year\s*\{([^}]*)\}/)?.[1] ?? "";
  const yearCells = statCss.match(/\.statistics-heatmap-wrapper--year \.statistics-heatmap__cell\s*\{([^}]*)\}/)?.[1] ?? "";

  expect(statCss).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
  expect(statCss).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/);
  expect(statCss).not.toContain("width: max-content");
  expect(statCssWithoutStatisticsAccent).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
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
  expect(statCss).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.statistics-shell__content \{ padding: 0 20px 36px 24px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.statistics-kpi-card \{ min-height: 146px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.statistics-section \{ padding: 20px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-shell__content \{ padding: 0 20px 34px 18px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-control \{ min-height: 36px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-range-picker > div:last-child \.statistics-control \{ width: 36px; min-height: 36px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-kpi-card \{ min-height: 148px; \}/);
  expect(statCss).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.statistics-section \{ padding: 18px;/);
  expect(statCss).not.toContain(".statistics-color-picker");
});

test("keeps non-interactive Statistics insight cards free of clickable affordances", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = normalizeNewlines(readFileSync(join(currentDir, "statistics.css"), "utf8"));

  expect(statCss).not.toContain(".statistics-app-card:not(:disabled)");
  expect(statCss).not.toContain(".statistics-app-card:disabled");
  expect(statCss).toContain(".statistics-app-card__open:hover");
  expect(statCss).toContain(".statistics-app-card__open:focus-visible");
});

test("keeps the calendar time heatmap inside its card without horizontal scrolling", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statCss = normalizeNewlines(readFileSync(join(currentDir, "statistics.css"), "utf8"));
  const heatmap = normalizeNewlines(readFileSync(join(currentDir, "components/ActivityHeatmap.tsx"), "utf8"));

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

  const heatmapEndLabel = statCss.match(
    /\.statistics-heatmap__x-axis span\[data-axis-edge="end"\]\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  expect(heatmapEndLabel).toContain("justify-self: end;");
  expect(heatmapEndLabel).toContain("text-align: right;");
  expect(heatmapEndLabel).toContain("overflow: visible;");
});

test("pins the Statistics master detail and WKWebView inset contract", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(
    readFileSync(
      join(currentDir, "statistics.css"),
      "utf8",
    ),
  );
  const workspace = css.match(
    /\.statistics-master-detail\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const entityContent = css.match(
    /\.statistics-entity-pane__scroll-content\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const metricStrip = css.match(
    /\.statistics-metric-strip\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const detailSection = css.match(
    /\.statistics-detail-section\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const embeddedActivity = css.match(
    /\.statistics-activity-card--embedded\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const detailPane = css.match(
    /\.statistics-master-detail__detail\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const selectedAll = css.match(
    /\.statistics-entity-pane__all-button\[aria-current="page"\]\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const selectedRow = css.match(
    /\.statistics-entity-pane__row\[aria-current="page"\]\s*\{([^}]*)\}/,
  )?.[1] ?? "";

  expect(workspace).toContain(
    "grid-template-columns: 272px minmax(0, 1fr);",
  );
  expect(workspace).toContain("gap: 18px;");
  expect(entityContent).toContain("padding-right: 20px;");
  expect(metricStrip).not.toContain("min-height: 156px;");
  expect(detailSection).not.toMatch(/background|box-shadow|border-radius/);
  expect(embeddedActivity).toContain("background: transparent;");
  expect(embeddedActivity).toContain("box-shadow: none;");
  expect(css).toContain("@media (max-width: 1180px)");
  expect(css).toContain("@media (max-width: 480px)");
  expect(css).toMatch(
    /@media \(max-width: 720px\)[\s\S]*?\.statistics-control\s*\{[^}]*min-height: 36px;/,
  );
  expect(css).not.toMatch(/\boverflow(?:-y)?\s*:\s*(?:auto|scroll)\s*;/);
  expect(css).not.toMatch(/::-webkit-scrollbar/);
  expect(css).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
  expect(css).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/);
  expect(css).not.toContain("width: max-content");

  for (const declaration of [
    "padding: 20px;",
    "border: 1px solid var(--border-subtle);",
    "border-radius: 14px;",
    "background: var(--surface-1);",
    "box-shadow: var(--shadow-card);",
  ]) {
    expect(detailPane).toContain(declaration);
  }

  expect(selectedAll).toContain("background: var(--interactive-selected);");
  expect(selectedRow).toContain("background: var(--interactive-selected);");
  expect(selectedAll).not.toContain("var(--statistics-accent)");
  expect(selectedRow).not.toContain("var(--statistics-accent)");
});

test("loads the Statistics stylesheet from the application entry point", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const entry = normalizeNewlines(readFileSync(join(currentDir, "../../main.tsx"), "utf8"));

  expect(entry).toContain('import "./features/statistics/statistics.css";');
});
