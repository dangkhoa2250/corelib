import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

test("renders ready local documents with a single import menu trigger and open action", () => {
  render(
    <LibraryPage
      documents={[document]}
      onImport={() => {}}
      onOpen={() => {}}
      onOpenDrive={() => {}}
    />,
  );

  expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Import from Mac" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Google Drive" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
});

test("shows an empty-state message without documents", () => {
  render(<LibraryPage documents={[]} onImport={() => {}} onOpen={() => {}} />);

  expect(screen.getByText("Your books will appear here.")).toBeInTheDocument();
});

test("makes Google Drive unavailable when no Drive action is supplied", async () => {
  const user = userEvent.setup();
  render(<LibraryPage documents={[]} onImport={() => {}} onOpen={() => {}} />);

  await user.click(screen.getByRole("button", { name: "Import" }));

  expect(
    screen.getByRole("menuitem", { name: /Google Drive.*Unavailable/ }),
  ).toBeDisabled();
});
