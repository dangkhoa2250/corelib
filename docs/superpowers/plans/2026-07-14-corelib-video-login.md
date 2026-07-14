# Corelib Video Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Antigravity account gate with a responsive Corelib glass login experience over the supplied looping video.

**Architecture:** `AccountGate.tsx` remains the shared account viewport and gains the video and overlay layers plus responsive account styles. Sign-in and registration retain their callbacks/state and change only visible branding. The supplied MP4 is copied to Vite's public assets and is served from a stable root URL.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, CSS embedded in `AccountGate.tsx`.

---

## File structure

- Create: `apps/desktop/public/corelib-login-page.mp4` — bundled background animation served at `/corelib-login-page.mp4`.
- Create: `apps/desktop/src/features/account/AccountGate.test.tsx` — account video/background contract.
- Modify: `apps/desktop/src/features/account/AccountGate.tsx` — video/overlay markup and responsive glass styles.
- Modify: `apps/desktop/src/features/account/SignInPage.tsx` — Corelib sign-in headings.
- Modify: `apps/desktop/src/features/account/RegisterPage.tsx` — Corelib registration headings.
- Modify: `apps/desktop/src/features/account/SignInPage.test.tsx` — Corelib sign-in assertion.
- Modify: `apps/desktop/src/features/account/RegisterPage.test.tsx` — Corelib registration assertion.

### Task 1: Define the Corelib account identity

**Files:**

- Modify: `apps/desktop/src/features/account/SignInPage.test.tsx`
- Modify: `apps/desktop/src/features/account/RegisterPage.test.tsx`
- Modify: `apps/desktop/src/features/account/SignInPage.tsx`
- Modify: `apps/desktop/src/features/account/RegisterPage.tsx`

- [ ] **Step 1: Write failing branding tests**

Add an assertion in each existing render test:

```tsx
expect(screen.getByRole("heading", { name: "Corelib" })).toBeInTheDocument();
```

For sign-in, also assert `Welcome back`; for registration, assert `Create your Corelib account`.

- [ ] **Step 2: Run focused tests and verify expected failure**

Run: `npm test -- SignInPage.test.tsx RegisterPage.test.tsx`

Expected: Corelib-heading assertions fail because the current page renders `Antigravity Library`.

- [ ] **Step 3: Implement minimal branding updates**

Replace both logo blocks with the same mark and heading, preserving all form behavior:

```tsx
<div className="account-gate-logo">
  <span className="account-gate-mark" aria-hidden="true">C</span>
  <h1>Corelib</h1>
  <p>Welcome back</p>
</div>
```

Use `Create your Corelib account` for the registration paragraph. Do not change IDs, labels, form state, or callbacks.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- SignInPage.test.tsx RegisterPage.test.tsx`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/account/SignInPage.tsx apps/desktop/src/features/account/RegisterPage.tsx apps/desktop/src/features/account/SignInPage.test.tsx apps/desktop/src/features/account/RegisterPage.test.tsx
git commit -m "feat: brand account screens as corelib"
```

### Task 2: Add the supplied video background

**Files:**

- Create: `apps/desktop/public/corelib-login-page.mp4`
- Create: `apps/desktop/src/features/account/AccountGate.test.tsx`
- Modify: `apps/desktop/src/features/account/AccountGate.tsx`

- [ ] **Step 1: Write a failing account-gate background test**

Mock `@tauri-apps/api/core` so `account_session` resolves to `null`, render `AccountGate`, and assert:

```tsx
expect(document.querySelector(".account-gate-video")).toHaveAttribute("src", "/corelib-login-page.mp4");
expect(document.querySelector(".account-gate-video")).toHaveAttribute("autoplay");
expect(document.querySelector(".account-gate-video")).toHaveAttribute("muted");
expect(document.querySelector(".account-gate-video")).toHaveAttribute("loop");
expect(document.querySelector(".account-gate-video")).toHaveAttribute("playsinline");
```

- [ ] **Step 2: Run focused test and verify expected failure**

Run: `npm test -- AccountGate.test.tsx`

Expected: failure because no `.account-gate-video` element exists.

- [ ] **Step 3: Bundle the video and add viewport layers**

Copy `/Users/jason/Downloads/corelib-login-page.mp4` to `apps/desktop/public/corelib-login-page.mp4`. Just inside `.account-gate-container`, render:

```tsx
<video className="account-gate-video" src="/corelib-login-page.mp4" autoPlay muted loop playsInline aria-hidden="true" />
<div className="account-gate-video-overlay" aria-hidden="true" />
```

Place video/overlay behind the account content with absolute positioning and place the card/spinner above them with `position: relative; z-index: 1`.

- [ ] **Step 4: Run focused test and verify it passes**

Run: `npm test -- AccountGate.test.tsx`

Expected: the video semantics assertion passes.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/public/corelib-login-page.mp4 apps/desktop/src/features/account/AccountGate.tsx apps/desktop/src/features/account/AccountGate.test.tsx
git commit -m "feat: add video background to account gate"
```

### Task 3: Apply responsive right-aligned glass layout

**Files:**

- Modify: `apps/desktop/src/features/account/AccountGate.test.tsx`
- Modify: `apps/desktop/src/features/account/AccountGate.tsx`

- [ ] **Step 1: Add a failing visual-style contract test**

Assert rendered inline styles include both responsive layout and overlay selectors:

```tsx
expect(document.body.textContent).toContain("@media (max-width: 720px)");
expect(document.body.textContent).toContain(".account-gate-video-overlay");
```

- [ ] **Step 2: Run focused test and verify expected failure**

Run: `npm test -- AccountGate.test.tsx`

Expected: failure because the overlay and responsive breakpoint are absent.

- [ ] **Step 3: Replace legacy purple styles**

Apply these visual rules in `AccountGate.tsx`, while retaining existing error/loading/pending/rejected behavior:

```css
.account-gate-container { justify-content: flex-end; padding: clamp(24px, 6vw, 96px); background: #070b0f; overflow: hidden; }
.account-gate-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.account-gate-video-overlay { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(4, 8, 11, .2), rgba(4, 8, 11, .82)); }
.account-gate-card { position: relative; z-index: 1; max-width: 440px; background: rgba(10, 16, 21, .78); border: 1px solid rgba(255, 255, 255, .16); border-radius: 24px; box-shadow: 0 24px 80px rgba(0, 0, 0, .52); }
.account-gate-btn { background: #f8fafc; color: #111827; }
@media (max-width: 720px) { .account-gate-container { justify-content: center; padding: 20px; overflow-y: auto; } .account-gate-video-overlay { background: rgba(4, 8, 11, .72); } .account-gate-card { max-width: 520px; padding: 28px 24px; } }
```

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- AccountGate.test.tsx SignInPage.test.tsx RegisterPage.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/account/AccountGate.tsx apps/desktop/src/features/account/AccountGate.test.tsx
git commit -m "feat: style corelib account gate"
```

### Task 4: Verify the desktop frontend

**Files:**

- Verify only.

- [ ] **Step 1: Run full frontend test suite**

Run: `npm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Build the desktop frontend**

Run: `npm run build`

Expected: TypeScript completes without errors and Vite emits a production bundle.

- [ ] **Step 3: Inspect final scope**

Run: `git status --short && git diff --check HEAD~3..HEAD`

Expected: the account-gate commits have no whitespace errors and unrelated user changes remain unstaged.
