import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { SearchResult } from "../../lib/learning";
import { CommandPalette } from "./CommandPalette";

const document: SearchResult = { kind: "document", id: "linear-algebra", title: "Linear Algebra", subtitle: "Gilbert Strang" };
const deck: SearchResult = { kind: "deck", id: "english", title: "English", subtitle: null };
const card: SearchResult = { kind: "card", id: "card-1", title: "What is a verb?", subtitle: "English" };

test("opens with Cmd+K and shows sidebar sections and nav items", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<CommandPalette search={vi.fn().mockResolvedValue([])} onOpen={onOpen} />);

  await user.keyboard("{Meta>}k{/Meta}");
  expect(screen.getByRole("searchbox", { name: "Search everything" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Open Library" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Memora" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Trash" })).toBeInTheDocument();
});

test("shows search results grouped by section", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  const search = vi.fn().mockResolvedValue([document, deck, card]);

  render(<CommandPalette search={search} onOpen={onOpen} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "linear");
  await new Promise((resolve) => setTimeout(resolve, 170));
  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open English" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open What is a verb?" })).toBeInTheDocument();
  expect(search).toHaveBeenCalledWith("linear");
});

test("selects a nav item with keyboard", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<CommandPalette search={vi.fn().mockResolvedValue([])} onOpen={onOpen} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.keyboard("{ArrowDown}");
  await user.keyboard("{ArrowDown}");
  await user.keyboard("{Enter}");
  expect(onOpen).toHaveBeenCalledWith({ kind: "nav", id: "trash", title: "Trash", subtitle: null });
});

test("selects a document result by clicking", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<CommandPalette search={vi.fn().mockResolvedValue([document])} onOpen={onOpen} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "linear");
  await new Promise((resolve) => setTimeout(resolve, 170));
  await user.click(await screen.findByRole("button", { name: "Open Linear Algebra" }));
  expect(onOpen).toHaveBeenCalledWith(document);
});

test("closes with Escape", async () => {
  const user = userEvent.setup();

  render(<CommandPalette search={vi.fn().mockResolvedValue([])} onOpen={() => {}} />);

  await user.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
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
