import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "./App";

const document = {
  id: "linear-algebra",
  title: "Linear Algebra",
  author: "Gilbert Strang",
  source: "local_managed" as const,
  coverUrl: null,
  indexed: true,
  status: "ready" as const,
  lastReadPage: null,
};

test("renders the Library heading", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeInTheDocument();
});

test("loads documents asynchronously and preserves them after a failed import", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([document]);
  const pick = vi.fn().mockResolvedValue(["/chosen/linear-algebra.pdf"]);
  const importDocuments = vi.fn().mockRejectedValue(new Error("Import failed"));

  render(<App libraryApi={{ list, pick, importDocuments }} />);

  expect(screen.getByRole("status", { name: "Loading library" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Import from Mac" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Import failed");
  expect(screen.getByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
});

test("does not import when the picker is cancelled", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([]);
  const pick = vi.fn().mockResolvedValue(null);
  const importDocuments = vi.fn();

  render(<App libraryApi={{ list, pick, importDocuments }} />);

  await screen.findByText("Your books will appear here.");
  await user.click(screen.getByRole("button", { name: "Import from Mac" }));

  expect(importDocuments).not.toHaveBeenCalled();
});
