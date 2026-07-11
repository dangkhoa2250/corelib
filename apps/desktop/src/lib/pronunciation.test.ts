import { act, renderHook } from "@testing-library/react";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { usePronunciation } from "./pronunciation";

/** Tracks callbacks set on the last-created SpeechSynthesisUtterance mock. */
let utteranceCallbacks: Record<string, (() => void) | null> = {};

beforeEach(() => {
  utteranceCallbacks = {};
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
    function (this: any, text: string) {
      this.text = text;
      this.lang = "";
      Object.defineProperties(this, {
        onstart: {
          set(fn: () => void) { utteranceCallbacks.onstart = fn; },
          get() { return utteranceCallbacks.onstart ?? null; },
        },
        onend: {
          set(fn: () => void) { utteranceCallbacks.onend = fn; },
          get() { return utteranceCallbacks.onend ?? null; },
        },
        onerror: {
          set(fn: () => void) { utteranceCallbacks.onerror = fn; },
          get() { return utteranceCallbacks.onerror ?? null; },
        },
      });
    }
  ) as unknown as typeof SpeechSynthesisUtterance;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("exposes isSupported as true when speechSynthesis is available", () => {
  const { result } = renderHook(() => usePronunciation());
  expect(result.current.isSupported).toBe(true);
});

test("exposes isSupported as false when speechSynthesis is unavailable", () => {
  Object.defineProperty(window, "speechSynthesis", { value: undefined, writable: true, configurable: true });
  const { result } = renderHook(() => usePronunciation());
  expect(result.current.isSupported).toBe(false);
});

test("play creates an utterance and calls speak", () => {
  const speak = vi.fn();
  window.speechSynthesis = { ...window.speechSynthesis, speak } as unknown as SpeechSynthesis;
  const { result } = renderHook(() => usePronunciation());
  act(() => result.current.play("Hello"));
  expect(speak).toHaveBeenCalled();
  const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
  expect(utterance.text).toBe("Hello");
});

test("play with a language sets utterance.lang", () => {
  const speak = vi.fn();
  window.speechSynthesis = { ...window.speechSynthesis, speak } as unknown as SpeechSynthesis;
  const { result } = renderHook(() => usePronunciation());
  act(() => result.current.play("Bonjour", "fr-FR"));
  const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
  expect(utterance.lang).toBe("fr-FR");
});

test("cancels prior utterance before starting new one", () => {
  const cancel = vi.fn();
  const speak = vi.fn();
  window.speechSynthesis = { ...window.speechSynthesis, cancel, speak } as unknown as SpeechSynthesis;
  const { result } = renderHook(() => usePronunciation());
  act(() => result.current.play("Hello"));
  act(() => result.current.play("World"));
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(speak).toHaveBeenCalledTimes(2);
});

test("cancels on unmount", () => {
  const cancel = vi.fn();
  window.speechSynthesis = { ...window.speechSynthesis, cancel } as unknown as SpeechSynthesis;
  const { unmount } = renderHook(() => usePronunciation());
  unmount();
  expect(cancel).toHaveBeenCalled();
});

test("ignores empty text", () => {
  const speak = vi.fn();
  window.speechSynthesis = { ...window.speechSynthesis, speak } as unknown as SpeechSynthesis;
  const { result } = renderHook(() => usePronunciation());
  act(() => result.current.play(""));
  expect(speak).not.toHaveBeenCalled();
  act(() => result.current.play("   "));
  expect(speak).not.toHaveBeenCalled();
});

test("isPlaying becomes true on onstart and false on onend", () => {
  const speak = vi.fn((utterance: SpeechSynthesisUtterance) => {
    utterance.onstart?.();
  });
  window.speechSynthesis = { ...window.speechSynthesis, speak } as unknown as SpeechSynthesis;
  const { result } = renderHook(() => usePronunciation());
  act(() => result.current.play("Hello"));
  expect(result.current.isPlaying).toBe(true);
  act(() => { utteranceCallbacks.onend?.(); });
  expect(result.current.isPlaying).toBe(false);
});

test("isPlaying resets to false on onerror", () => {
  const speak = vi.fn((utterance: SpeechSynthesisUtterance) => {
    utterance.onstart?.();
  });
  window.speechSynthesis = { ...window.speechSynthesis, speak } as unknown as SpeechSynthesis;
  const { result } = renderHook(() => usePronunciation());
  act(() => result.current.play("Hello"));
  expect(result.current.isPlaying).toBe(true);
  act(() => { utteranceCallbacks.onerror?.(); });
  expect(result.current.isPlaying).toBe(false);
});

test("stop resets isPlaying to false", () => {
  const speak = vi.fn((utterance: SpeechSynthesisUtterance) => {
    utterance.onstart?.();
  });
  window.speechSynthesis = { ...window.speechSynthesis, speak } as unknown as SpeechSynthesis;
  const { result } = renderHook(() => usePronunciation());
  act(() => result.current.play("Hello"));
  expect(result.current.isPlaying).toBe(true);
  act(() => result.current.stop());
  expect(result.current.isPlaying).toBe(false);
});
