import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("uses neutral palette-specific scrollbars and match highlights", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "search.css"), "utf8");
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
