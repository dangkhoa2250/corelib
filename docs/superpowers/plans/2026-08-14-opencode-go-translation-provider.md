# OpenCode Go Translation Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenCode Go a selectable, OpenAI-compatible AI translation provider in Corelib desktop.

**Architecture:** Register the `opencode-go` ID in the existing TypeScript provider metadata and Rust translation dispatch. Reuse Corelib's bearer-authenticated OpenAI-compatible model listing and chat-completions adapter against `https://opencode.ai/zen/go/v1`; no Tauri command, storage, or UI-flow changes are required.

**Tech Stack:** React/TypeScript, Vitest, Tauri, Rust, reqwest.

## Global Constraints

- Use provider ID exactly `opencode-go` and endpoint exactly `https://opencode.ai/zen/go/v1`.
- Keep the existing `ai-keys.json` API-key storage and existing Settings > Model UI flow.
- Reuse the OpenAI-compatible bearer-auth `/models` and `/chat/completions` path; do not add a provider-specific HTTP adapter.
- Do not add a desktop route, command-palette entry, custom endpoint control, or WebView CSP rule.
- Preserve unrelated working-tree changes, especially existing provider/model brand edits.

## File Structure

- `apps/desktop/src-tauri/src/ai.rs`: maps the provider ID to its API endpoint and unit-tests that mapping.
- `apps/desktop/src-tauri/src/translation.rs`: permits persisted `ai:opencode-go:<model>` engine IDs and tests parsing.
- `apps/desktop/src/domain/ai.ts`: exposes OpenCode Go in the frontend provider type and Settings picker data.
- `apps/desktop/src/domain/providerBrand.ts`: associates OpenCode Go with the packaged OpenCode SVG.
- `apps/desktop/src/domain/providerBrand.test.ts`: verifies the new brand mapping.
- `apps/desktop/src/features/settings/SettingsPage.tsx`: initializes connection state for the new exhaustive provider ID.
- `apps/desktop/src/features/settings/SettingsPage.test.tsx`: proves Settings can connect OpenCode Go and load its models.

---

### Task 1: Register OpenCode Go in the Rust provider and engine dispatch

**Files:**
- Modify: `apps/desktop/src-tauri/src/ai.rs:26-35,351-386`
- Modify: `apps/desktop/src-tauri/src/translation.rs:121-136,330-368`

**Interfaces:**
- Consumes: `provider_base_url(provider: &str) -> Result<&'static str, String>` and `parse_ai_engine_id(value: &str) -> Result<(String, String), String>`.
- Produces: successful OpenAI-compatible requests for provider `opencode-go` through the existing `list_models` and `translate_text` functions; valid engine IDs shaped `ai:opencode-go:<URI-encoded model>`.

- [ ] **Step 1: Add failing Rust unit tests for the URL and engine ID**

In `ai.rs` test module, add:

```rust
#[test]
fn resolves_opencode_go_base_url() {
    assert_eq!(
        provider_base_url("opencode-go").unwrap(),
        "https://opencode.ai/zen/go/v1"
    );
}
```

In `translation.rs` test module, add:

```rust
#[test]
fn parses_opencode_go_engine_ids() {
    assert_eq!(
        parse_ai_engine_id("ai:opencode-go:deepseek-v4-flash").unwrap(),
        ("opencode-go".to_owned(), "deepseek-v4-flash".to_owned())
    );
}
```

- [ ] **Step 2: Run each new test and verify it fails**

Run from `apps/desktop/src-tauri`:

```bash
cargo test -p library_desktop resolves_opencode_go_base_url
cargo test -p library_desktop parses_opencode_go_engine_ids
```

Expected: both tests fail because `opencode-go` is not registered.

- [ ] **Step 3: Add the minimal provider registration and allowlist entry**

In `ai.rs`, add this match arm beside the other OpenAI-compatible providers:

```rust
"opencode-go" => Ok("https://opencode.ai/zen/go/v1"),
```

In `translation.rs`, expand the existing provider check to include the exact ID:

```rust
if !matches!(
    provider,
    "google-ai-studio" | "nvidia" | "openrouter" | "cerebras" | "opencode-go"
) {
    return Err("engine_unavailable: Unknown AI provider.".to_owned());
}
```

Do not add a request branch: the non-Google path already supplies Bearer auth and uses `/models` plus `/chat/completions`.

- [ ] **Step 4: Run the focused Rust tests and verify they pass**

Run from `apps/desktop/src-tauri`:

```bash
cargo test -p library_desktop resolves_opencode_go_base_url
cargo test -p library_desktop parses_opencode_go_engine_ids
```

Expected: both pass.

- [ ] **Step 5: Commit the Rust registration**

```bash
git add apps/desktop/src-tauri/src/ai.rs apps/desktop/src-tauri/src/translation.rs
git commit -m "feat: add OpenCode Go translation backend"
```

### Task 2: Expose OpenCode Go in the Settings provider picker

**Files:**
- Modify: `apps/desktop/src/domain/ai.ts:1,30-56`
- Modify: `apps/desktop/src/domain/providerBrand.ts:1-18`
- Modify: `apps/desktop/src/domain/providerBrand.test.ts:1-20`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx:124-130`
- Modify: `apps/desktop/src/features/settings/SettingsPage.test.tsx:98-126`

**Interfaces:**
- Consumes: `AiProviderId`, `AI_PROVIDERS`, `providerBrandFor(providerId)`, and Settings callbacks `saveApiKey(provider, key)` / `listModels(provider)`.
- Produces: `opencode-go` as a type-safe provider option with display name, description, OpenCode icon, initialized disconnected state, and normal key/model connection behavior.

- [ ] **Step 1: Add failing frontend assertions for branding and connection**

Extend `providerBrand.test.ts`'s `test.each` data with this row:

```ts
["opencode-go", "opencode-go", "opencode.svg"],
```

In `SettingsPage.test.tsx`, add a focused test using the same interaction pattern as `connects a provider and loads models using only an API key`:

```tsx
test("connects OpenCode Go and loads its models", async () => {
  const user = userEvent.setup();
  const saveApiKey = vi.fn().mockResolvedValue(undefined);
  const listModels = vi.fn().mockResolvedValue([
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  ]);

  renderSettings({ saveApiKey, listModels });
  await user.click(screen.getByRole("button", { name: "+ Add provider" }));
  await user.click(screen.getByRole("combobox", { name: "AI provider" }));
  await user.click(screen.getByText("OpenCode Go"));
  await user.type(screen.getByLabelText("API key"), "oc-go-test");
  await user.click(screen.getByRole("button", { name: "Connect" }));

  await waitFor(() => {
    expect(saveApiKey).toHaveBeenCalledWith("opencode-go", "oc-go-test");
  });
  expect(listModels).toHaveBeenCalledWith("opencode-go");
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run from `apps/desktop`:

```bash
npm test -- src/domain/providerBrand.test.ts src/features/settings/SettingsPage.test.tsx
```

Expected: the tests fail because the picker has no `OpenCode Go` option and no brand mapping.

- [ ] **Step 3: Add provider metadata, icon, and exhaustive state**

In `domain/ai.ts`, add `"opencode-go"` to `AiProviderId` and add this entry to `AI_PROVIDERS`:

```ts
{
  id: "opencode-go",
  name: "OpenCode Go",
  description: "Low-cost OpenCode models for translation.",
}
```

In `providerBrand.ts`, import the exact package asset:

```ts
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg?no-inline";
```

Extend `ProviderBrand`'s non-fallback `id` union to include `"opencode-go"`, then add this mapping:

```ts
"opencode-go": { id: "opencode-go", src: opencode, asset: "opencode.svg" },
```

In `SettingsPage.tsx`, add the exhaustive initial connection state:

```ts
"opencode-go": false,
```

Keep all provider interactions routed through existing generic callbacks; do not add a new bridge method, page, or action.

- [ ] **Step 4: Run focused tests and TypeScript build**

Run from `apps/desktop`:

```bash
npm test -- src/domain/providerBrand.test.ts src/features/settings/SettingsPage.test.tsx
npm run build
```

Expected: both test files pass and the TypeScript/Vite build succeeds.

- [ ] **Step 5: Commit the Settings integration**

```bash
git add apps/desktop/src/domain/ai.ts apps/desktop/src/domain/providerBrand.ts apps/desktop/src/domain/providerBrand.test.ts apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/settings/SettingsPage.test.tsx
git commit -m "feat: expose OpenCode Go in translation settings"
```

### Task 3: Run regression verification without disturbing unrelated changes

**Files:**
- Verify only: `apps/desktop/src-tauri/src/ai.rs`
- Verify only: `apps/desktop/src-tauri/src/translation.rs`
- Verify only: `apps/desktop/src/domain/ai.ts`
- Verify only: `apps/desktop/src/domain/providerBrand.ts`
- Verify only: `apps/desktop/src/features/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: completed Rust registration and frontend Settings metadata.
- Produces: evidence that the new provider does not regress the current AI bridge, app translation flow, or desktop build.

- [ ] **Step 1: Run the affected frontend suites**

Run from `apps/desktop`:

```bash
npm test -- src/lib/ai.test.ts src/domain/providerBrand.test.ts src/features/settings/SettingsPage.test.tsx src/app/App.test.tsx
```

Expected: all selected Vitest suites pass.

- [ ] **Step 2: Run the Rust crate test suite**

Run from `apps/desktop/src-tauri`:

```bash
cargo test -p library_desktop
```

Expected: all library tests pass, including OpenCode Go URL and engine-ID tests.

- [ ] **Step 3: Review final scope and commit state**

Run from the repository root:

```bash
git status --short
git diff --check
git log --oneline -3
```

Expected: only intentional integration commits are present; pre-existing unrelated brand changes remain untouched unless they were already part of the requested integration.

- [ ] **Step 4: Record desktop verification accurately**

If manually testing the desktop UI, first record `git rev-parse --short HEAD` and `git status --short`, identify running `tauri dev`, `vite`, and `library_desktop` processes, then restart `tauri dev` from this checkout. Report the revision and launch mode. If no fresh runtime test is run, explicitly report that only unit/build verification occurred.
