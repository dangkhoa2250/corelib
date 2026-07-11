# Flashcard Pronunciation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow learners to play or stop system text-to-speech for a flashcard's front text while composing, selecting text in the reader, and reviewing either card face.

**Architecture:** Add a small browser-only pronunciation controller that owns Web Speech API feature detection and the single active utterance. A reusable `PronunciationButton` consumes that controller and stops click propagation; the composer, selection toolbar, and review view provide the text and language they already know. No audio data is stored and no Tauri/backend code changes are needed.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, browser Web Speech API (`speechSynthesis`, `SpeechSynthesisUtterance`).

---

## File map

| File | Responsibility |
| --- | --- |
| `apps/desktop/src/lib/pronunciation.ts` | Feature detection and lifecycle for the one active browser speech utterance. |
| `apps/desktop/src/lib/pronunciation.test.ts` | Mocked Web Speech API tests for the controller. |
| `apps/desktop/src/components/PronunciationButton.tsx` | Reusable accessible circular speaker button and its component-local active state. |
| `apps/desktop/src/components/PronunciationButton.test.tsx` | Button semantics and interaction tests. |
| `apps/desktop/src/features/cards/CardComposer.tsx` | Speaker beside the Front field label, reading the current draft front text. |
| `apps/desktop/src/features/cards/CardComposer.test.tsx` | Composer integration test that the control reads current front text without saving. |
| `apps/desktop/src/features/reader/CardSelectionToolbar.tsx` | Speaker before Dismiss, reading selected text. |
| `apps/desktop/src/features/reader/CardSelectionToolbar.test.tsx` | Toolbar integration test that playback does not dismiss or create. |
| `apps/desktop/src/features/review/ReviewPage.tsx` | Speaker directly after Front text on front and revealed back card faces. |
| `apps/desktop/src/features/review/ReviewPage.test.tsx` | Review integration test that playback does not flip/rate the card. |

### Task 1: Build and prove the Web Speech controller

**Files:**
- Create: `apps/desktop/src/lib/pronunciation.ts`
- Create: `apps/desktop/src/lib/pronunciation.test.ts`

- [ ] **Step 1: Write the failing controller tests**

```ts
import { afterEach, expect, test, vi } from "vitest";
import { startPronunciation } from "./pronunciation";

const cancel = vi.fn();
const speak = vi.fn();

class MockUtterance {
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

afterEach(() => vi.unstubAllGlobals());

function installSpeechApi() {
  cancel.mockReset();
  speak.mockReset();
  vi.stubGlobal("speechSynthesis", { cancel, speak });
  vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
}

test("starts an utterance with the supplied text and language", () => {
  installSpeechApi();
  const setPlaying = vi.fn();

  const stop = startPronunciation("Algorithms", "en", setPlaying);

  expect(stop).toEqual(expect.any(Function));
  expect(cancel).toHaveBeenCalledOnce();
  expect(speak).toHaveBeenCalledOnce();
  expect(speak.mock.calls[0][0]).toMatchObject({ text: "Algorithms", lang: "en" });
  expect(setPlaying).toHaveBeenCalledWith(true);
});

test("stops the active utterance before replacing it", () => {
  installSpeechApi();
  const firstState = vi.fn();
  const secondState = vi.fn();
  startPronunciation("first", "en", firstState);

  startPronunciation("second", "vi", secondState);

  expect(cancel).toHaveBeenCalledTimes(2);
  expect(firstState).toHaveBeenLastCalledWith(false);
  expect(speak.mock.calls[1][0]).toMatchObject({ text: "second", lang: "vi" });
});

test("returns null without calling speech APIs for blank text or unsupported browsers", () => {
  installSpeechApi();
  expect(startPronunciation("   ", "en", vi.fn())).toBeNull();
  vi.unstubAllGlobals();
  expect(startPronunciation("Algorithms", "en", vi.fn())).toBeNull();
  expect(speak).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the controller tests and verify they fail because the module is absent**

Run: `npm test -- src/lib/pronunciation.test.ts`

Expected: FAIL with `Failed to resolve import "./pronunciation"`.

- [ ] **Step 3: Implement the minimal controller**

```ts
export type PronunciationStateChange = (isPlaying: boolean) => void;

let activeStop: (() => void) | null = null;

function isSpeechSupported(): boolean {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && "SpeechSynthesisUtterance" in window;
}

export function startPronunciation(
  text: string,
  language: string | null,
  onStateChange: PronunciationStateChange,
): (() => void) | null {
  const normalizedText = text.trim();
  if (!normalizedText || !isSpeechSupported()) return null;

  activeStop?.();
  const utterance = new SpeechSynthesisUtterance(normalizedText);
  if (language) utterance.lang = language;

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (activeStop === stop) activeStop = null;
    window.speechSynthesis.cancel();
    onStateChange(false);
  };
  const finish = () => {
    if (stopped) return;
    stopped = true;
    if (activeStop === stop) activeStop = null;
    onStateChange(false);
  };

  utterance.onend = finish;
  utterance.onerror = finish;
  activeStop = stop;
  onStateChange(true);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return stop;
}

export function pronunciationSupported(): boolean {
  return isSpeechSupported();
}
```

- [ ] **Step 4: Run the controller tests and verify they pass**

Run: `npm test -- src/lib/pronunciation.test.ts`

Expected: PASS; 3 tests pass.

- [ ] **Step 5: Commit the controller**

```bash
git add apps/desktop/src/lib/pronunciation.ts apps/desktop/src/lib/pronunciation.test.ts
git commit -m "feat: add browser pronunciation controller"
```

### Task 2: Add an accessible reusable speaker button

**Files:**
- Create: `apps/desktop/src/components/PronunciationButton.tsx`
- Create: `apps/desktop/src/components/PronunciationButton.test.tsx`

- [ ] **Step 1: Write the failing button tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { PronunciationButton } from "./PronunciationButton";

const { supported, startPronunciation } = vi.hoisted(() => ({
  supported: { current: true },
  startPronunciation: vi.fn(() => vi.fn()),
}));

vi.mock("../lib/pronunciation", () => ({
  pronunciationSupported: () => supported.current,
  startPronunciation,
}));

test("starts pronunciation and prevents a parent click", async () => {
  const user = userEvent.setup();
  const parentClick = vi.fn();
  render(<div onClick={parentClick}><PronunciationButton text="Algorithms" language="en" /></div>);

  await user.click(screen.getByRole("button", { name: "Play pronunciation" }));

  expect(startPronunciation).toHaveBeenCalledWith("Algorithms", "en", expect.any(Function));
  expect(parentClick).not.toHaveBeenCalled();
});

test("is disabled when speech is not supported", () => {
  supported.current = false;
  render(<PronunciationButton text="Algorithms" language="en" />);
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeDisabled();
  supported.current = true;
});
```

- [ ] **Step 2: Run the button tests and verify they fail because the component is absent**

Run: `npm test -- src/components/PronunciationButton.test.tsx`

Expected: FAIL with `Failed to resolve import "./PronunciationButton"`.

- [ ] **Step 3: Implement the button**

```tsx
import { useEffect, useRef, useState } from "react";
import { pronunciationSupported, startPronunciation } from "../lib/pronunciation";

interface PronunciationButtonProps {
  text: string;
  language: string | null;
}

export function PronunciationButton({ text, language }: PronunciationButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const supported = pronunciationSupported();
  const disabled = !supported || !text.trim();

  useEffect(() => () => stopRef.current?.(), []);

  return (
    <button
      aria-label={isPlaying ? "Stop pronunciation" : "Play pronunciation"}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (stopRef.current) {
          stopRef.current();
          stopRef.current = null;
          return;
        }
        stopRef.current = startPronunciation(text, language, (playing) => {
          setIsPlaying(playing);
          if (!playing) stopRef.current = null;
        });
      }}
      title={supported ? (isPlaying ? "Stop pronunciation" : "Play pronunciation") : "Pronunciation is unavailable on this device"}
      type="button"
      style={{ border: 0, borderRadius: "50%", width: "38px", height: "38px", background: "#e5f1ff", color: "#007aff", cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <span aria-hidden="true">{isPlaying ? "■" : "🔊"}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run button tests and repair the unsupported-browser test until both pass**

Run: `npm test -- src/components/PronunciationButton.test.tsx`

Expected: PASS; the start/propagation and disabled assertions both pass.

- [ ] **Step 5: Commit the shared UI component**

```bash
git add apps/desktop/src/components/PronunciationButton.tsx apps/desktop/src/components/PronunciationButton.test.tsx
git commit -m "feat: add pronunciation button"
```

### Task 3: Surface pronunciation in composing and reader selection

**Files:**
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx`
- Modify: `apps/desktop/src/features/cards/CardComposer.test.tsx`
- Modify: `apps/desktop/src/features/reader/CardSelectionToolbar.tsx`
- Modify: `apps/desktop/src/features/reader/CardSelectionToolbar.test.tsx`

- [ ] **Step 1: Add failing integration tests**

```tsx
const { startPronunciation } = vi.hoisted(() => ({ startPronunciation: vi.fn(() => vi.fn()) }));
vi.mock("../../lib/pronunciation", () => ({
  pronunciationSupported: () => true,
  startPronunciation,
}));

test("plays the current front text without submitting the composer", async () => {
  const { user, onSave } = renderComposer();
  await user.clear(screen.getByRole("textbox", { name: "Front" }));
  await user.type(screen.getByRole("textbox", { name: "Front" }), "Algorithms");

  await user.click(screen.getByRole("button", { name: "Play pronunciation" }));

  expect(startPronunciation).toHaveBeenCalledWith("Algorithms", "en", expect.any(Function));
  expect(onSave).not.toHaveBeenCalled();
});
```

```tsx
const { startPronunciation } = vi.hoisted(() => ({ startPronunciation: vi.fn(() => vi.fn()) }));
vi.mock("../../lib/pronunciation", () => ({
  pronunciationSupported: () => true,
  startPronunciation,
}));

test("plays selected text without dismissing or creating a flashcard", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  const onDismiss = vi.fn();
  render(<CardSelectionToolbar quote="Algorithms" onCreate={onCreate} onDismiss={onDismiss} />);

  await user.click(screen.getByRole("button", { name: "Play pronunciation" }));

  expect(startPronunciation).toHaveBeenCalledWith("Algorithms", "en", expect.any(Function));
  expect(onCreate).not.toHaveBeenCalled();
  expect(onDismiss).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused integration tests and verify they fail because the control is missing**

Run: `npm test -- src/features/cards/CardComposer.test.tsx src/features/reader/CardSelectionToolbar.test.tsx`

Expected: FAIL with `Unable to find role="button" and name "Play pronunciation"`.

- [ ] **Step 3: Add the controls with the existing detected language**

In `CardComposer.tsx`, import `PronunciationButton` and change the Front label header to:

```tsx
<span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
  Front
  <PronunciationButton text={front} language={frontLanguage} />
</span>
```

In `CardSelectionToolbar.tsx`, import `detectLanguage` and `PronunciationButton`, then insert this as the first child of the existing button group:

```tsx
<PronunciationButton text={quote} language={detectLanguage(quote)} />
```

Keep the existing Dismiss and Create handlers and their ordering after this new control unchanged.

- [ ] **Step 4: Run the focused integration tests and verify they pass**

Run: `npm test -- src/features/cards/CardComposer.test.tsx src/features/reader/CardSelectionToolbar.test.tsx`

Expected: PASS; existing tests remain green and the two new tests pass.

- [ ] **Step 5: Commit the compose/reader integration**

```bash
git add apps/desktop/src/features/cards/CardComposer.tsx apps/desktop/src/features/cards/CardComposer.test.tsx apps/desktop/src/features/reader/CardSelectionToolbar.tsx apps/desktop/src/features/reader/CardSelectionToolbar.test.tsx
git commit -m "feat: play flashcard source text while creating"
```

### Task 4: Surface pronunciation on both review faces

**Files:**
- Modify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`

- [ ] **Step 1: Write the failing review test**

```tsx
const { startPronunciation } = vi.hoisted(() => ({ startPronunciation: vi.fn(() => vi.fn()) }));
vi.mock("../../lib/pronunciation", () => ({
  pronunciationSupported: () => true,
  startPronunciation,
}));

test("plays the front text from either face without flipping or rating", async () => {
  const user = userEvent.setup();
  const onRate = vi.fn().mockResolvedValue(undefined);
  render(<ReviewPage cards={[{ ...card, frontLanguage: "en" }]} previews={{}} onRate={onRate} />);

  await user.click(screen.getByRole("button", { name: "Play pronunciation" }));
  expect(startPronunciation).toHaveBeenCalledWith("bonjour", "en", expect.any(Function));
  expect(screen.queryByRole("group", { name: "Rate card" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Play pronunciation" }));
  expect(startPronunciation).toHaveBeenLastCalledWith("bonjour", "en", expect.any(Function));
  expect(onRate).not.toHaveBeenCalled();
  expect(screen.getByText("hello")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the review test and verify it fails because no speaker exists**

Run: `npm test -- src/features/review/ReviewPage.test.tsx`

Expected: FAIL with `Unable to find role="button" and name "Play pronunciation"`.

- [ ] **Step 3: Render the speaker directly after Front content on both faces**

Import `PronunciationButton` in `ReviewPage.tsx`. Wrap the Front content on each face in a flex container so the control follows the text:

```tsx
<div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
  <div className="review-page__content" style={{ flex: "1 1 auto" }}>
    <ClickableFrontText
      text={card.front}
      frontLanguage={card.frontLanguage}
      selectedWord={selectedWord}
      onWordSelect={(word) => {
        setSelectedWord(word);
        setShowYouGlish(true);
      }}
    />
  </div>
  <PronunciationButton text={card.front} language={card.frontLanguage} />
</div>
```

Replace the revealed face's current Front content with this exact wrapper. Do not add a button beside `card.back`.

```tsx
<div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
  <div className="review-page__content review-page__content--small" style={{ flex: "1 1 auto" }}>
    {card.front}
  </div>
  <PronunciationButton text={card.front} language={card.frontLanguage} />
</div>
```

Leave the existing `ClickableFrontText` word-selection callback in the front face exactly as shown above.

- [ ] **Step 4: Run the review test file and verify it passes**

Run: `npm test -- src/features/review/ReviewPage.test.tsx`

Expected: PASS; the new test and all existing review tests pass.

- [ ] **Step 5: Commit the review integration**

```bash
git add apps/desktop/src/features/review/ReviewPage.tsx apps/desktop/src/features/review/ReviewPage.test.tsx
git commit -m "feat: play pronunciation during flashcard review"
```

### Task 5: Full verification and manual acceptance

**Files:**
- Verify only; do not edit unrelated files.

- [ ] **Step 1: Run all affected unit/component tests**

Run:

```bash
npm test -- src/lib/pronunciation.test.ts src/components/PronunciationButton.test.tsx src/features/cards/CardComposer.test.tsx src/features/reader/CardSelectionToolbar.test.tsx src/features/review/ReviewPage.test.tsx
```

Expected: PASS with no failing test and no unhandled promise rejection.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: exit code 0; TypeScript has no errors and Vite writes the production bundle.

- [ ] **Step 3: Perform desktop manual acceptance**

Run: `npm run tauri`

Verify each condition on macOS:

1. Select `Algorithms` in a document, click the new speaker, and hear it without the toolbar disappearing.
2. Click `Dismiss` and `Create flashcard` afterward; both retain their original behavior.
3. In Create flashcard, edit Front to `Algorithms`, click its speaker, and hear the edited text without saving the draft.
4. In review, click the speaker on the front face, flip the card, and click the speaker beside Front again. Both reads speak `Algorithms`; no speaker appears beside `Thuật toán`.
5. While audio is playing, click the same button; playback stops and the accessible label returns to `Play pronunciation`.
6. While audio is playing, start another one; the first stops before the second begins.

- [ ] **Step 4: Commit the verification-ready feature only if every check passed**

```bash
git status --short
```

Expected: no unintended files. If the four feature commits are already present and the working tree is clean for these files, do not create an empty commit.

## Plan self-review

- Spec coverage: Tasks 1–2 cover system TTS, unsupported behavior, cancellation and accessibility. Task 3 covers composer and reader selection. Task 4 covers both review faces and deliberately excludes Back. Task 5 covers automated and desktop acceptance conditions.
- Placeholder scan: the plan contains no deferred implementation requirement; all test assertions and implementation snippets are concrete.
- Type consistency: `startPronunciation(text, language, onStateChange)` and `PronunciationButton text/language` use the same `string | null` language contract across all consumers.
