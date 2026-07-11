import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";

test("opens with Cmd+K and shows sidebar sections", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<CommandPalette onOpen={onOpen} />);

  await user.keyboard("{Meta>}k{/Meta}");
  expect(screen.getByRole("searchbox", { name: "Navigate to a section" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Go to Library" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Go to Memora" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Go to Trash" })).toBeInTheDocument();
});

test("filters sections as user types", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<CommandPalette onOpen={onOpen} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "mem");
  expect(screen.getByRole("button", { name: "Go to Memora" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Go to Library" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Go to Trash" })).not.toBeInTheDocument();
});

test("selects a section with keyboard and calls onOpen", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<CommandPalette onOpen={onOpen} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.keyboard("{ArrowDown}");
  await user.keyboard("{Enter}");
  expect(onOpen).toHaveBeenCalledExactlyOnceWith({ kind: "nav", id: "memora", title: "Memora", subtitle: null });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("closes with Escape", async () => {
  const user = userEvent.setup();

  render(<CommandPalette onOpen={() => {}} />);

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
      <CommandPalette onOpen={() => {}} />
    </>,
  );

  const previous = screen.getByRole("button", { name: "Previous focus" });
  previous.focus();
  await user.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(previous).toHaveFocus();
});

test("selects a section by clicking", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<CommandPalette onOpen={onOpen} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.click(screen.getByRole("button", { name: "Go to Trash" }));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith({ kind: "nav", id: "trash", title: "Trash", subtitle: null });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
