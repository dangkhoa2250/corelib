import { expect, test } from "vitest";

import { selectionDraft, type CardSource } from "./readerSelection";

const source: CardSource = {
  documentId: "linear-algebra",
  page: 12,
  quote: "A vector space is closed under addition.",
  rects: [{ x: 12, y: 24, width: 180, height: 16 }],
};

test("keeps a valid one-page selection unchanged", () => {
  expect(selectionDraft(source, 12)).toBe(source);
});

test("rejects a blank selected quote", () => {
  expect(selectionDraft({ ...source, quote: " \n " }, 12)).toBeNull();
});

test("rejects a selection without a positive page", () => {
  expect(selectionDraft({ ...source, page: 0 }, 0)).toBeNull();
});

test("rejects a selection spanning multiple pages", () => {
  expect(selectionDraft(source, 13)).toBeNull();
});
