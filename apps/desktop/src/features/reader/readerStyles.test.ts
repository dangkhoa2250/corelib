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

test("scopes the flashcard panel to an overlay container for narrow widths", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const reader = normalizeNewlines(readFileSync(join(currentDir, "ReaderPage.tsx"), "utf8"));
  const css = normalizeNewlines(readFileSync(join(currentDir, "reader.css"), "utf8"));

  expect(reader).toContain('className="reader-composer"');
  expect(css).toMatch(
    /\.reader-composer\s*\{[\s\S]*?flex:\s*0 0 auto;/,
  );
  expect(css).toMatch(
    /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.reader-composer\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*0;[\s\S]*?width:\s*360px;[\s\S]*?z-index:\s*20;/,
  );
});

test("centers the page indicator independently of the toolbar's side clusters", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(readFileSync(join(currentDir, "reader.css"), "utf8"));
  expect(css).toMatch(
    /\.reader-toolbar__group--page\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translate\(-50%,\s*-50%\);/,
  );
});
