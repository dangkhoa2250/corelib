import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { LibraryDocument } from "../../domain/document";
import { DocumentCard } from "./DocumentCard";

const document: LibraryDocument = {
  id: "linear-algebra",
  title: "Linear Algebra",
  author: "Gilbert Strang",
  source: "local_managed",
  coverUrl: null,
  indexed: true,
  status: "ready",
  lastReadPage: null,
};

test("opens a document when its cover card is clicked", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<DocumentCard document={document} onOpen={onOpen} />);

  await user.click(screen.getByRole("button", { name: "Open Linear Algebra" }));

  expect(onOpen).toHaveBeenCalledExactlyOnceWith();
  expect(screen.getByText("L")).toBeInTheDocument();
  expect(screen.queryByText("Preparing")).not.toBeInTheDocument();
});

test("shows the document status only when it is non-empty", () => {
  render(<DocumentCard document={{ ...document, status: "processing" }} onOpen={() => {}} />);

  expect(screen.getByText("Preparing")).toBeInTheDocument();
});
