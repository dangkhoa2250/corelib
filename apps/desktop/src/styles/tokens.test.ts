import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

test("uses a tinted glass fallback instead of a fully transparent sidebar", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(readFileSync(join(currentDir, "tokens.css"), "utf8"));
  const appCss = normalizeNewlines(readFileSync(join(currentDir, "../app/app.css"), "utf8"));
  const sidebar = appCss.match(/\.app-sidebar \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(css).toMatch(/--sidebar-bg:\s*rgb\([^)]*\/\s*\d+%\);/);
  expect(sidebar).toContain("background: var(--sidebar-bg);");
  expect(sidebar).toContain("backdrop-filter: blur(24px) saturate(1.15);");
  expect(sidebar).toContain("-webkit-backdrop-filter: blur(24px) saturate(1.15);");
});

test("uses Windows typography and removes macOS titlebar spacing without changing scroll surfaces", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = [
    normalizeNewlines(readFileSync(join(currentDir, "tokens.css"), "utf8")),
    normalizeNewlines(readFileSync(join(currentDir, "../app/app.css"), "utf8")),
    normalizeNewlines(readFileSync(join(currentDir, "../features/settings/settings.css"), "utf8")),
  ].join("\n");

  expect(css).toContain(':root[data-platform="windows"] {\n  font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;');
  expect(css).toContain(':root[data-platform="windows"] .app-sidebar {\n  padding-top: 16px;');
  expect(css).toContain(':root[data-platform="windows"] .app-sidebar__drag-region {\n  display: none;');
  expect(css).toContain(':root[data-platform="windows"] .settings-page__sidebar {\n  padding-top: 22px;');
});
