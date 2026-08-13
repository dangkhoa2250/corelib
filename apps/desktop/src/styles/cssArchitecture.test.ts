import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

const internalStyles = [
  "tokens.css",
  "base.css",
  "primitives.css",
  "../app/app.css",
  "../features/settings/settings.css",
  "../features/library/library.css",
  "../features/memora/memora.css",
  "../features/cards/cards.css",
  "../features/reader/reader.css",
  "../features/review/review.css",
  "../features/search/search.css",
  "../features/drive/drive.css",
  "../features/statistics/statistics.css",
] as const;

const expectedImports = [
  'import "./styles/tokens.css";',
  'import "./styles/base.css";',
  'import "./styles/primitives.css";',
  'import "./app/app.css";',
  'import "./features/settings/settings.css";',
  'import "./features/library/library.css";',
  'import "./features/memora/memora.css";',
  'import "./features/cards/cards.css";',
  'import "./features/reader/reader.css";',
  'import "./features/review/review.css";',
  'import "./features/search/search.css";',
  'import "./features/drive/drive.css";',
  'import "./features/statistics/statistics.css";',
  'import "pdfjs-dist/web/pdf_viewer.css";',
] as const;

function read(relativePath: string): string {
  return readFileSync(join(currentDir, relativePath), "utf8").replace(/\r\n?/g, "\n");
}

test("keeps desktop stylesheet ownership and import order explicit", () => {
  const tokens = read("tokens.css");
  const entry = read("../main.tsx");

  expect(tokens).not.toMatch(/^\s*\.[a-z_-]/im);
  expect(tokens).not.toContain("@media");
  expect(tokens).not.toContain("@keyframes");
  expect(tokens).not.toMatch(
    /\.(?:app-shell|app-sidebar|settings-page|library-page|memora-|deck-detail-page|card-browser|source-viewer|reader-|review-page|command-palette|drive-)/,
  );

  const offsets = expectedImports.map((statement) => entry.indexOf(statement));
  expect(offsets.every((offset) => offset >= 0)).toBe(true);
  expect(offsets).toEqual([...offsets].sort((left, right) => left - right));

  for (const statement of expectedImports) {
    expect(entry.split(statement).length - 1).toBe(1);
  }

  for (const relativePath of internalStyles) {
    expect(read(relativePath), relativePath).not.toHaveLength(0);
  }
});

test("keeps shared animation and scrollbar ownership out of feature CSS", () => {
  const primitives = read("primitives.css");
  const featureCss = internalStyles
    .filter((path) => path.startsWith("../features/"))
    .map(read)
    .join("\n");

  expect(primitives.match(/@keyframes fadeIn/g)?.length ?? 0).toBe(1);
  expect(featureCss).not.toContain("@keyframes fadeIn");
  expect(featureCss).not.toMatch(/::-webkit-scrollbar/);
});
