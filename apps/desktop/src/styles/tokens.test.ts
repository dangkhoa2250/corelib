import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("does not apply global color transitions to every element", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");

  expect(css).not.toContain("transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;");
});
