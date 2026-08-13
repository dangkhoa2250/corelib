import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

test("uses a semantic flat hover surface for shared comboboxes", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(readFileSync(join(currentDir, "primitives.css"), "utf8"));
  const hover = css.match(/\.combobox__trigger:hover\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(hover).toContain("background: var(--interactive-hover);");
  expect(hover).not.toMatch(/gradient|#[0-9a-fA-F]{3,8}\b/);
});

test("keeps disabled Statistics and shared combobox controls on their normal surfaces", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const primitivesCss = normalizeNewlines(readFileSync(join(currentDir, "primitives.css"), "utf8"));
  const statisticsCss = normalizeNewlines(readFileSync(join(currentDir, "../features/statistics/statistics.css"), "utf8"));
  const comboboxDisabledHover = primitivesCss.match(/\.combobox__trigger:disabled:hover\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const statisticsDisabled = statisticsCss.match(/\.statistics-control:disabled,\s*\.statistics-control:disabled:hover,\s*\.statistics-control:disabled\[aria-pressed="true"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(comboboxDisabledHover).toContain("background: var(--surface-1);");
  expect(comboboxDisabledHover).toContain("border-color: var(--border-strong);");
  expect(statisticsDisabled).toContain("background: var(--surface-1);");
  expect(statisticsDisabled).toContain("color: var(--text-disabled);");
  expect(statisticsDisabled).toContain("cursor: not-allowed;");
});
