import { expect, test, vi } from "vitest";

import {
  importLocalDocuments,
  listDocuments,
  saveReadPage,
  searchDocuments,
} from "./desktop";

test("lists documents through the native command", async () => {
  const invoke = vi.fn().mockResolvedValue([]);

  await expect(listDocuments(invoke)).resolves.toEqual([]);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("list_documents");
});

test("passes typed arguments to native library commands", async () => {
  const invoke = vi.fn().mockResolvedValue([]);

  await importLocalDocuments(["/tmp/book.pdf"], invoke);
  await searchDocuments("Ada", invoke);
  await saveReadPage("document-1", 12, invoke);

  expect(invoke.mock.calls).toEqual([
    ["import_local_documents", { paths: ["/tmp/book.pdf"] }],
    ["search_documents", { query: "Ada" }],
    ["save_read_page", { id: "document-1", page: 12 }],
  ]);
});
