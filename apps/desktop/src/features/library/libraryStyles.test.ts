import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("keeps the import trigger on the shared compact button system", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const libraryCss = readFileSync(join(currentDir, "library.css"), "utf8");
  const primitivesCss = readFileSync(join(currentDir, "../../styles/primitives.css"), "utf8");
  const trigger = libraryCss.match(/\.library-import-menu__trigger \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(trigger).toContain("min-width: 72px;");
  expect(trigger).not.toContain("border-radius: 999px;");
  expect(primitivesCss).toContain(".ui-button {\n");
  expect(primitivesCss).toContain(".ui-button--primary {");
});
