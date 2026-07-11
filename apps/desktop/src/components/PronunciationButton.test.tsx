import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { PronunciationButton } from "./PronunciationButton";

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
    function (this: Record<string, unknown>, text: string) {
      this.text = text;
      this.lang = "";
    }
  ) as unknown as typeof SpeechSynthesisUtterance;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders a button with accessible name Play pronunciation", () => {
  render(<PronunciationButton text="Hello" />);
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
});

test("does nothing when text is empty", async () => {
  const user = userEvent.setup();
  const speak = vi.fn();
  window.speechSynthesis.speak = speak;
  render(<PronunciationButton text="" />);
  await user.click(screen.getByRole("button", { name: "Play pronunciation" }));
  expect(speak).not.toHaveBeenCalled();
});

test("is disabled when Web Speech API is unavailable", () => {
  Object.defineProperty(window, "speechSynthesis", { value: undefined, writable: true, configurable: true });
  render(<PronunciationButton text="Hello" />);
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeDisabled();
});

test("clicking plays the text", async () => {
  const user = userEvent.setup();
  const speak = vi.fn();
  window.speechSynthesis.speak = speak;
  render(<PronunciationButton text="Hello" lang="en-US" />);
  await user.click(screen.getByRole("button", { name: "Play pronunciation" }));
  expect(speak).toHaveBeenCalled();
  const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
  expect(utterance.text).toBe("Hello");
  expect(utterance.lang).toBe("en-US");
});
