import { act, render, screen, waitFor } from "@testing-library/react";
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

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

test("opens a reader placeholder and returns to the library", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([document]);

  render(
    <App
      libraryApi={{
        list,
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Open Linear Algebra" }));

  expect(screen.getByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
  expect(screen.getByText("Reader coming soon.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Back to Library" }));

  expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
});

test("opens a search result in the reader from either application state", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([document]);
  const search = vi.fn().mockResolvedValue([document]);

  render(
    <App
      libraryApi={{
        list,
        pick: vi.fn(),
        importDocuments: vi.fn(),
        search,
      }}
    />,
  );

  await screen.findByRole("button", { name: "Open Linear Algebra" });
  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "linear");
  await waitFor(() => expect(search).toHaveBeenCalledWith("linear"));
  await user.keyboard("{Enter}");
  expect(screen.getByText("Reader coming soon.")).toBeInTheDocument();

  await user.keyboard("{Meta>}k{/Meta}");
  expect(screen.getByRole("searchbox")).toBeInTheDocument();
});

test("keeps imported documents when an older initial load resolves last", async () => {
  const user = userEvent.setup();
  const initialList = deferred<typeof document[]>();
  const refreshedList = deferred<typeof document[]>();
  const list = vi.fn().mockReturnValueOnce(initialList.promise).mockReturnValueOnce(refreshedList.promise);
  const importDocuments = vi.fn().mockResolvedValue([document]);

  render(
    <App
      libraryApi={{
        list,
        pick: vi.fn().mockResolvedValue(["/chosen/linear-algebra.pdf"]),
        importDocuments,
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Import from Mac" }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  refreshedList.resolve([document]);
  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();

  await act(async () => {
    initialList.resolve([]);
    await initialList.promise;
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
  });
});
