import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { LibraryDocument } from "../../domain/document";
import { CommandPalette } from "./CommandPalette";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("opens with Cmd+K, searches, and opens the selected result from the keyboard", async () => {
  const user = userEvent.setup();
  const search = vi.fn().mockResolvedValue([document]);
  const onOpen = vi.fn();

  render(<CommandPalette search={search} onOpen={onOpen} />);

  await user.keyboard("{Meta>}k{/Meta}");
  const searchbox = screen.getByRole("searchbox", { name: "Search your library" });
  expect(searchbox).toHaveFocus();

  await user.type(searchbox, "linear");
  await new Promise((resolve) => setTimeout(resolve, 170));
  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();

  await user.keyboard("{Enter}");
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(document);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("discards stale async search results", async () => {
  const user = userEvent.setup();
  const first = deferred<LibraryDocument[]>();
  const second = deferred<LibraryDocument[]>();
  const search = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);

  render(<CommandPalette search={search} onOpen={() => {}} />);

  await user.keyboard("{Control>}k{/Control}");
  const searchbox = screen.getByRole("searchbox", { name: "Search your library" });
  await user.type(searchbox, "first");
  await new Promise((resolve) => setTimeout(resolve, 170));
  await user.clear(searchbox);
  await user.type(searchbox, "second");
  await new Promise((resolve) => setTimeout(resolve, 170));

  second.resolve([document]);
  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
  first.resolve([{ ...document, id: "stale", title: "Stale result" }]);

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByRole("button", { name: "Open Stale result" })).not.toBeInTheDocument();
});

test("escapes out of a search failure so it can be reopened", async () => {
  const user = userEvent.setup();
  const search = vi.fn().mockRejectedValue(new Error("Search unavailable"));

  render(<CommandPalette search={search} onOpen={() => {}} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "linear");
  await new Promise((resolve) => setTimeout(resolve, 170));
  expect(await screen.findByRole("alert")).toHaveTextContent("Search unavailable");

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("searchbox")).toHaveFocus();
});

test("traps keyboard focus and closes from Escape anywhere in the dialog", async () => {
  const user = userEvent.setup();
  const search = vi.fn().mockResolvedValue([document]);

  render(<CommandPalette search={search} onOpen={() => {}} />);

  await user.keyboard("{Control>}k{/Control}");
  const searchbox = screen.getByRole("searchbox", { name: "Search your library" });
  await user.type(searchbox, "linear");
  const result = await screen.findByRole("button", { name: "Open Linear Algebra" });

  await user.tab();
  expect(result).toHaveFocus();
  await user.tab();
  expect(searchbox).toHaveFocus();
  await user.tab({ shift: true });
  expect(result).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("restores focus to the previously active element when it closes", async () => {
  const user = userEvent.setup();

  render(
    <>
      <button type="button">Previous focus</button>
      <CommandPalette search={vi.fn().mockResolvedValue([])} onOpen={() => {}} />
    </>,
  );

  const previous = screen.getByRole("button", { name: "Previous focus" });
  previous.focus();
  await user.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(previous).toHaveFocus();
});
