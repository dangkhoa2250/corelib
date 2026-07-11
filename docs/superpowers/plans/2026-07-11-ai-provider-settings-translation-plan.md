# AI Provider Settings and Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom-pinned Settings page where users enter provider API keys, discover/select models, choose a default provider, and translate selected card text.

**Architecture:** Keep provider credentials and preferences outside learning cards. Add a small frontend AI domain with provider adapters for Google AI Studio and OpenAI-compatible NVIDIA/OpenRouter/Cerebras endpoints; expose native Tauri commands for model discovery, translation, and keychain-backed credential storage. Add Settings as an app route and connect CardComposer to the saved default translation configuration.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, reqwest, existing `keyring` crate, existing sidebar/app-route patterns.

---

## Task 1: Add AI domain contracts and provider adapter tests

**Files:**
- Create: `apps/desktop/src/domain/ai.ts`
- Create: `apps/desktop/src/lib/ai.test.ts`
- Modify: `apps/desktop/src/test/setup.ts` only if secure-storage mocks require a shared test helper

- [ ] **Step 1: Write failing tests for provider presets and normalized model parsing**

  Cover four provider IDs, display metadata, Google `supportedGenerationMethods` filtering, OpenAI-compatible `{ data: [...] }` parsing, and redacted key labels.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- --run src/lib/ai.test.ts` from `apps/desktop`.
  Expected: FAIL because the AI domain contracts/helpers do not exist.

- [ ] **Step 3: Implement the domain types and pure helpers**

  Define `AiProviderId`, `AiProviderConfig`, `AiModel`, `TranslateInput`, `TranslateResult`, provider presets, and pure normalization/filter helpers. Keep raw API keys out of returned config objects.

- [ ] **Step 4: Run the focused test**

  Run: `npm test -- --run src/lib/ai.test.ts`.
  Expected: PASS.

## Task 2: Add Rust keychain and provider HTTP commands

**Files:**
- Create: `apps/desktop/src-tauri/src/ai.rs`
- Create: `apps/desktop/src-tauri/src/ai_tests.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/model.rs` if shared payload structs are needed
- Modify: `apps/desktop/src-tauri/src/commands.rs` only if the project keeps all commands in the existing module

- [ ] **Step 1: Write failing Rust tests for provider URL/header/body normalization**

  Test that Google uses its native models/generate-content contract, the three OpenAI-compatible providers use `/models` and `/chat/completions`, translation prompts request JSON with `translation`, and credentials are addressed by provider ID.

- [ ] **Step 2: Run the focused Rust tests**

  Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml ai`.
  Expected: FAIL until the AI module exists.

- [ ] **Step 3: Implement keychain-backed commands**

  Add commands to save, clear, and report whether a provider key exists. Reuse the existing `keyring::Entry` pattern from `drive_auth.rs`; never return the raw key to the frontend.

- [ ] **Step 4: Implement model discovery**

  Add `list_ai_models(provider, api_key)` with provider presets. For Google, call the Gemini models list endpoint and retain only `generateContent` models. For NVIDIA/OpenRouter/Cerebras, call the OpenAI-compatible models endpoint and normalize `id`/`name`/capabilities.

- [ ] **Step 5: Implement translation**

  Add `translate_text(provider, model, api_key, text, target_language)` with a strict JSON prompt. Parse and validate a non-empty translation; return a safe error for non-2xx, malformed JSON, rate-limit, or unsupported-model responses.

- [ ] **Step 6: Register commands and run tests**

  Register the new commands in `src-tauri/src/lib.rs`, then run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`. Expected: all Rust tests pass.

## Task 3: Add frontend AI bridge and settings persistence state

**Files:**
- Modify: `apps/desktop/src/lib/ai.ts`
- Modify: `apps/desktop/src/lib/ai.test.ts`
- Create: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Create: `apps/desktop/src/features/settings/SettingsPage.test.tsx`
- Modify: `apps/desktop/src/app/AppSidebar.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/icons.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing bridge tests**

  Assert that saving/clearing a key and listing models invoke the expected Tauri commands, and translation passes the selected provider/model without exposing credentials in returned values.

- [ ] **Step 2: Implement the bridge functions**

  Add typed wrappers around `invoke`: `saveAiApiKey`, `clearAiApiKey`, `hasAiApiKey`, `listAiModels`, and `translateText`.

- [ ] **Step 3: Add the Settings route and bottom sidebar action**

  Extend `AppSection`/`AppRoute`, render Settings without disturbing existing routes, and keep the Settings button pinned to the bottom of the sidebar.

- [ ] **Step 4: Implement provider setup UX**

  Settings must let the user select a built-in provider, enter an API key, connect/refresh, see only models returned by the provider, choose a model, choose the default provider/model, and see connection/rate-limit errors. Saved keys render as masked values.

- [ ] **Step 5: Run Settings tests**

  Run: `npm test -- --run src/features/settings/SettingsPage.test.tsx src/lib/ai.test.ts`.
  Expected: PASS.

## Task 4: Connect translation to card creation

**Files:**
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx`
- Modify: `apps/desktop/src/features/cards/CardComposer.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`

- [ ] **Step 1: Write failing composer tests**

  Cover Translate success filling the back field, loading/disabled state, error recovery, and preserving manually edited back text until explicit acceptance.

- [ ] **Step 2: Add an injectable translation callback**

  Extend `CardComposerProps` with an optional `onTranslate` callback supplied by `App`, defaulting to an unavailable-provider error when no default provider is configured.

- [ ] **Step 3: Add Translate UI and state**

  Add a Translate button beside Back, show progress/error state, and write only the returned translation into Back after successful completion. Keep the existing save validation unchanged.

- [ ] **Step 4: Wire App to saved AI settings**

  Load the selected default provider/model when the app starts or when Settings changes, then pass a callback that invokes the native translation command using the stored key. Never pass the raw key through card props or persist it in card data.

- [ ] **Step 5: Run focused tests**

  Run: `npm test -- --run src/features/cards/CardComposer.test.tsx src/app/App.test.tsx`.
  Expected: PASS.

## Task 5: Full verification and handoff

**Files:**
- Modify only files required by failing tests or type/build errors.

- [ ] **Step 1: Run the full frontend test suite**

  Run: `npm test` from `apps/desktop`.
  Expected: PASS.

- [ ] **Step 2: Run the production build**

  Run: `npm run build` from `apps/desktop`.
  Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 3: Run the full Rust suite**

  Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`.
  Expected: PASS.

- [ ] **Step 4: Inspect the final diff**

  Run: `git diff --check` and `git status --short`.
  Expected: no whitespace errors; unrelated pre-existing user changes remain untouched.

- [ ] **Step 5: Commit the implementation**

  Commit only the new AI/settings/translation files with message `feat: add configurable AI translation providers`.
