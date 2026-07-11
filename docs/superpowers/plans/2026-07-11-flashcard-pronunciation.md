# Flashcard Pronunciation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let learners hear the source text (front, selected quote) through the OS text-to-speech voices via Web Speech API, without leaving the flashcard workflow.

**Architecture:** A `usePronunciation` React hook wraps the Web Speech API (feature detection, utterance lifecycle, cleanup). A shared `PronunciationButton` component consumes the hook and renders an icon-only circular speaker control. Three UI surfaces (CardComposer, CardSelectionToolbar, ReviewPage) each render the button with the appropriate text and language. A lightweight `detectLanguage` utility identifies scripts via Unicode range heuristics so the correct voice is selected. Language is detected at runtime everywhere — no persistence needed.

**Tech Stack:** React 19, Web Speech API (browser-native), Vitest + Testing Library

---

### Task 1: Add speaker icon to shared icons

**Files:**
- Modify: `src/app/icons.tsx` (bottom)

- [ ] **Step 1: Add `IconSpeaker` component**

Append to `src/app/icons.tsx`:
```tsx
export function IconSpeaker({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

---

### Task 2: Create language detection utility

**Files:**
- Create: `src/lib/language.ts`
- Create: `src/lib/language.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/language.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  test("returns zh-CN for Chinese text", () => {
    expect(detectLanguage("你好世界")).toBe("zh-CN");
  });

  test("returns ja-JP for Japanese text with hiragana", () => {
    expect(detectLanguage("こんにちは世界")).toBe("ja-JP");
  });

  test("returns ko-KR for Korean text", () => {
    expect(detectLanguage("안녕하세요")).toBe("ko-KR");
  });

  test("returns ru-RU for Cyrillic text", () => {
    expect(detectLanguage("Привет мир")).toBe("ru-RU");
  });

  test("returns ar-SA for Arabic text", () => {
    expect(detectLanguage("مرحبا بالعالم")).toBe("ar-SA");
  });

  test("returns undefined for Latin-only text", () => {
    expect(detectLanguage("Hello world")).toBeUndefined();
  });

  test("returns undefined for empty or whitespace text", () => {
    expect(detectLanguage("")).toBeUndefined();
    expect(detectLanguage("   ")).toBeUndefined();
  });

  test("handles mixed content with dominant script", () => {
    // Mostly Chinese with some Latin
    expect(detectLanguage("你好世界 Hello")).toBe("zh-CN");
  });
});
```

Run: `npx vitest run src/lib/language.test.ts`
Expected: FAIL — `detectLanguage` not defined

- [ ] **Step 2: Write the implementation**

Create `src/lib/language.ts`:
```ts
export function detectLanguage(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const sample = trimmed.replace(/\s+/g, "").slice(0, 100);
  if (sample.length === 0) return undefined;

  let hiragana = 0, katakana = 0, hangul = 0, cjk = 0, cyrillic = 0, arabic = 0;

  for (const char of sample) {
    const cp = char.codePointAt(0)!;
    if (cp >= 0x3040 && cp <= 0x309f) hiragana++;
    else if (cp >= 0x30a0 && cp <= 0x30ff) katakana++;
    else if (cp >= 0xac00 && cp <= 0xd7af) hangul++;
    else if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
    else if (cp >= 0x0400 && cp <= 0x04ff) cyrillic++;
    else if (cp >= 0x0600 && cp <= 0x06ff) arabic++;
  }

  const threshold = sample.length * 0.3;
  if (hiragana > sample.length * 0.15 || katakana > sample.length * 0.1) return "ja-JP";
  if (hangul > threshold) return "ko-KR";
  if (cjk > threshold) return "zh-CN";
  if (cyrillic > threshold) return "ru-RU";
  if (arabic > threshold) return "ar-SA";

  return undefined;
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/lib/language.test.ts`
Expected: PASS (6+ tests)

- [ ] **Step 4: Commit**

```bash
git add src/lib/language.ts src/lib/language.test.ts
git commit -m "feat: add language detection utility"
```

---

### Task 3: Create pronunciation hook

**Files:**
- Create: `src/lib/pronunciation.ts`
- Create: `src/lib/pronunciation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pronunciation.test.ts`:
```ts
import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { usePronunciation } from "./pronunciation";

function mockSpeechSynthesis() {
  let currentUtterance: SpeechSynthesisUtterance | null = null;
  const listeners = new Map<string, Set<() => void>>();

  const utterance = vi.fn().mockImplementation((text: string) => {
    const uttr = {
      text,
      lang: "",
      onstart: null as (() => void) | null,
      onend: null as (() => void) | null,
      onerror: null as ((e: Event) => void) | null,
    };
    currentUtterance = uttr as unknown as SpeechSynthesisUtterance;
    return uttr;
  });

  const speak = vi.fn();
  const cancel = vi.fn();

  const mockSpeechSynthesis = {
    speaking: false,
    pending: false,
    paused: false,
    speak,
    cancel: vi.fn(() => {
      cancel();
      currentUtterance = null;
    }),
    getVoices: vi.fn().mockReturnValue([]),
    paused: false,
    pending: false,
    speaking: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onvoiceschanged: null,
  };

  return { mockSpeechSynthesis, utterance, speak, cancel };
}

beforeEach(() => {
  const synth = mockSpeechSynthesis();
  Object.defineProperty(window, "speechSynthesis", {
    value: synth.mockSpeechSynthesis,
    writable: true,
    configurable: true,
  });
  // Also mock the constructor
  window.SpeechSynthesisUtterance = vi.fn().mockImplementation(
    (text: string) => ({ text, lang: "" })
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
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(speak).toHaveBeenCalledTimes(2);
});

test("cancels on unmount", () => {
  const cancel = vi.fn();
  window.speechSynthesis = { ...window.speechSynthesis, cancel } as unknown as SpeechSynthesis;
  const { unmount } = renderHook(() => usePronunciation());
  unmount();
  expect(cancel).toHaveBeenCalled();
});
```

Run: `npx vitest run src/lib/pronunciation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Write the implementation**

Create `src/lib/pronunciation.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface UsePronunciationResult {
  isSupported: boolean;
  isPlaying: boolean;
  play: (text: string, lang?: string) => void;
  stop: () => void;
}

export function usePronunciation(): UsePronunciationResult {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, [isSupported]);

  const play = useCallback(
    (text: string, lang?: string) => {
      if (!isSupported || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (lang) utterance.lang = lang;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported],
  );

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  return { isSupported, isPlaying, play, stop };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/pronunciation.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/pronunciation.ts src/lib/pronunciation.test.ts
git commit -m "feat: add usePronunciation hook for Web Speech API"
```

---

### Task 4: Create PronunciationButton component

**Files:**
- Create: `src/components/PronunciationButton.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/PronunciationButton.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { PronunciationButton } from "../components/PronunciationButton";

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
    (text: string) => ({ text, lang: "" })
  ) as unknown as typeof SpeechSynthesisUtterance;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders a button with accessible name Play pronunciation", () => {
  render(<PronunciationButton text="Hello" />);
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
});

test("does nothing when text is empty", () => {
  const speak = vi.fn();
  window.speechSynthesis.speak = speak;
  render(<PronunciationButton text="" />);
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
```

Run: `npx vitest run src/components/PronunciationButton.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 2: Write the implementation**

Create `src/components/PronunciationButton.tsx`:
```tsx
import { IconSpeaker } from "../app/icons";
import { detectLanguage } from "../lib/language";
import { usePronunciation } from "../lib/pronunciation";

export interface PronunciationButtonProps {
  text: string;
  lang?: string | null;
}

export function PronunciationButton({ text, lang }: PronunciationButtonProps) {
  const { isSupported, isPlaying, play, stop } = usePronunciation();

  if (!isSupported) {
    return (
      <button
        aria-label="Play pronunciation"
        disabled
        style={{
          border: 0,
          borderRadius: "50%",
          width: "32px",
          height: "32px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e5e5ea",
          color: "#8e8e93",
          cursor: "not-allowed",
          flexShrink: 0,
        }}
        title="Speech synthesis is not available in this browser"
        type="button"
      >
        <IconSpeaker size={14} />
      </button>
    );
  }

  const handleClick = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isPlaying) {
      stop();
    } else {
      const resolvedLang = lang || detectLanguage(trimmed) || undefined;
      play(trimmed, resolvedLang);
    }
  };

  return (
    <button
      aria-label={isPlaying ? "Stop pronunciation" : "Play pronunciation"}
      onClick={handleClick}
      style={{
        border: 0,
        borderRadius: "50%",
        width: "32px",
        height: "32px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: isPlaying ? "#d1d1d6" : "#e5f1ff",
        color: isPlaying ? "#3a3a3c" : "#007aff",
        cursor: "pointer",
        flexShrink: 0,
      }}
      type="button"
    >
      {isPlaying ? (
        <span style={{ fontSize: "14px", lineHeight: 1, fontWeight: 700 }}>■</span>
      ) : (
        <IconSpeaker size={14} />
      )}
    </button>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/PronunciationButton.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/PronunciationButton.tsx src/components/PronunciationButton.test.tsx
git commit -m "feat: add PronunciationButton component"
```

---

### Task 5: Add pronunciation button to CardComposer (Front field)

**Files:**
- Modify: `src/features/cards/CardComposer.tsx` (lines 251-261)
- Modify: `src/features/cards/CardComposer.test.tsx` (add test)

- [ ] **Step 1: Write the failing test**

Add to `src/features/cards/CardComposer.test.tsx` (before the closing `}` of the last test, or at file end):
```tsx
test("offers a pronunciation button beside the Front label", () => {
  renderComposer();
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
});
```

Run: `npx vitest run src/features/cards/CardComposer.test.tsx -t "pronunciation"`
Expected: FAIL — no button with that name

- [ ] **Step 2: Modify the Front label in CardComposer**

In `src/features/cards/CardComposer.tsx`, change lines 251-261 from:
```tsx
        <label style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          Front
          <textarea
```

To:
```tsx
        <label style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            Front
            <PronunciationButton text={front} />
          </span>
          <textarea
```

Add the import at the top:
```tsx
import { PronunciationButton } from "../../components/PronunciationButton";
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/features/cards/CardComposer.test.tsx`
Expected: All existing tests PASS + new test PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/cards/CardComposer.tsx src/features/cards/CardComposer.test.tsx
git commit -m "feat: add pronunciation button to card composer Front field"
```

---

### Task 6: Add pronunciation button to CardSelectionToolbar

**Files:**
- Modify: `src/features/reader/CardSelectionToolbar.tsx` (before Dismiss button)
- Modify: `src/features/reader/CardSelectionToolbar.test.tsx` (add test)

- [ ] **Step 1: Write the failing test**

Replace the existing test in `src/features/reader/CardSelectionToolbar.test.tsx`:
```tsx
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
    (text: string) => ({ text, lang: "" })
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
```

Run: `npx vitest run src/features/reader/CardSelectionToolbar.test.tsx -t "pronunciation"`
Expected: FAIL

- [ ] **Step 2: Modify CardSelectionToolbar**

In `src/features/reader/CardSelectionToolbar.tsx`, add import:
```tsx
import { PronunciationButton } from "../components/PronunciationButton";
```

Add the PronunciationButton inside the button group `<div>` (before the Dismiss button), on line 48:
```tsx
      <div style={{ display: "flex", flex: "0 0 auto", gap: "8px" }}>
        <PronunciationButton text={quote} />  {/* ← add this line */}
        <button
          aria-label="Dismiss"
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/features/reader/CardSelectionToolbar.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/reader/CardSelectionToolbar.tsx src/features/reader/CardSelectionToolbar.test.tsx
git commit -m "feat: add pronunciation button to selected-text toolbar"
```

---

### Task 7: Add pronunciation button to ReviewPage (front face)

**Files:**
- Modify: `src/features/review/ReviewPage.tsx` (front face + back face front text)
- Modify: `src/features/review/ReviewPage.test.tsx` (add test)

- [ ] **Step 1: Write the failing test**

Add to `src/features/review/ReviewPage.test.tsx`:
```tsx
test("shows pronunciation control on the front face", () => {
  render(<ReviewPage cards={[card]} previews={{}} onRate={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
});
```

Run: `npx vitest run src/features/review/ReviewPage.test.tsx -t "pronunciation"`
Expected: FAIL

- [ ] **Step 2: Modify ReviewPage front face**

In `src/features/review/ReviewPage.tsx`, add import:
```tsx
import { PronunciationButton } from "../../components/PronunciationButton";
import { detectLanguage } from "../../lib/language";
```

Change the front face rendering (lines 155-159) to:
```tsx
          <div className="review-page__card-face review-page__card-face--front">
            <div className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <div className="review-page__content">{card.front}</div>
                <PronunciationButton text={card.front} lang={detectLanguage(card.front)} />
              </div>
            </div>
            <div className="review-page__flip-hint">Tap to flip</div>
          </div>
```

Change the back face front text (lines 162-165) — the spec says the control should appear "directly after the front text... on both the front and revealed back face":
```tsx
          <div className="review-page__card-face review-page__card-face--back">
            <div className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <div className="review-page__content review-page__content--small">{card.front}</div>
                <PronunciationButton text={card.front} lang={detectLanguage(card.front)} />
              </div>
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/features/review/ReviewPage.test.tsx`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/review/ReviewPage.tsx src/features/review/ReviewPage.test.tsx
git commit -m "feat: add pronunciation button to review card faces"
```

---

### Task 8: TypeScript build check and final verification

**Files:** (none)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (113 → 120+ tests)

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run production build**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "feat: add pronunciation controls to card composer, toolbar, and review"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Circular speaker control beside Front field label in composer | Task 5 |
| Speaker control in selected-text toolbar before Dismiss | Task 6 |
| Speaker control after front text on both faces in review | Task 7 |
| No speaker on back text | Task 7 (only front text gets it) |
| Accessible name "Play pronunciation" / "Stop pronunciation" | Task 4 |
| Click idle → cancel + read; click playing → stop | Task 3 (hook) |
| Use known front language; fall back to detectLanguage; no lang → default | Task 4 (PronunciationButton resolves) |
| Empty/whitespace text → no playback | Task 4 (trim check) |
| Unavailable Web Speech API → disabled with tooltip | Task 4 |
| Component cleanup cancels utterance | Task 3 (useEffect return) |
| Icon-only speaker control | Task 1 (IconSpeaker) + Task 4 |
| Unit-test helper against mocked browser speech API | Task 3 |
| Component tests verify accessible speaker controls | Tasks 5-7 |
