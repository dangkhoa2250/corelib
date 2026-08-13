import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

test("uses the reusable ScrollArea for the reader's thumbnail and PDF panes", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const reader = normalizeNewlines(readFileSync(join(currentDir, "ReaderPage.tsx"), "utf8"));

  expect(reader).toContain('import { ScrollArea } from "../../components/ScrollArea";');
  expect(reader.match(/<ScrollArea/g)?.length).toBeGreaterThanOrEqual(2);
});
