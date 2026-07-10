import { expect, test } from "vitest";

import { selectionDraft, selectionIsWithinPage, type CardSource } from "./readerSelection";

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

test.each(["", " \n\t "])("rejects a selection with a blank source document id", (documentId) => {
  expect(selectionDraft({ ...source, documentId }, 12)).toBeNull();
});

test("rejects a selection whose source document is unavailable", () => {
  expect(selectionDraft({ ...source, documentId: null as never }, 12)).toBeNull();
});

test("rejects a selection spanning multiple pages", () => {
  expect(selectionDraft(source, 13)).toBeNull();
});

test("rejects selections whose anchor is on a different page", () => {
  const pageOne = document.createElement("div");
  pageOne.id = "pdf-page-1";
  const pageTwo = document.createElement("div");
  pageTwo.id = "pdf-page-2";
  const anchor = document.createTextNode("one");
  const focus = document.createTextNode("two");
  pageTwo.append(anchor);
  pageOne.append(focus);
  const selection = { anchorNode: anchor, focusNode: focus } as unknown as Selection;

  expect(selectionIsWithinPage(selection, pageOne)).toBe(false);
});

test("rejects reverse drag selections whose focus is on an earlier page", () => {
  const pageOne = document.createElement("div");
  pageOne.id = "pdf-page-1";
  const pageTwo = document.createElement("div");
  pageTwo.id = "pdf-page-2";
  const anchor = document.createTextNode("two");
  const focus = document.createTextNode("one");
  pageTwo.append(anchor);
  pageOne.append(focus);
  const selection = { anchorNode: anchor, focusNode: focus } as unknown as Selection;

  expect(selectionIsWithinPage(selection, pageTwo)).toBe(false);
});
