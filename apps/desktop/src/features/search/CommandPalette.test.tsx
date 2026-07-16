import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { CommandEntry } from "../../app/commandRegistry";
import { CommandPalette } from "./CommandPalette";

function entry(overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    id: "document.linear-algebra",
    surface: "quick-open",
    title: "Linear Algebra",
    aliases: ["Gilbert Strang"],
    breadcrumb: ["Library", "Documents"],
    group: "Library",
    execute: vi.fn(),
    ...overrides,
  };
}

test("opens Quick Open with Cmd+K and renders a breadcrumb", async () => {
  const user = userEvent.setup();
  render(<CommandPalette mode="quick-open" search={vi.fn().mockResolvedValue([entry()])} />);

  await user.keyboard("{Meta>}k{/Meta}");
  await user.type(screen.getByRole("searchbox", { name: "Quick Open" }), "linear");

  expect(await screen.findByText("Library › Documents")).toBeInTheDocument();
});

test("opens Command Palette with Shift+Cmd+K and executes", async () => {
  const user = userEvent.setup();
  const execute = vi.fn();
  render(
    <CommandPalette
      mode="command-palette"
      search={vi.fn().mockResolvedValue([entry({ id: "action.theme-dark", surface: "command-palette", title: "Theme: Dark", group: "Settings", execute })])}
    />,
  );

  await user.keyboard("{Shift>}{Meta>}k{/Meta}{/Shift}");
  await user.keyboard("{Enter}");

  expect(execute).toHaveBeenCalledOnce();
});

test("groups Quick Open results by registry group", async () => {
  const user = userEvent.setup();
  render(
    <CommandPalette
      mode="quick-open"
      search={vi.fn().mockResolvedValue([
        entry(),
        entry({ id: "deck.english", title: "English", breadcrumb: ["Memora", "Decks"], group: "Memora" }),
      ])}
    />,
  );

  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "e");

  expect(await screen.findByText("Library")).toBeInTheDocument();
  expect(screen.getByText("Memora")).toBeInTheDocument();
});

test("selects the current Quick Open item with the keyboard", async () => {
  const user = userEvent.setup();
  const execute = vi.fn();
  render(<CommandPalette mode="quick-open" search={vi.fn().mockResolvedValue([entry({ execute })])} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.keyboard("{Enter}");

  expect(execute).toHaveBeenCalledOnce();
});

test("executes the item that was clicked", async () => {
  const user = userEvent.setup();
  const first = vi.fn();
  const second = vi.fn();
  render(
    <CommandPalette
      mode="quick-open"
      search={vi.fn().mockResolvedValue([entry({ id: "first", title: "First", execute: first }), entry({ id: "second", title: "Second", execute: second })])}
    />,
  );

  await user.keyboard("{Control>}k{/Control}");
  await user.click(await screen.findByRole("button", { name: "Open Second" }));

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});

test("closes with Escape", async () => {
  const user = userEvent.setup();
  render(<CommandPalette mode="quick-open" search={vi.fn().mockResolvedValue([])} />);

  await user.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("dialog", { name: "Quick Open" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("restores focus to the previously active element when it closes", async () => {
  const user = userEvent.setup();
  render(
    <>
      <button type="button">Previous focus</button>
      <CommandPalette mode="quick-open" search={vi.fn().mockResolvedValue([])} />
    </>,
  );

  const previous = screen.getByRole("button", { name: "Previous focus" });
  previous.focus();
  await user.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(previous).toHaveFocus();
});
