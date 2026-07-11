import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach, afterEach } from "vitest";

import { CardSelectionToolbar } from "./CardSelectionToolbar";

beforeEach(() => {
  const mockSynth = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn().mockReturnValue([]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onvoiceschanged: null,
    paused: false,
    pending: false,
    speaking: false,
  };
  Object.defineProperty(window, "speechSynthesis", {
    value: mockSynth,
    writable: true,
    configurable: true,
  });
  window.SpeechSynthesisUtterance = vi.fn().mockImplementation(
    function (this: any, text: string) { this.text = text; this.lang = ""; }
  ) as unknown as typeof SpeechSynthesisUtterance;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("offers accessible controls for a selected passage", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  const onDismiss = vi.fn();

  render(
    <CardSelectionToolbar
      quote="A vector space is closed under addition."
      onCreate={onCreate}
      onDismiss={onDismiss}
    />,
  );

  expect(screen.getByText("A vector space is closed under addition.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create flashcard" }));
  await user.click(screen.getByRole("button", { name: "Dismiss" }));

  expect(onCreate).toHaveBeenCalledExactlyOnceWith();
  expect(onDismiss).toHaveBeenCalledExactlyOnceWith();
});

test("includes a pronunciation button for the selected quote", () => {
  render(
    <CardSelectionToolbar
      quote="Bonjour le monde"
      onCreate={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
});
