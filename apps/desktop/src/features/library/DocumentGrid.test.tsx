import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { LibraryDocument } from "../../domain/document";
import { DocumentGrid } from "./DocumentGrid";

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

test("maps card opens to document ids", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<DocumentGrid documents={[document]} onOpen={onOpen} />);

  expect(screen.getByRole("region", { name: "Documents" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open Linear Algebra" }));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("linear-algebra");
});
