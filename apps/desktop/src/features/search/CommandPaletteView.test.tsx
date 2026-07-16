import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ComponentProps } from "react";
import { expect, test, vi } from "vitest";

import type { CommandEntry } from "../../app/commandRegistry";
import { CommandPaletteView, highlightMatch } from "./CommandPaletteView";

function entry(overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    id: "document.linear-algebra",
    surface: "quick-open",
    title: "Linear Algebra",
    aliases: [],
    breadcrumb: ["Library", "Documents"],
    group: "Library",
    execute: vi.fn(),
    ...overrides,
  };
}

function renderView(overrides: Partial<ComponentProps<typeof CommandPaletteView>> = {}) {
  const first = entry();
  const second = entry({ id: "deck.calculus", title: "Calculus", group: "Memora", breadcrumb: ["Memora", "Decks"] });
  return render(
    <CommandPaletteView
      close={vi.fn()}
      error={null}
      groups={[
        { section: "Library", results: [first] },
        { section: "Memora", results: [second] },
      ]}
      isSearchPending={false}
      label="Quick Open"
      onExecute={vi.fn()}
      onQueryChange={vi.fn()}
      onSelect={vi.fn()}
      onSelectNext={vi.fn()}
      onSelectPrevious={vi.fn()}
      query=""
      resultVerb="Open"
      searchboxRef={createRef<HTMLInputElement>()}
      selectedIndex={0}
      {...overrides}
    />,
  );
}

test("highlights ordered fuzzy matches with a neutral mark", () => {
  render(<>{highlightMatch("Linear Algebra", "lga")}</>);

  const matches = screen.getAllByText(/./, { selector: "mark.command-palette__match" });
  expect(matches.map((match) => match.textContent)).toEqual(["L", "g", "a"]);
});

test("highlights each fuzzy query term independently", () => {
  render(<>{highlightMatch("Appearance", "ap ar")}</>);

  const matches = screen.getAllByText(/./, { selector: "mark.command-palette__match" });
  expect(matches.map((match) => match.textContent)).toEqual(["A", "p", "r"]);
});

test("renders the selected row with a valid marker and keyboard navigation footer", () => {
  renderView();

  const selected = screen.getByRole("button", { name: "Open Linear Algebra, selected" });
  expect(selected).toHaveAttribute("data-selected", "true");
  expect(selected).not.toHaveAttribute("aria-selected");
  expect(screen.getByText("↑↓")).toBeVisible();
  expect(screen.getByText("Enter")).toBeVisible();
  expect(screen.getByText("Escape")).toBeVisible();
});

test("marks retained rows busy and disables them while a newer search is pending", () => {
  renderView({ isSearchPending: true });

  expect(screen.getByRole("list", { name: "Results" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Open Linear Algebra, selected" })).toBeDisabled();
});

test("delegates query and result keyboard actions to its callbacks", async () => {
  const user = userEvent.setup();
  const onQueryChange = vi.fn();
  const onSelectNext = vi.fn();
  const onSelectPrevious = vi.fn();
  const onExecute = vi.fn();
  const onSelect = vi.fn();
  const close = vi.fn();
  const result = entry();
  renderView({
    close,
    groups: [{ section: "Library", results: [result] }],
    onExecute,
    onQueryChange,
    onSelect,
    onSelectNext,
    onSelectPrevious,
  });

  const searchbox = screen.getByRole("searchbox", { name: "Quick Open" });
  await user.type(searchbox, "lin");
  await user.keyboard("{ArrowDown}{ArrowUp}{Enter}{Escape}");

  expect(onQueryChange).toHaveBeenCalledWith("l");
  expect(onSelectNext).toHaveBeenCalledOnce();
  expect(onSelectPrevious).toHaveBeenCalledOnce();
  expect(onExecute).toHaveBeenCalledWith(result);
  expect(close).toHaveBeenCalledOnce();
});

test("selects a clicked row before executing it", async () => {
  const user = userEvent.setup();
  const onExecute = vi.fn();
  const onSelect = vi.fn();
  renderView({ onExecute, onSelect });

  await user.click(screen.getByRole("button", { name: "Open Calculus" }));

  expect(onSelect).toHaveBeenCalledWith(1);
  expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ id: "deck.calculus" }));
  expect(onSelect.mock.invocationCallOrder[0]).toBeLessThan(onExecute.mock.invocationCallOrder[0]);
});

test("closes from Escape when a result button has focus", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  renderView({ close });

  const result = screen.getByRole("button", { name: "Open Linear Algebra, selected" });
  result.focus();
  await user.keyboard("{Escape}");

  expect(close).toHaveBeenCalledOnce();
});

test("keeps Tab focus inside the dialog", async () => {
  const user = userEvent.setup();
  renderView();

  const searchbox = screen.getByRole("searchbox", { name: "Quick Open" });
  const lastResult = screen.getByRole("button", { name: "Open Calculus" });
  lastResult.focus();
  await user.tab();
  expect(searchbox).toHaveFocus();

  await user.tab({ shift: true });
  expect(lastResult).toHaveFocus();
});
