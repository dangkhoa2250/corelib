import { expect, test } from "vitest";
import {
  documentStatusLabel,
  type LibraryDocument,
} from "./document";

test("labels processing documents as Preparing", () => {
  const document: LibraryDocument = {
    id: "document-1",
    title: "A Local PDF",
    author: null,
    source: "local_managed",
    coverUrl: null,
    indexed: false,
    status: "processing",
    lastReadPage: null,
  };

  expect(documentStatusLabel(document)).toBe("Preparing");
});
