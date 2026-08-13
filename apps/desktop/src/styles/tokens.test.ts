import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("uses a tinted glass fallback instead of a fully transparent sidebar", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const appCss = readFileSync(join(currentDir, "../app/app.css"), "utf8");
  const sidebar = appCss.match(/\.app-sidebar \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(css).toMatch(/--sidebar-bg:\s*rgb\([^)]*\/\s*\d+%\);/);
  expect(sidebar).toContain("background: var(--sidebar-bg);");
  expect(sidebar).toContain("backdrop-filter: blur(24px) saturate(1.15);");
  expect(sidebar).toContain("-webkit-backdrop-filter: blur(24px) saturate(1.15);");
});
