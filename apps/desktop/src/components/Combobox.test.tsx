import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { Combobox, type ComboboxOption } from "./Combobox";

const options: ComboboxOption<string>[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
  { value: "date", label: "Date" },
];

function ComboboxTest({
  initial,
  onChange,
  ariaLabel,
  searchable = true,
}: {
  initial?: string;
  onChange?: (v: string) => void;
  ariaLabel?: string;
  searchable?: boolean;
}) {
  const [value, setValue] = useState<string | null>(initial ?? null);
  return (
    <Combobox
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      options={options}
      placeholder="Pick a fruit"
      ariaLabel={ariaLabel}
      searchable={searchable}
    />
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

test("renders trigger with placeholder", () => {
  render(<ComboboxTest ariaLabel="Fruit picker" />);
  expect(screen.getByRole("combobox", { name: "Fruit picker" })).toBeDefined();
});

test("shows selected label in trigger", () => {
  render(<ComboboxTest initial="banana" />);
  expect(screen.getByText("Banana")).toBeDefined();
});

test("opens panel on click", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  expect(screen.getByRole("listbox")).toBeDefined();
  expect(screen.getByPlaceholderText("Search...")).toBeDefined();
});

test("keeps search enabled and focused by default", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  expect(screen.getByPlaceholderText("Search...")).toHaveFocus();
});

test("opens from a focused trigger with ArrowDown and selects by keyboard", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ComboboxTest onChange={onChange} ariaLabel="Fruit picker" searchable={false} />);

  const trigger = screen.getByRole("combobox", { name: "Fruit picker" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  expect(trigger).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: "Apple" }).id,
  );

  await user.keyboard("{ArrowDown}{Enter}");
  expect(onChange).toHaveBeenCalledWith("banana");
  expect(trigger).toHaveFocus();
});

test("keeps non-searchable options out of tab order and tabs past the popup", async () => {
  const user = userEvent.setup();
  render(
    <>
      <ComboboxTest ariaLabel="Fruit picker" searchable={false} />
      <button type="button">Next control</button>
    </>,
  );

  const trigger = screen.getByRole("combobox", { name: "Fruit picker" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(4);
  expect(options[0]).toHaveAttribute("id");
  options.forEach((option) => expect(option).toHaveAttribute("tabindex", "-1"));

  await user.tab();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next control" })).toHaveFocus();
});

test("supports keyboard selection without a search field when not searchable", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <ComboboxTest
      initial="banana"
      onChange={onChange}
      ariaLabel="Fruit picker"
      searchable={false}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByText("Search...")).not.toBeInTheDocument();
  expect(screen.getAllByRole("option")).toHaveLength(options.length);
  expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Banana");

  await user.keyboard("{ArrowDown}{Enter}");
  expect(onChange).toHaveBeenCalledWith("cherry");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Fruit picker" })).toHaveFocus();

  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Fruit picker" })).toHaveFocus();
});

test("closes panel on outside click", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  expect(screen.getByRole("listbox")).toBeDefined();
  await user.click(document.body);
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("closes panel on Escape", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  expect(screen.getByRole("listbox")).toBeDefined();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("selects option on click", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ComboboxTest onChange={onChange} ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  await user.click(screen.getByText("Cherry"));
  expect(onChange).toHaveBeenCalledWith("cherry");
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("selects option on Enter", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ComboboxTest onChange={onChange} ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(onChange).toHaveBeenCalledWith("cherry");
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("filters options when typing", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  await user.type(screen.getByPlaceholderText("Search..."), "ap");
  expect(screen.getByText("Apple")).toBeDefined();
  expect(screen.queryByText("Banana")).toBeNull();
  expect(screen.queryByText("Cherry")).toBeNull();
  expect(screen.queryByText("Date")).toBeNull();
});

test("shows no options message when filter has no results", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  await user.type(screen.getByPlaceholderText("Search..."), "xyz");
  expect(screen.getByText("No options found")).toBeDefined();
});

test("highlights selected option with checkmark", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest initial="date" ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  const option = screen.getByRole("option", { selected: true });
  expect(option).toBeDefined();
  expect(option.textContent).toContain("Date");
});
