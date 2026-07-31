import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("uses a dark-theme-safe compact surface for the import trigger", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "library.css"), "utf8");
  const trigger = css.match(/\.library-import-menu__trigger \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(trigger).toContain("border: 1px solid var(--border-strong);");
  expect(trigger).toContain("border-radius: 8px;");
  expect(trigger).toContain("padding: 8px 10px;");
  expect(trigger).toContain("color: var(--text-primary);");
  expect(trigger).toContain("background: var(--surface-1);");
  expect(trigger).not.toContain("--button-primary");
  expect(css).toContain(".library-import-menu__trigger:hover:not(:disabled) {");
});
