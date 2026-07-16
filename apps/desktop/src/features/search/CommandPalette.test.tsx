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

test("executes only the second Quick Open item after ArrowDown then Enter", async () => {
  const user = userEvent.setup();
  const first = vi.fn();
  const second = vi.fn();
  render(
    <CommandPalette
      mode="quick-open"
      search={vi.fn().mockResolvedValue([
        entry({ id: "first", title: "First", execute: first }),
        entry({ id: "second", title: "Second", execute: second }),
      ])}
    />,
  );

  await user.keyboard("{Control>}k{/Control}");
  await screen.findByRole("button", { name: "Open Second" });
  await user.keyboard("{ArrowDown}{Enter}");

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
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

test("keeps prior results visible but blocks stale execution while a newer query is searching", async () => {
  const user = userEvent.setup();
  const staleExecute = vi.fn();
  let resolveLatestSearch: ((results: CommandEntry[]) => void) | undefined;
  const latestSearch = new Promise<CommandEntry[]>((resolve) => {
    resolveLatestSearch = resolve;
  });
  const latestExecute = vi.fn();
  const search = vi.fn((query: string) => (
    query === "new" ? latestSearch : Promise.resolve([entry({ id: "stale", title: "Stale", execute: staleExecute })])
  ));
  render(<CommandPalette mode="quick-open" search={search} />);

  await user.keyboard("{Control>}k{/Control}");
  await screen.findByRole("button", { name: "Open Stale, selected" });
  await user.type(screen.getByRole("searchbox"), "new");

  const results = screen.getByRole("list", { name: "Results" });
  expect(screen.getByRole("button", { name: "Open Stale, selected" })).toBeVisible();
  expect(results).toHaveAttribute("aria-busy", "true");
  await user.keyboard("{Enter}");
  expect(staleExecute).not.toHaveBeenCalled();

  resolveLatestSearch?.([entry({ id: "latest", title: "Latest", execute: latestExecute })]);
  await screen.findByRole("button", { name: "Open Latest, selected" });
  expect(screen.queryByRole("button", { name: /Open Stale/ })).not.toBeInTheDocument();
  expect(results).toHaveAttribute("aria-busy", "false");
  await user.keyboard("{Enter}");
  expect(latestExecute).toHaveBeenCalledOnce();
});

test("keeps a rejected clicked action selected", async () => {
  const user = userEvent.setup();
  const rejected = vi.fn().mockRejectedValue(new Error("Could not open second"));
  render(
    <CommandPalette
      mode="quick-open"
      search={vi.fn().mockResolvedValue([
        entry({ id: "first", title: "First" }),
        entry({ id: "second", title: "Second", execute: rejected }),
      ])}
    />,
  );

  await user.keyboard("{Control>}k{/Control}");
  await user.click(await screen.findByRole("button", { name: "Open Second" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not open second");
  expect(screen.getByRole("button", { name: "Open Second, selected" })).toHaveAttribute("data-selected", "true");
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

test("does not overwrite the focus restoration target when opened again", async () => {
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
  await user.keyboard("{Control>}k{/Control}");
  await user.keyboard("{Escape}");

  expect(previous).toHaveFocus();
});

test("switches surfaces without restoring focus to the covered palette", async () => {
  const user = userEvent.setup();
  render(
    <>
      <button type="button">Previous focus</button>
      <CommandPalette mode="quick-open" search={vi.fn().mockResolvedValue([])} />
      <CommandPalette mode="command-palette" search={vi.fn().mockResolvedValue([])} />
    </>,
  );

  const previous = screen.getByRole("button", { name: "Previous focus" });
  previous.focus();
  await user.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("dialog", { name: "Quick Open" })).toBeInTheDocument();
  await user.keyboard("{Shift>}{Control>}k{/Control}{/Shift}");

  expect(screen.queryByRole("dialog", { name: "Quick Open" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Command Palette" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(previous).toHaveFocus();
});
