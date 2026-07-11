import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import type { LibraryDocument } from "../../domain/document";
import { LibraryPage } from "./LibraryPage";

const document: LibraryDocument = {
  id: "linear-algebra",
  title: "Linear Algebra",
  author: "Gilbert Strang",
  source: "local_managed",
  coverUrl: null,
  indexed: true,
  status: "ready",
  lastReadPage: null,
  numPages: null,
};

test("renders ready local documents with import and open actions", () => {
  render(<LibraryPage documents={[document]} onImport={() => {}} onOpen={() => {}} />);

  expect(screen.getByRole("button", { name: "Import from Mac" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
});

test("shows an empty-state message without documents", () => {
  render(<LibraryPage documents={[]} onImport={() => {}} onOpen={() => {}} />);

  expect(screen.getByText("Your books will appear here.")).toBeInTheDocument();
});
