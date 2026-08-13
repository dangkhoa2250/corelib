import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CompactToolbarMenu } from "./CompactToolbarMenu";

const item = (label: string, overrides: Partial<{ active: boolean; disabled: boolean; onSelect: () => void }> = {}) => ({
  label,
  active: overrides.active ?? false,
  disabled: overrides.disabled ?? false,
  onSelect: overrides.onSelect ?? vi.fn(),
});

test("opens from an icon trigger and closes after selection", async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  render(
    <CompactToolbarMenu
      label="Text formatting"
      icon={<span>A</span>}
      items={[
        { ...item("Bold"), role: "menuitemcheckbox", onSelect: select },
        { ...item("Italic"), role: "menuitemcheckbox" },
      ]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Text formatting" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Bold" }));
  expect(select).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("icon-only items keep their accessible name but hide the text label", async () => {
  const user = userEvent.setup();
  render(
    <CompactToolbarMenu
      label="Alignment"
      icon={<span>⇦</span>}
      items={[
        { ...item("Align left"), icon: <span>L</span>, iconOnly: true, role: "menuitemradio" },
        { ...item("Align center"), icon: <span>C</span>, iconOnly: true, role: "menuitemradio" },
      ]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Alignment" }));
  const left = screen.getByRole("menuitemradio", { name: "Align left" });
  expect(left).toHaveClass("card-rich-text-editor__toolbar-menu-item--icon-only");
  expect(left.querySelector("span")?.textContent).toBe("L");
  expect(left.textContent).toBe("L");
});

test("opening one menu closes another", async () => {
  const user = userEvent.setup();
  render(
    <div>
      <CompactToolbarMenu label="Menu A" icon={<span>A</span>} items={[item("One")]} />
      <CompactToolbarMenu label="Menu B" icon={<span>B</span>} items={[item("Two")]} />
    </div>,
  );
  await user.click(screen.getByRole("button", { name: "Menu A" }));
  expect(screen.getAllByRole("menu")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Menu B" }));
  expect(screen.getAllByRole("menu")).toHaveLength(1);
  expect(screen.getByRole("menuitem", { name: "Two" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "One" })).not.toBeInTheDocument();
});

test("outside pointer press closes the menu", async () => {
  const user = userEvent.setup();
  render(
    <div>
      <CompactToolbarMenu label="Menu" icon={<span>A</span>} items={[item("One")]} />
      <button type="button">Outside</button>
    </div>,
  );
  await user.click(screen.getByRole("button", { name: "Menu" }));
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Outside" }));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("Escape closes and restores trigger focus", async () => {
  const user = userEvent.setup();
  render(<CompactToolbarMenu label="Menu" icon={<span>A</span>} items={[item("One")]} />);
  const trigger = screen.getByRole("button", { name: "Menu" });
  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("ArrowDown and ArrowUp move focus through enabled menu items", async () => {
  const user = userEvent.setup();
  render(
    <CompactToolbarMenu
      label="Text formatting"
      icon={<span>A</span>}
      items={[
        { ...item("Bold"), role: "menuitemcheckbox" },
        { ...item("Italic"), role: "menuitemcheckbox" },
        { ...item("Strikethrough", { disabled: true }), role: "menuitemcheckbox" },
        { ...item("Underline"), role: "menuitemcheckbox" },
      ]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Text formatting" }));
  await user.keyboard("{ArrowDown}");
  // The first ArrowDown moves roving focus to the first enabled item.
  expect(screen.getByRole("menuitemcheckbox", { name: "Bold" })).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitemcheckbox", { name: "Italic" })).toHaveFocus();
  // Skips the disabled Strikethrough and wraps to the first item.
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitemcheckbox", { name: "Underline" })).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitemcheckbox", { name: "Bold" })).toHaveFocus();
  await user.keyboard("{ArrowUp}");
  expect(screen.getByRole("menuitemcheckbox", { name: "Underline" })).toHaveFocus();
});

test("Enter and Space select the focused item", async () => {
  const user = userEvent.setup();
  const selectBold = vi.fn();
  render(
    <CompactToolbarMenu
      label="Text formatting"
      icon={<span>A</span>}
      items={[
        { ...item("Bold"), role: "menuitemcheckbox", onSelect: selectBold },
        { ...item("Italic"), role: "menuitemcheckbox" },
      ]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Text formatting" }));
  await user.keyboard("{ArrowDown}");
  await user.keyboard("{Enter}");
  expect(selectBold).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Text formatting" }));
  await user.keyboard("{ArrowDown}");
  await user.keyboard(" ");
  expect(selectBold).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("active items expose aria-checked", async () => {
  render(
    <CompactToolbarMenu
      label="Text formatting"
      icon={<span>A</span>}
      items={[
        { ...item("Bold", { active: true }), role: "menuitemcheckbox" },
        { ...item("Italic"), role: "menuitemradio" },
      ]}
    />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Text formatting" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Bold" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("menuitemradio", { name: "Italic" })).toHaveAttribute("aria-checked", "false");
});

test("a disabled trigger cannot open", async () => {
  const user = userEvent.setup();
  render(<CompactToolbarMenu disabled label="Menu" icon={<span>A</span>} items={[item("One")]} />);
  const trigger = screen.getByRole("button", { name: "Menu" });
  expect(trigger).toBeDisabled();
  await user.click(trigger);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
