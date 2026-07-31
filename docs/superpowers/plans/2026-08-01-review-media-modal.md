# Review Media Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Review source split pane and below-card YouGlish player with one accessible, content-sized modal system shared by Study and Practice.

**Architecture:** `ReviewSessionSurface` will own one discriminated `activeMedia` state and render either `SourceViewer` or `YouGlishPanel` inside a portaled `ReviewMediaModal`. The modal shell owns backdrop dismissal, focus trapping/restoration, background inertness, reduced-motion-aware transitions, and content-size variants; the two media components retain only their specialized loading and rendering behavior.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Testing Library, PDF.js, Tauri 2/WKWebView, project `ScrollArea`.

---

## Execution preflight

- Execute from a dedicated `codex/` worktree created with `superpowers:using-git-worktrees`; do not reuse the dirty main checkout.
- Before changing the PDF modal or its scrolling CSS, read and follow `.agents/skills/checking-scroll-surfaces/SKILL.md` completely.
- Do not load `checking-command-registration`: this change alters existing Review triggers and adds no public page, route, command, navigation destination, or action.
- Preserve unrelated lockfile changes from the original workspace.

## File map

- Create `apps/desktop/src/features/review/ReviewMediaModal.tsx`: generic portal, modal lifecycle, focus, inert background, dismissal, and content-size variant.
- Create `apps/desktop/src/features/review/ReviewMediaModal.test.tsx`: focused behavior tests for the modal primitive.
- Modify `apps/desktop/src/features/review/ReviewSessionSurface.tsx`: replace three presentation flags with one media union and render modal content.
- Modify `apps/desktop/src/features/review/ReviewPage.test.tsx`: shared Review integration, lifecycle, focus restoration, and timer regression tests.
- Modify `apps/desktop/src/features/review/YouGlishPanel.tsx`: remove panel-owned title/close chrome and expose modal content classes.
- Modify `apps/desktop/src/features/review/YouGlishPanel.test.tsx`: assert iframe sizing/error/attribution without duplicate modal chrome.
- Modify `apps/desktop/src/features/cards/SourceViewer.tsx`: add modal presentation, retain page/match toolbar, and add the required `ScrollArea` content inset wrapper.
- Modify `apps/desktop/src/features/cards/SourceViewer.test.ts`: protect panel/modal chrome and scroll-surface structure.
- Modify `apps/desktop/src/styles/tokens.css`: modal sizes, backdrop, media chrome, reduced motion, and removal of obsolete Review split/video rules.
- Modify `apps/desktop/src/styles/tokens.test.ts`: content-size, viewport, reduced-motion, `ScrollArea`, and 20px inset assertions.

### Task 1: Build the accessible shared modal shell

**Files:**
- Create: `apps/desktop/src/features/review/ReviewMediaModal.test.tsx`
- Create: `apps/desktop/src/features/review/ReviewMediaModal.tsx`

- [ ] **Step 1: Write the failing modal behavior tests**

Create `ReviewMediaModal.test.tsx` with a harness that proves initial focus, focus wrapping, background inertness, safe content clicks, all dismissal paths, delayed motion, and focus restoration:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";
import { ReviewMediaModal } from "./ReviewMediaModal";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open media</button>
      <button type="button">Background action</button>
      {open ? (
        <ReviewMediaModal kind="video" title="Pronunciation for algorithm" onClose={() => setOpen(false)}>
          <button type="button">First media action</button>
          <button type="button">Last media action</button>
        </ReviewMediaModal>
      ) : null}
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("traps focus, makes the background inert, and restores the trigger", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open media" });
  await user.click(trigger);

  expect(screen.getByRole("dialog", { name: "Pronunciation for algorithm" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close Pronunciation for algorithm" })).toHaveFocus();
  expect((container as HTMLElement).inert).toBe(true);
  expect(container).toHaveAttribute("aria-hidden", "true");

  await user.tab();
  expect(screen.getByRole("button", { name: "First media action" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Last media action" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Close Pronunciation for algorithm" })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect((container as HTMLElement).inert).toBe(false);
  expect(container).not.toHaveAttribute("aria-hidden");
  expect(trigger).toHaveFocus();
});

test("does not dismiss from content, but dismisses a pointer gesture wholly on the backdrop", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Open media" }));
  await user.click(screen.getByRole("button", { name: "First media action" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  const backdrop = screen.getByTestId("review-media-modal-backdrop");
  fireEvent.pointerDown(backdrop);
  fireEvent.pointerUp(backdrop);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("plays the 120ms closing state unless reduced motion is requested", () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Open media" }));
  fireEvent.click(screen.getByRole("button", { name: "Close Pronunciation for algorithm" }));

  expect(screen.getByTestId("review-media-modal-backdrop")).toHaveClass("is-closing");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(120));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run:

```bash
cd apps/desktop
npm test -- src/features/review/ReviewMediaModal.test.tsx
```

Expected: FAIL because `./ReviewMediaModal` does not exist.

- [ ] **Step 3: Implement the minimal modal shell**

Create `ReviewMediaModal.tsx` with this public interface and behavior:

```tsx
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");
const CLOSE_TRANSITION_MS = 120;

interface ReviewMediaModalProps {
  children: ReactNode;
  kind: "pdf" | "video";
  onClose: () => void;
  title: string;
}

interface BackgroundState {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}

export function ReviewMediaModal({ children, kind, onClose, title }: ReviewMediaModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pointerStartedOnBackdropRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [portalHost] = useState(() => document.createElement("div"));
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    portalHost.className = "review-media-modal-root";
    document.body.appendChild(portalHost);
    const background: BackgroundState[] = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== portalHost)
      .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") }));

    background.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    closeRef.current?.focus();

    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      background.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      portalHost.remove();
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLElement>(".review-page__card")?.focus();
    };
  }, [portalHost]);

  const requestClose = () => {
    if (closing) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
    if (reduceMotion) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, CLOSE_TRANSITION_MS);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={`review-media-modal__backdrop${closing ? " is-closing" : ""}`}
      data-testid="review-media-modal-backdrop"
      onKeyDown={handleKeyDown}
      onPointerCancel={() => { pointerStartedOnBackdropRef.current = false; }}
      onPointerDown={(event) => {
        pointerStartedOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        const shouldClose = pointerStartedOnBackdropRef.current && event.target === event.currentTarget;
        pointerStartedOnBackdropRef.current = false;
        if (shouldClose) requestClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`review-media-modal__dialog review-media-modal__dialog--${kind}`}
        ref={dialogRef}
        role="dialog"
      >
        <header className="review-media-modal__header">
          <h2 id={titleId}>{title}</h2>
          <button
            aria-label={`Close ${title}`}
            className="review-media-modal__close"
            onClick={requestClose}
            ref={closeRef}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="review-media-modal__body">{children}</div>
      </section>
    </div>,
    portalHost,
  );
}
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run `npm test -- src/features/review/ReviewMediaModal.test.tsx` from `apps/desktop`.

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the modal primitive**

```bash
git add apps/desktop/src/features/review/ReviewMediaModal.tsx apps/desktop/src/features/review/ReviewMediaModal.test.tsx
git commit -m "feat: add accessible review media modal"
```

### Task 2: Make PDF and YouGlish content modal-compatible

**Files:**
- Modify: `apps/desktop/src/features/cards/SourceViewer.tsx:14-20,137,408-459`
- Modify: `apps/desktop/src/features/cards/SourceViewer.test.ts`
- Modify: `apps/desktop/src/features/review/YouGlishPanel.tsx:4-8,17,53-117`
- Modify: `apps/desktop/src/features/review/YouGlishPanel.test.tsx`

- [ ] **Step 1: Add failing chrome-ownership tests**

Append to `SourceViewer.test.ts`:

```ts
test("supports modal chrome without duplicating the title or close control", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const viewer = readFileSync(join(currentDir, "SourceViewer.tsx"), "utf8");

  expect(viewer).toContain('presentation = "panel"');
  expect(viewer).toContain('source-viewer--${presentation}');
  expect(viewer).toContain('presentation === "panel"');
  expect(viewer).toContain('className="source-viewer__pdf-content"');
});
```

Update every `YouGlishPanel` render in `YouGlishPanel.test.tsx` to omit `onClose`, then add:

```tsx
test("leaves title and dismissal chrome to the shared modal", () => {
  render(<YouGlishPanel word="Algorithms" frontLanguage="en" />);
  expect(screen.queryByRole("button", { name: /Close YouGlish/i })).not.toBeInTheDocument();
  expect(screen.getByTestId("youglish-panel")).toBeInTheDocument();
  expect(screen.getByText("YouGlish.com")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the media tests to verify RED**

Run:

```bash
npm test -- src/features/cards/SourceViewer.test.ts src/features/review/YouGlishPanel.test.tsx
```

Expected: FAIL because neither component exposes modal-owned chrome yet.

- [ ] **Step 3: Add the `SourceViewer` presentation boundary**

Change its props and signature to:

```tsx
export interface SourceViewerProps {
  source: CardSource;
  getDocumentFileUrl: (id: string) => Promise<string>;
  onClose?: () => void;
  presentation?: "panel" | "modal";
}

export function SourceViewer({
  source,
  getDocumentFileUrl,
  onClose,
  presentation = "panel",
}: SourceViewerProps) {
```

Replace the returned chrome with this structure while preserving all existing match expressions and handlers inside the indicated positions:

```tsx
<section className={`source-viewer source-viewer--${presentation}`} aria-label="Card source PDF">
  <header className="source-viewer__header">
    {presentation === "panel" ? <h3 className="source-viewer__title">Source</h3> : null}
    <span className="source-viewer__page-label">Page {currentPage}</span>
    {hasQuery && matchCount > 0 ? (
      <div className="source-viewer__match-nav">
        <span className="source-viewer__match-count">{currentMatchIndex + 1}/{matchCount}</span>
        <button
          type="button"
          className="source-viewer__match-btn"
          onClick={() => goToMatch(-1)}
          aria-label="Previous match"
        >
          ‹
        </button>
        <button
          type="button"
          className="source-viewer__match-btn"
          onClick={() => goToMatch(1)}
          aria-label="Next match"
        >
          ›
        </button>
      </div>
    ) : null}
    {hasQuery && searching ? <span className="source-viewer__match-searching">Searching…</span> : null}
    {hasQuery && searched && !searching && matchCount === 0 ? (
      <span className="source-viewer__match-empty">Not found</span>
    ) : null}
    {presentation === "panel" && onClose ? (
      <button
        type="button"
        className="source-viewer__close-btn"
        onClick={onClose}
        aria-label="Close source viewer"
      >
        ×
      </button>
    ) : null}
  </header>
  <div className="source-viewer__page">
    {loading && <div className="source-viewer__loading">Loading PDF…</div>}
    {error && <div className="source-viewer__error">{error}</div>}
    <ScrollArea ref={containerRef} className="source-viewer__pdf-container" style={{ position: "absolute", inset: 0 }}>
      <div className="source-viewer__pdf-content">
        <div ref={viewerRef} className="pdfViewer" />
      </div>
    </ScrollArea>
  </div>
</section>
```

Do not alter PDF loading, search concurrency, page anchoring, highlight cleanup, or `pdfDoc.destroy()`.

- [ ] **Step 4: Strip duplicate chrome from `YouGlishPanel`**

Change the props to `word: string` and remove `onClose`. Replace only its returned markup with class-based modal content:

```tsx
return (
  <section className="youglish-panel" data-testid="youglish-panel">
    {languageName ? (
      <div
        className="youglish-panel__viewport"
        data-testid="youglish-video-viewport"
        style={{ "--youglish-viewport-height": `${viewportHeight}px` } as CSSProperties}
      >
        <iframe
          allow="autoplay"
          className="youglish-panel__iframe"
          data-youglish-id={widgetId}
          src={youGlishEmbedUrl(word, languageName, widgetId)}
          title={`YouGlish pronunciation for ${word}`}
        />
      </div>
    ) : (
      <div className="youglish-panel__error" role="alert">
        {!frontLanguage
          ? "No confirmed front language. Choose the front language in card edit to use YouGlish."
          : `Unsupported front language "${frontLanguage}". Choose a supported language in card edit to use YouGlish.`}
      </div>
    )}
    <footer className="youglish-panel__attribution">
      Powered by&nbsp;
      <a href="https://youglish.com" target="_blank" rel="noreferrer">YouGlish.com</a>
    </footer>
  </section>
);
```

Add `type CSSProperties` to the React import so the custom-property cast above compiles without a default React import.

- [ ] **Step 5: Run the media tests to verify GREEN**

Run `npm test -- src/features/cards/SourceViewer.test.ts src/features/review/YouGlishPanel.test.tsx`.

Expected: all tests in both files PASS.

- [ ] **Step 6: Commit specialized media content**

```bash
git add apps/desktop/src/features/cards/SourceViewer.tsx apps/desktop/src/features/cards/SourceViewer.test.ts apps/desktop/src/features/review/YouGlishPanel.tsx apps/desktop/src/features/review/YouGlishPanel.test.tsx
git commit -m "refactor: prepare review media for modal display"
```

### Task 3: Wire one media state into the shared Review surface

**Files:**
- Modify: `apps/desktop/src/features/review/ReviewSessionSurface.tsx:1-155`
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx:145-180,372-430,480-510`

- [ ] **Step 1: Replace obsolete integration expectations with failing modal expectations**

Delete the tests named `practice keeps an open YouGlish panel visible when the card flips`, `uses the compact review layout while a YouGlish video is open`, `uses the app scroll area for review content while a YouGlish video is open`, and `places rating controls before an open YouGlish video`.

Add these focused tests to `ReviewPage.test.tsx`:

```tsx
test("practice opens the source PDF in a modal and returns to the same flipped card", async () => {
  const user = userEvent.setup();
  const sourcedCard: LearningCard = {
    ...card,
    source: { documentId: "linear-algebra", page: 3, quote: "A vector space has a basis.", rects: [] },
  };
  const pendingUrl = new Promise<string>(() => undefined);
  const { container } = render(
    <ReviewPage mode="practice" cards={[sourcedCard]} getDocumentFileUrl={vi.fn(() => pendingUrl)} />,
  );
  const flashcard = screen.getByRole("button", { name: "Flashcard" });
  await user.click(flashcard);
  const sourceTrigger = screen.getAllByRole("button", { name: "View source" })[1];
  await user.click(sourceTrigger);

  expect(screen.getByRole("dialog", { name: "Source PDF" })).toBeInTheDocument();
  expect(screen.getByLabelText("Card source PDF")).toHaveClass("source-viewer--modal");
  expect(container.querySelector(".review-page__split--with-source")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Close Source PDF" }));
  expect(flashcard).toHaveClass("review-page__card--flipped");
  expect(sourceTrigger).toHaveFocus();
});

test("study opens a selected word in a video modal and clears the highlight on close", async () => {
  const user = userEvent.setup();
  const languageCard = { ...card, frontLanguage: "en" };
  render(
    <ReviewPage
      mode="study"
      session={{ ...studySession, cards: [{ ...grant, card: languageCard }] }}
      onRate={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  const wordTrigger = screen.getAllByRole("button", { name: "Hear 'bonjour' in YouGlish" })[0];
  await user.click(wordTrigger);

  expect(screen.getByRole("dialog", { name: "Pronunciation for ‘bonjour’" })).toBeInTheDocument();
  expect(screen.getByTitle("YouGlish pronunciation for bonjour")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Close Pronunciation for ‘bonjour’" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(wordTrigger).toHaveFocus();
  expect(wordTrigger).not.toHaveStyle({ background: "rgba(14, 165, 233, 0.2)" });
});
```

- [ ] **Step 2: Run the Review tests to verify RED**

Run `npm test -- src/features/review/ReviewPage.test.tsx`.

Expected: the new tests FAIL because Review still uses the split pane and below-footer panel.

- [ ] **Step 3: Replace presentation flags with one discriminated state**

In `ReviewSessionSurface.tsx`, import `ReviewMediaModal` and define:

```tsx
type ActiveReviewMedia =
  | { kind: "source"; source: CardSource }
  | { kind: "youglish"; word: string }
  | null;
```

Replace `selectedWord`, `showYouGlish`, and `sourceView` with:

```tsx
const [activeMedia, setActiveMedia] = useState<ActiveReviewMedia>(null);
const selectedWord = activeMedia?.kind === "youglish" ? activeMedia.word : null;
```

Change the existing reset effect to:

```tsx
useEffect(() => {
  setActiveMedia(null);
}, [card.id, refreshCounter]);
```

Change word and source triggers to:

```tsx
onWordSelect={(word) => setActiveMedia({ kind: "youglish", word })}
```

```tsx
<SourceButton source={card.source} onOpen={(source) => setActiveMedia({ kind: "source", source })} />
```

Render a stable single-column Review body, then render exactly one modal branch as a sibling of `review-page__split`:

```tsx
<div className="review-page__split">
  <ScrollArea className="review-page__body" data-testid="review-session-surface">
    {header}
    <ReviewFlashcard
      revealed={revealed}
      onReveal={onReveal}
      front={frontContent(false)}
      backFront={frontContent(true)}
      back={<div className="review-page__content">{card.back}</div>}
    />
    {!card.frontLanguage ? (
      <div className="review-page__language-prompt">
        <span>No confirmed front language. Select a language to enable YouGlish:</span>
        <div className="review-page__language-picker">
          <LanguagePicker
            value={card.frontLanguage}
            onChange={handleSelectLanguage}
            detectedLanguage={detectLanguage(card.front)}
          />
        </div>
      </div>
    ) : null}
    {footer}
  </ScrollArea>
</div>

{activeMedia?.kind === "source" && getDocumentFileUrl ? (
  <ReviewMediaModal kind="pdf" title="Source PDF" onClose={() => setActiveMedia(null)}>
    <SourceViewer
      getDocumentFileUrl={getDocumentFileUrl}
      presentation="modal"
      source={activeMedia.source}
    />
  </ReviewMediaModal>
) : null}

{activeMedia?.kind === "youglish" ? (
  <ReviewMediaModal
    kind="video"
    title={`Pronunciation for ‘${activeMedia.word}’`}
    onClose={() => setActiveMedia(null)}
  >
    <YouGlishPanel frontLanguage={card.frontLanguage} word={activeMedia.word} />
  </ReviewMediaModal>
) : null}
```

- [ ] **Step 4: Run the Review tests to verify GREEN**

Run:

```bash
npm test -- src/features/review/ReviewMediaModal.test.tsx src/features/review/ReviewPage.test.tsx src/features/review/YouGlishPanel.test.tsx
```

Expected: all focused Review tests PASS.

- [ ] **Step 5: Commit the shared Review integration**

```bash
git add apps/desktop/src/features/review/ReviewSessionSurface.tsx apps/desktop/src/features/review/ReviewPage.test.tsx
git commit -m "feat: open review media in focused modals"
```

### Task 4: Add content-aware layout and WKWebView-safe scrolling

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css:3334-3469,3642-3684,3829-3831`
- Modify: `apps/desktop/src/styles/tokens.test.ts:348-410`
- Verify: `apps/desktop/src/features/cards/SourceViewer.tsx`

- [ ] **Step 1: Re-read the required scroll-surface skill before editing CSS**

Run `sed -n '1,360p' ../../.agents/skills/checking-scroll-surfaces/SKILL.md` from `apps/desktop` and confirm the plan uses `ScrollArea`, not a new `overflow:auto` surface, with at least 20px immediate-content padding.

- [ ] **Step 2: Write failing layout and scroll assertions**

Replace the obsolete source-split/video layout tests in `tokens.test.ts` with:

```ts
test("sizes review media modals by content and keeps them inside the viewport", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const backdrop = css.match(/\.review-media-modal__backdrop \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const pdf = css.match(/\.review-media-modal__dialog--pdf \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const video = css.match(/\.review-media-modal__dialog--video \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(backdrop).toContain("position: fixed;");
  expect(backdrop).toContain("inset: 0;");
  expect(pdf).toContain("width: min(1200px, calc(100vw - 48px));");
  expect(pdf).toContain("height: calc(100vh - 48px);");
  expect(video).toContain("width: min(900px, calc(100vw - 48px));");
  expect(video).toContain("max-height: calc(100vh - 48px);");
});

test("keeps the review PDF on ScrollArea with thumb-side content inset", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const sourceViewer = readFileSync(join(currentDir, "../features/cards/SourceViewer.tsx"), "utf8");
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const container = css.match(/\.source-viewer__pdf-container \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const content = css.match(/\.source-viewer__pdf-content \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(sourceViewer).toContain("<ScrollArea");
  expect(sourceViewer).toContain('className="source-viewer__pdf-content"');
  expect(container).not.toContain("overflow: auto;");
  expect(content).toContain("padding-right: 20px;");
});

test("removes nonessential review media motion for reduced-motion users", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const media = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  expect(media).toContain(".review-media-modal__backdrop");
  expect(media).toContain("animation: none;");
  expect(media).toContain("transition: none;");
});
```

- [ ] **Step 3: Run style tests to verify RED**

Run `npm test -- src/styles/tokens.test.ts`.

Expected: FAIL because modal selectors and PDF content inset do not exist.

- [ ] **Step 4: Implement modal, specialized media, and scroll-safe CSS**

Remove `.review-page__split--with-source`, `.review-page__split--with-source .review-page__body`, `.review-page__split > .source-viewer`, `.review-page__split--with-source > .source-viewer`, and `.review-page__body--with-video`. Keep the base `.review-page__split` centered at 720px.

Add these rules, using existing theme tokens only:

```css
.review-media-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--overlay);
  backdrop-filter: blur(3px);
  animation: review-media-modal-in 120ms ease-out;
}

.review-media-modal__backdrop.is-closing {
  opacity: 0;
  transition: opacity 120ms ease-out;
}

.review-media-modal__dialog {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--main-bg);
  box-shadow: var(--shadow-xl);
  color: var(--text-primary);
  animation: review-media-dialog-in 120ms ease-out;
}

.review-media-modal__backdrop.is-closing .review-media-modal__dialog {
  opacity: 0;
  transform: scale(0.98);
  transition: opacity 120ms ease-out, transform 120ms ease-out;
}

.review-media-modal__dialog--pdf {
  width: min(1200px, calc(100vw - 48px));
  height: calc(100vh - 48px);
}

.review-media-modal__dialog--video {
  width: min(900px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
}

.review-media-modal__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.review-media-modal__header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.review-media-modal__close {
  margin-left: auto;
  border: 0;
  border-radius: 6px;
  padding: 2px 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.review-media-modal__close:hover,
.review-media-modal__close:focus-visible {
  background: var(--interactive-hover);
  color: var(--text-primary);
}

.review-media-modal__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.source-viewer--modal {
  min-width: 0;
  border: 0;
  border-radius: 0;
}

.source-viewer__pdf-container {
  position: absolute;
  inset: 0;
}

.source-viewer__pdf-content {
  min-width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  padding-right: 20px;
}

.youglish-panel {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.youglish-panel__viewport {
  height: min(var(--youglish-viewport-height), calc(100vh - 160px));
  min-height: min(480px, calc(100vh - 160px));
  overflow: hidden;
  border-radius: 8px;
  background: var(--surface-1);
}

.youglish-panel__iframe {
  width: 100%;
  height: 1200px;
  border: 0;
  background: var(--surface-1);
}

.youglish-panel__error {
  padding: 12px;
  border-radius: 8px;
  background: var(--color-danger-bg-soft);
  color: var(--warning);
  font-size: 13px;
}

.youglish-panel__attribution {
  display: flex;
  justify-content: flex-end;
  color: var(--text-secondary);
  font-size: 11px;
}

.youglish-panel__attribution a {
  color: inherit;
  text-decoration: underline;
}

@keyframes review-media-modal-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes review-media-dialog-in {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .review-media-modal__backdrop,
  .review-media-modal__dialog,
  .review-media-modal__backdrop.is-closing,
  .review-media-modal__backdrop.is-closing .review-media-modal__dialog {
    animation: none;
    transition: none;
  }
}
```

- [ ] **Step 5: Run focused layout and component tests**

Run:

```bash
npm test -- src/styles/tokens.test.ts src/components/ScrollArea.test.tsx src/features/cards/SourceViewer.test.ts src/features/review/ReviewMediaModal.test.tsx src/features/review/YouGlishPanel.test.tsx src/features/review/ReviewPage.test.tsx
```

Expected: all selected suites PASS; no assertion permits `overflow:auto` on the new modal scroll surface, and the PDF content inset is at least 20px.

- [ ] **Step 6: Commit content-aware modal styling**

```bash
git add apps/desktop/src/styles/tokens.css apps/desktop/src/styles/tokens.test.ts apps/desktop/src/features/cards/SourceViewer.tsx
git commit -m "style: size review media modals by content"
```

### Task 5: Lock down lifecycle, cleanup, and timer semantics

**Files:**
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`
- Verify: `apps/desktop/src/features/review/ReviewSessionSurface.tsx`
- Verify: `apps/desktop/src/features/review/ReviewMediaModal.tsx`

- [ ] **Step 1: Add lifecycle and timing regression tests**

Add to `ReviewPage.test.tsx`:

```tsx
test("closes and disposes YouGlish when the active card changes", async () => {
  const user = userEvent.setup();
  const first = { ...card, frontLanguage: "en" };
  const second = { ...replacementGrant.card, frontLanguage: "en" };
  const { rerender } = render(<ReviewPage mode="practice" cards={[first, second]} />);
  await user.click(screen.getAllByRole("button", { name: "Hear 'bonjour' in YouGlish" })[0]);
  expect(screen.getByTitle("YouGlish pronunciation for bonjour")).toBeInTheDocument();

  rerender(<ReviewPage mode="practice" cards={[second]} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByTitle("YouGlish pronunciation for bonjour")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Flashcard" })).toHaveFocus();
});

test("continues the study timer while a YouGlish modal is open", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-17T00:00:00.000Z"));
  const languageCard = { ...card, frontLanguage: "en" };
  render(
    <ReviewPage
      mode="study"
      session={{ ...studySession, cards: [{ ...grant, card: languageCard }] }}
      onRate={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Hear 'bonjour' in YouGlish" })[0]);
  act(() => vi.advanceTimersByTime(2_000));
  expect(screen.getByText("2s")).toHaveClass("review-page__elapsed");
});
```

Keep the existing `afterEach` restoration of real timers.

- [ ] **Step 2: Run the lifecycle tests**

Run `npm test -- src/features/review/ReviewPage.test.tsx`.

Expected: PASS if the card-keyed reset effect and modal cleanup are correct. If RED, make only the minimal change needed to clear `activeMedia` on `card.id` and allow `ReviewMediaModal` cleanup to focus `.review-page__card`.

- [ ] **Step 3: Run all Review/media tests together**

Run:

```bash
npm test -- src/features/review src/features/cards/SourceViewer.test.ts src/styles/tokens.test.ts src/components/ScrollArea.test.tsx
```

Expected: all suites PASS, including existing language, pronunciation, PDF anchor, flip, rating, and practice activity tests.

- [ ] **Step 4: Commit lifecycle coverage**

```bash
git add apps/desktop/src/features/review/ReviewPage.test.tsx apps/desktop/src/features/review/ReviewSessionSurface.tsx apps/desktop/src/features/review/ReviewMediaModal.tsx
git commit -m "test: cover review media modal lifecycle"
```

### Task 6: Full verification and fresh macOS runtime check

**Files:**
- Verify only; no planned source edits.

- [ ] **Step 1: Run formatting-sensitive and full automated verification**

From `apps/desktop`, run:

```bash
npm test
npm run build
npm run test:e2e -- tests/e2e/learning.spec.ts
```

Expected: Vitest PASS, TypeScript/Vite build PASS, and the learning Playwright suite PASS. If any command fails, return to the task that owns the failing behavior; do not weaken unrelated tests.

- [ ] **Step 2: Record the exact source and find stale runtimes**

From the worktree root, run:

```bash
git rev-parse --short HEAD
git status --short
pgrep -af 'tauri dev|vite|library_desktop' || true
```

Expected: record the new short revision; the worktree has no uncommitted feature changes. Identify each matching process and its working copy before stopping anything. Do not reuse an already-open Library window as verification.

- [ ] **Step 3: Start a fresh current-checkout development runtime**

After terminating only stale processes belonging to this worktree, run from `apps/desktop`:

```bash
npm run tauri dev
```

Expected: Tauri compiles the current checkout and launches `apps/desktop/src-tauri/target/debug/library_desktop`. Record the launch start and confirm this binary's modification time is newer than the build start.

- [ ] **Step 4: Manually verify both modal types in WKWebView**

In both light and dark themes:

1. Open Review Due with a sourced, language-confirmed card.
2. Flip the card, open the eye button from the visible face, and confirm the PDF fills most of the viewport without resizing the flashcard behind it.
3. Confirm the PDF page/match toolbar remains visible; scroll a long PDF and verify there is no white native track and the custom thumb does not cover PDF content.
4. Close using `Escape`, the close button, and a backdrop click on separate openings; confirm focus returns to the exact eye button and the card stays flipped.
5. Activate a word and confirm YouGlish opens in the narrower modal with visible attribution and no large empty PDF-sized area.
6. Close the video and confirm playback stops, the word highlight clears, focus returns to the word, and the timer has continued.
7. Repeat the source/video smoke flow in Practice All.
8. Resize to the minimum supported desktop window and confirm neither dialog escapes the viewport.

Expected: every acceptance criterion passes in a freshly launched WKWebView, in both themes.

- [ ] **Step 5: Commit any verification-only test correction, then report exact evidence**

If no correction was needed, do not create an empty commit. If a focused test correction was required:

```bash
git add apps/desktop/src/features/review/ReviewPage.test.tsx apps/desktop/src/styles/tokens.test.ts
git commit -m "test: tighten review media modal verification"
```

Final handoff must state the tested revision, launch mode (`tauri dev`), exact artifact path `apps/desktop/src-tauri/target/debug/library_desktop`, automated command results, and whether both light/dark scrollbar checks passed. Do not claim release-app verification unless `npm run tauri build` was run and the newly built release artifact was launched.
