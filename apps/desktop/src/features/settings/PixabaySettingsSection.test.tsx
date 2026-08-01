import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { PixabaySettingsSection } from "./PixabaySettingsSection";

function keysInStorage(): string[] {
  const out: string[] = [];
  const store = window.localStorage;
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key) out.push(key);
  }
  return out;
}

test("shows a masked key field and saves the entered key", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <PixabaySettingsSection
      check={vi.fn().mockResolvedValue(false)}
      save={save}
      remove={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  const input = await screen.findByLabelText("Pixabay API key");
  expect(input).toHaveAttribute("type", "password");
  expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();

  await user.type(input, "secret-pixabay-key");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(save).toHaveBeenCalledWith("secret-pixabay-key"));
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("offers Remove only when a key is already stored", async () => {
  const user = userEvent.setup();
  const remove = vi.fn().mockResolvedValue(undefined);
  render(
    <PixabaySettingsSection
      check={vi.fn().mockResolvedValue(true)}
      save={vi.fn().mockResolvedValue(undefined)}
      remove={remove}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Remove" }));
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith());
});

test("surfaces a save failure and keeps the form usable", async () => {
  const user = userEvent.setup();
  render(
    <PixabaySettingsSection
      check={vi.fn().mockResolvedValue(false)}
      save={vi.fn().mockRejectedValue(new Error("Keychain unavailable"))}
      remove={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  await user.type(await screen.findByLabelText("Pixabay API key"), "bad-key");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Keychain unavailable");
  expect(screen.getByLabelText("Pixabay API key")).toBeInTheDocument();
});

test("never writes the key to localStorage", async () => {
  const user = userEvent.setup();
  render(
    <PixabaySettingsSection
      check={vi.fn().mockResolvedValue(false)}
      save={vi.fn().mockResolvedValue(undefined)}
      remove={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  await user.type(await screen.findByLabelText("Pixabay API key"), "secret-pixabay-key");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());

  expect(keysInStorage().some((key) => key.toLowerCase().includes("pixabay"))).toBe(false);
});
