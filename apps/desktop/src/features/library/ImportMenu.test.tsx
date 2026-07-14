import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ImportMenu } from "./ImportMenu";

afterEach(() => {
  document.body.innerHTML = "";
});

test("opens sources and invokes only enabled actions", async () => {
  const user = userEvent.setup();
  const onUpload = vi.fn();
  const onGoogleDrive = vi.fn();
  render(<ImportMenu onUpload={onUpload} onGoogleDrive={onGoogleDrive} />);

  const trigger = screen.getByRole("button", { name: "Import" });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  expect(trigger).toHaveAttribute("aria-expanded", "false");

  await user.click(trigger);
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Upload file" }));

  expect(onUpload).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();

  await user.click(trigger);
  const googleDrive = screen.getByRole("menuitem", { name: /Google Drive/ });
  expect(googleDrive).toBeEnabled();
  await user.click(googleDrive);
  expect(onGoogleDrive).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();

  await user.click(trigger);
  expect(
    screen.getByRole("menuitem", { name: /iCloud Drive.*Coming soon/ }),
  ).toBeDisabled();
  expect(
    screen.getByRole("menuitem", { name: /OneDrive.*Coming soon/ }),
  ).toBeDisabled();
});

test("closes on Escape and outside click", async () => {
  const user = userEvent.setup();
  render(<ImportMenu onUpload={vi.fn()} onGoogleDrive={vi.fn()} />);

  const trigger = screen.getByRole("button", { name: "Import" });
  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();

  await user.click(trigger);
  await user.click(document.body);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("moves focus among enabled menu items with keyboard controls", async () => {
  const user = userEvent.setup();
  render(<ImportMenu onUpload={vi.fn()} onGoogleDrive={vi.fn()} />);

  const trigger = screen.getByRole("button", { name: "Import" });
  await user.click(trigger);

  const upload = screen.getByRole("menuitem", { name: "Upload file" });
  const googleDrive = screen.getByRole("menuitem", { name: /Google Drive/ });
  expect(upload).toHaveFocus();

  await user.keyboard("{ArrowDown}");
  expect(googleDrive).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(upload).toHaveFocus();
  await user.keyboard("{End}");
  expect(googleDrive).toHaveFocus();
  await user.keyboard("{Home}");
  expect(upload).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
