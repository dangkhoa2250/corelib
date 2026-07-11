import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  await user.type(screen.getByLabelText("Search models"), "Gemma");
  const result = await screen.findByRole("button", { name: /Gemma 4 31B/ });
  await user.click(result);
  expect(screen.queryByText("Selected: Gemma 4 31B")).not.toBeInTheDocument();
  expect(result).not.toHaveClass("is-highlighted");
  expect(screen.getByLabelText("Search models")).toHaveValue("Gemma 4 31B");
  expect(screen.queryByRole("button", { name: /Gemma 4 31B/ })).not.toBeInTheDocument();
  expect(result).toHaveTextContent("NVIDIA NIM");
  expect(result).not.toHaveTextContent("google/gemma-4-31b");
  expect(screen.queryByRole("checkbox", { name: /Use this provider/ })).not.toBeInTheDocument();
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
  expect(screen.getByRole("heading", { name: "Model" })).toBeInTheDocument();
});

test("masks the API key by default and toggles visibility with the eye button", async () => {
  const user = userEvent.setup();
  render(
    <SettingsPage
      hasApiKey={vi.fn().mockResolvedValue(false)}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={vi.fn()}
    />,
  );

  const input = screen.getByLabelText("API key");
  await user.type(input, "secret-key");
  expect(input).toHaveAttribute("type", "password");
  expect(input).toHaveStyle({ color: "rgb(29, 29, 31)" });

  await user.click(screen.getByRole("button", { name: "Show API key" }));
  expect(input).toHaveAttribute("type", "text");

  await user.click(screen.getByRole("button", { name: "Hide API key" }));
  expect(input).toHaveAttribute("type", "password");
});

test("shows a masked saved-key state after the key is stored", async () => {
  render(
    <SettingsPage
      hasApiKey={vi.fn((provider: string) => Promise.resolve(provider === "google-ai-studio"))}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "••••••••••••••••");
  });
  expect(screen.queryByRole("button", { name: "Show API key" })).not.toBeInTheDocument();
});

test("keeps the saved key available to reveal during the current settings session", async () => {
  const user = userEvent.setup();
  const saveApiKey = vi.fn().mockResolvedValue(undefined);
  render(
    <SettingsPage
      hasApiKey={vi.fn().mockResolvedValue(false)}
      saveApiKey={saveApiKey}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={vi.fn().mockResolvedValue([])}
    />,
  );

  const input = screen.getByLabelText("API key");
  await user.type(input, "secret-key");
  await user.click(screen.getByRole("button", { name: "Connect" }));

  await waitFor(() => expect(saveApiKey).toHaveBeenCalledWith("google-ai-studio", "secret-key"));
  expect(input).toHaveValue("secret-key");
  expect(input).toHaveAttribute("type", "password");
  expect(screen.getByRole("button", { name: "Show API key" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Show API key" }));
  expect(input).toHaveAttribute("type", "text");
  expect(input).toHaveValue("secret-key");
});

test("renders connected providers as a list", async () => {
  const hasApiKey = vi.fn((provider: string) => Promise.resolve(provider === "nvidia" || provider === "openrouter"));
  render(
    <SettingsPage
      hasApiKey={hasApiKey}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={vi.fn()}
    />,
  );

  const list = await screen.findByLabelText("Connected providers");
  expect(list).toHaveTextContent("NVIDIA NIM");
  expect(list).toHaveTextContent("OpenRouter");
  expect(within(list).getAllByRole("button", { name: "Manage" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "+ Add provider" })).toBeInTheDocument();
});

test("loads models for the connected provider when settings opens", async () => {
  const user = userEvent.setup();
  const listModels = vi.fn().mockResolvedValue([
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  ]);

  render(
    <SettingsPage
      hasApiKey={vi.fn((provider: string) => Promise.resolve(provider === "google-ai-studio"))}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={listModels}
    />,
  );

  await waitFor(() => expect(listModels).toHaveBeenCalledWith("google-ai-studio"));
  await user.type(screen.getByLabelText("Search models"), "Gemini");
  expect(await screen.findByRole("button", { name: /Gemini 2\.5 Flash/ })).toBeInTheDocument();
});

test("searches models across connected providers without a translate provider selector", async () => {
  const user = userEvent.setup();
  const listModels = vi.fn((provider: string) => Promise.resolve(
    provider === "google-ai-studio"
      ? [{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" }]
      : [{ id: "google/gemma-4-31b", name: "Gemma 4 31B" }],
  ));

  render(
    <SettingsPage
      hasApiKey={vi.fn((provider: string) => Promise.resolve(provider === "google-ai-studio" || provider === "nvidia"))}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={listModels}
    />,
  );

  await waitFor(() => expect(listModels).toHaveBeenCalledWith("nvidia"));
  expect(screen.queryByRole("combobox", { name: "Translate provider" })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Search models"), "Gemma");
  const result = await screen.findByRole("button", { name: /Gemma 4 31B/ });
  expect(result).toHaveTextContent("Gemma 4 31B");
  expect(result).toHaveTextContent("NVIDIA NIM");
  expect(result).not.toHaveTextContent("google/gemma-4-31b");
});

test("selects a searched model with arrow keys and Enter", async () => {
  const user = userEvent.setup();
  const onDefaultChange = vi.fn();
  const listModels = vi.fn().mockResolvedValue([
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  ]);

  render(
    <SettingsPage
      hasApiKey={vi.fn((provider: string) => Promise.resolve(provider === "google-ai-studio"))}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={listModels}
      onDefaultChange={onDefaultChange}
    />,
  );

  await waitFor(() => expect(listModels).toHaveBeenCalledWith("google-ai-studio"));
  const search = screen.getByLabelText("Search models");
  expect(search).toHaveAttribute("spellcheck", "false");
  await user.type(search, "Gemini");
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

  expect(onDefaultChange).toHaveBeenCalledWith("google-ai-studio", "gemini-2.5-pro");
  expect(screen.getByLabelText("Search models")).toHaveValue("Gemini 2.5 Pro");
  expect(screen.queryByRole("button", { name: /Gemini 2\.5 Pro/ })).not.toBeInTheDocument();
});

test("defers model search until the user pauses typing", async () => {
  const listModels = vi.fn().mockResolvedValue([
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  ]);

  render(
    <SettingsPage
      hasApiKey={vi.fn((provider: string) => Promise.resolve(provider === "google-ai-studio"))}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={listModels}
    />,
  );

  await waitFor(() => expect(listModels).toHaveBeenCalledWith("google-ai-studio"));
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "Gemini" } });
  expect(screen.queryByRole("button", { name: /Gemini 2\.5 Flash/ })).not.toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(250);
  });
  expect(screen.getByRole("button", { name: /Gemini 2\.5 Flash/ })).toBeInTheDocument();
  vi.useRealTimers();
});

test("restores the selected model in the search field when settings reopens", async () => {
  const values = new Map([
    ["library.ai.default-provider", "google-ai-studio"],
    ["library.ai.default-provider.model", "gemini-2.5-flash"],
  ]);
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  const listModels = vi.fn().mockResolvedValue([
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  ]);

  render(
    <SettingsPage
      hasApiKey={vi.fn((provider: string) => Promise.resolve(provider === "google-ai-studio"))}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      listModels={listModels}
    />,
  );

  await waitFor(() => expect(screen.getByLabelText("Search models")).toHaveValue("Gemini 2.5 Flash"));
  expect(screen.queryByRole("button", { name: /Gemini 2\.5 Flash/ })).not.toBeInTheDocument();
});
