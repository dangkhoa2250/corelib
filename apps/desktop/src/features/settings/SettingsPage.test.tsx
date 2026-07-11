import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

beforeEach(() => {
  window.localStorage?.clear?.();
});

test("connects a provider and loads models using only an API key", async () => {
  const user = userEvent.setup();
  const listModels = vi.fn().mockResolvedValue([
    { id: "google/gemma-4-31b", name: "Gemma 4 31B" },
  ]);
  const saveApiKey = vi.fn().mockResolvedValue(undefined);
  const onDefaultChange = vi.fn();

  render(
    <SettingsPage
      hasApiKey={vi.fn().mockResolvedValue(false)}
      saveApiKey={saveApiKey}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={listModels}
      onDefaultChange={onDefaultChange}
    />,
  );

  await user.selectOptions(screen.getByRole("combobox", { name: "AI provider" }), "nvidia");
  await user.type(screen.getByLabelText("API key"), "nvapi-test");
  await user.click(screen.getByRole("button", { name: "Connect" }));

  await waitFor(() => expect(saveApiKey).toHaveBeenCalledWith("nvidia", "nvapi-test"));
  expect(listModels).toHaveBeenCalledWith("nvidia");
  expect(await screen.findByRole("option", { name: /Gemma 4 31B/ })).toBeInTheDocument();
});

test("shows provider errors without losing the settings form", async () => {
  const user = userEvent.setup();
  render(
    <SettingsPage
      hasApiKey={vi.fn().mockResolvedValue(false)}
      saveApiKey={vi.fn().mockRejectedValue(new Error("Invalid API key"))}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={vi.fn()}
    />,
  );

  await user.type(screen.getByLabelText("API key"), "bad-key");
  await user.click(screen.getByRole("button", { name: "Connect" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid API key");
  expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
});
