# Native and Cloud Translation Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable Apple Translation and Google Cloud Translation engines to Settings → Model, defaulting new supported macOS installs to Apple Translation while preserving existing AI selections.

**Architecture:** Introduce a frontend translation-engine registry that combines two built-in translation engines with discovered AI models. Route a single Tauri translation command to Apple, Google Cloud, or the existing AI adapter. Implement Apple Translation through a macOS-only Swift package linked into the Tauri Rust binary, with a non-macOS stub.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, reqwest, Swift 6, SwiftUI Translation framework, Cargo/SwiftPM.

---

## File structure

- Create `apps/desktop/src/domain/translation.ts`: engine IDs, definitions, sorting, selection migration, and target-language normalization.
- Create `apps/desktop/src/domain/translation.test.ts`: registry/default/migration tests.
- Modify `apps/desktop/src/domain/ai.ts`: add the dedicated Google Cloud Translation provider definition.
- Create `apps/desktop/src-tauri/src/translation.rs`: shared routing, Google Cloud Translation adapter, normalized errors, and platform bridge boundary.
- Create `apps/desktop/src-tauri/swift/AppleTranslation/Package.swift`: macOS 15 static Swift package definition.
- Create `apps/desktop/src-tauri/swift/AppleTranslation/Sources/AppleTranslation/AppleTranslation.swift`: SwiftUI-hosted Translation session and C ABI.
- Modify `apps/desktop/src-tauri/build.rs`: link the Swift package on macOS before the existing Tauri build.
- Modify `apps/desktop/src-tauri/Cargo.toml`: add macOS-only Swift build dependency while preserving current workspace dependency edits.
- Modify `apps/desktop/src-tauri/src/lib.rs`: register unified translation/availability commands.
- Modify `apps/desktop/src/lib/ai.ts`: expose the unified translation bridge and Apple availability check.
- Modify `apps/desktop/src/lib/ai.test.ts`: verify Tauri command payloads.
- Modify `apps/desktop/src/features/settings/SettingsPage.tsx`: combine built-in engines with AI models and persist engine selection.
- Modify `apps/desktop/src/features/settings/SettingsPage.test.tsx`: cover Apple default/order, migration, Google connection, and selection.
- Modify `apps/desktop/src/app/App.tsx`: route Card Composer translation by engine ID.
- Modify `apps/desktop/src/app/App.test.tsx`: verify default Apple routing and preserved AI routing.

### Task 1: Translation engine domain and preference migration

**Files:**
- Create: `apps/desktop/src/domain/translation.ts`
- Create: `apps/desktop/src/domain/translation.test.ts`
- Modify: `apps/desktop/src/domain/ai.ts`

- [ ] **Step 1: Write failing domain tests**

Add tests asserting that `builtinTranslationEngines(true)` returns Apple before Google, `defaultTranslationSelection(true)` returns Apple, unsupported platforms return no automatic Apple selection, and `readTranslationSelection` migrates legacy provider/model values to `ai:<provider>:<encoded model>`.

```ts
expect(builtinTranslationEngines(true).map((engine) => engine.id)).toEqual([
  "apple-translation",
  "google-translation",
]);
expect(defaultTranslationSelection(true)).toBe("apple-translation");
expect(defaultTranslationSelection(false)).toBeNull();
expect(readTranslationSelection(storage, true)).toBe(
  "ai:google-ai-studio:gemini-2.5-flash",
);
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `cd apps/desktop && npm test -- --run src/domain/translation.test.ts`

Expected: FAIL because `./translation` does not exist.

- [ ] **Step 3: Implement the engine domain**

Define discriminated engine records and stable persistence helpers:

```ts
export type TranslationEngineId =
  | "apple-translation"
  | "google-translation"
  | `ai:${AiProviderId}:${string}`;

export interface TranslationEngine {
  id: TranslationEngineId;
  name: string;
  description: string;
  source: "native" | "translation-api" | "ai";
  provider: AiProviderId | null;
  model: string | null;
  available: boolean;
}

export const TRANSLATION_ENGINE_KEY = "library.translation.engine";

export function aiEngineId(provider: AiProviderId, model: string): TranslationEngineId {
  return `ai:${provider}:${encodeURIComponent(model)}`;
}

export function parseAiEngineId(id: TranslationEngineId) {
  if (!id.startsWith("ai:")) return null;
  const [, provider, encodedModel] = id.split(":", 3);
  return { provider: provider as AiProviderId, model: decodeURIComponent(encodedModel) };
}
```

Add `google-translation` to `AiProviderId` and `AI_PROVIDERS` with description `Google Cloud Translation NMT API.`. Its provider type remains key-backed but its fixed model is supplied by the translation registry rather than model discovery.

- [ ] **Step 4: Run domain tests**

Run: `cd apps/desktop && npm test -- --run src/domain/translation.test.ts src/domain/ai.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain slice**

```bash
git add apps/desktop/src/domain/translation.ts apps/desktop/src/domain/translation.test.ts apps/desktop/src/domain/ai.ts
git commit -m "feat: define selectable translation engines"
```

### Task 2: Google Cloud Translation backend

**Files:**
- Create: `apps/desktop/src-tauri/src/translation.rs`
- Modify: `apps/desktop/src-tauri/src/ai.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for Google parsing and routing**

Add tests for the supported-languages response, translated-text response, and auth/quota normalization:

```rust
#[test]
fn parses_google_translation_response() {
    let result = parse_google_translation(&json!({
        "data": { "translations": [{ "translatedText": "Xin chào" }] }
    })).unwrap();
    assert_eq!(result.translation, "Xin chào");
}

#[test]
fn maps_target_language_names_to_codes() {
    assert_eq!(target_language_code("Vietnamese"), Some("vi"));
    assert_eq!(target_language_code("vi-VN"), Some("vi"));
}
```

- [ ] **Step 2: Run Rust tests and verify failure**

Run: `cd apps/desktop/src-tauri && cargo test translation --lib`

Expected: FAIL because `translation.rs` and its functions do not exist.

- [ ] **Step 3: Implement Google adapter and router**

Add the provider base URL `https://translation.googleapis.com/language/translate/v2` to the existing provider validation. Keep existing in-progress credential-storage edits intact. Implement:

```rust
pub fn list_translation_models(provider: &str) -> Result<Vec<AiModel>, String> {
    if provider == "google-translation" {
        validate_google_translation_key()?;
        return Ok(vec![AiModel {
            id: "nmt".into(),
            name: "Google Cloud Translation — NMT".into(),
        }]);
    }
    ai::list_models(provider)
}

pub fn translate(
    engine_id: &str,
    text: &str,
    target_language: &str,
) -> Result<TranslationResult, String> {
    match engine_id {
        "apple-translation" => apple::translate(text, target_language),
        "google-translation" => translate_with_google(text, target_language),
        value if value.starts_with("ai:") => {
            let (provider, model) = parse_ai_engine_id(value)?;
            ai::translate_text(&provider, &model, text, target_language)
        }
        _ => Err("engine_unavailable: Unknown translation engine.".into()),
    }
}
```

Make the existing credential loader `pub(crate)` so the translation adapter can reuse the current storage boundary. Google validation calls `GET /languages` with `target=en` and the saved key as query parameters. Translation calls `POST` with JSON `{q, target, format: "text"}` and the API key query parameter. Decode Google HTML entities only through a focused helper with tests; do not log request text.

- [ ] **Step 4: Register Tauri commands**

Expose:

```rust
#[tauri::command]
pub fn translate_text(engine_id: String, text: String, target_language: String)
    -> Result<TranslationResult, String>;

#[tauri::command]
pub fn apple_translation_available() -> bool;
```

Register both in `generate_handler!` and route `list_ai_models("google-translation")` to the fixed-model validation path.

- [ ] **Step 5: Run Rust tests**

Run: `cd apps/desktop/src-tauri && cargo test --lib`

Expected: PASS, excluding the not-yet-linked Apple implementation behind its temporary platform stub.

- [ ] **Step 6: Commit the Google backend slice**

```bash
git add apps/desktop/src-tauri/src/translation.rs apps/desktop/src-tauri/src/ai.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add Google Cloud translation adapter"
```

### Task 3: Apple Translation Swift bridge

**Files:**
- Create: `apps/desktop/src-tauri/swift/AppleTranslation/Package.swift`
- Create: `apps/desktop/src-tauri/swift/AppleTranslation/Sources/AppleTranslation/AppleTranslation.swift`
- Modify: `apps/desktop/src-tauri/build.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/translation.rs`

- [ ] **Step 1: Add a failing platform-boundary test**

On non-macOS, assert the adapter returns `engine_unavailable`. On macOS, keep pure Rust tests limited to target-code mapping and FFI error parsing; native behavior is verified by an ignored real-device test.

```rust
#[cfg(not(target_os = "macos"))]
#[test]
fn apple_translation_is_unavailable_off_macos() {
    assert!(apple::translate("Hello", "vi").unwrap_err().starts_with("engine_unavailable:"));
}
```

- [ ] **Step 2: Create the Swift static package**

Use macOS 15 as the package floor:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AppleTranslation",
    platforms: [.macOS(.v15)],
    products: [.library(name: "AppleTranslation", type: .static, targets: ["AppleTranslation"])],
    targets: [.target(name: "AppleTranslation")]
)
```

- [ ] **Step 3: Implement the SwiftUI-hosted bridge**

Export C ABI functions using copied UTF-8 strings and a callback. Dispatch host-view creation to the main actor, attach a one-point `NSHostingView` to the active Tauri window, and retain it until completion. The hosted view uses `TranslationSession.Configuration(source: nil, target: Locale.Language(identifier: target))`, calls `prepareTranslation()` and `translate(text)`, then returns either target text or a normalized error. Remove the host view after calling back.

```swift
public typealias TranslationCallback = @convention(c) (
    UnsafePointer<CChar>?, UnsafePointer<CChar>?
) -> Void

@_cdecl("library_apple_translation_available")
public func appleTranslationAvailable() -> Bool {
    if #available(macOS 15.0, *) { return true }
    return false
}

@_cdecl("library_apple_translate")
public func appleTranslate(
    _ source: UnsafePointer<CChar>,
    _ target: UnsafePointer<CChar>,
    _ callback: @escaping TranslationCallback
) {
    let text = String(cString: source)
    let targetCode = String(cString: target)
    Task { @MainActor in
        TranslationHostCoordinator.start(text: text, target: targetCode, callback: callback)
    }
}
```

- [ ] **Step 4: Link SwiftPM from Cargo**

Add macOS-only `swift-rs = { version = "1.0.7", features = ["build"] }` as a build dependency. In `build.rs`, call `SwiftLinker::new("15.0").with_package("AppleTranslation", "swift/AppleTranslation").link()` only when `CARGO_CFG_TARGET_OS == "macos"`, then call `tauri_build::build()`.

- [ ] **Step 5: Implement safe Rust FFI wrapping**

Use `CString`, an `mpsc` channel, and a bounded timeout. Copy callback strings immediately; never allow a panic to cross the C boundary. Return normalized `language_pack_required`, `unsupported_language_pair`, or `engine_unavailable` errors.

- [ ] **Step 6: Compile and test the native bridge**

Run: `cd apps/desktop/src-tauri && cargo test --lib`

Expected: Swift package compiles and all Rust tests pass.

Run: `cd apps/desktop/src-tauri && cargo build`

Expected: Tauri library and linked Swift static library build successfully.

- [ ] **Step 7: Commit the Apple bridge slice**

```bash
git add apps/desktop/src-tauri/swift apps/desktop/src-tauri/build.rs apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/translation.rs
git commit -m "feat: bridge Apple Translation into Tauri"
```

### Task 4: Frontend bridge and Settings engine picker

**Files:**
- Modify: `apps/desktop/src/lib/ai.ts`
- Modify: `apps/desktop/src/lib/ai.test.ts`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing bridge and Settings tests**

Verify command payloads and UI behavior:

```ts
await translateText("apple-translation", "Hello", "Vietnamese", call);
expect(call).toHaveBeenCalledWith("translate_text", {
  engineId: "apple-translation",
  text: "Hello",
  targetLanguage: "Vietnamese",
});

expect(screen.getByLabelText("Search models")).toHaveValue("Apple Translation");
await user.clear(screen.getByLabelText("Search models"));
await user.type(screen.getByLabelText("Search models"), "Translation");
const results = await screen.findAllByRole("button", { name: /Translation/ });
expect(results[0]).toHaveTextContent("Apple Translation");
```

Also test legacy AI migration, Google fixed model after connection, independent Google AI Studio/Translation keys, and removal of the active Google key.

- [ ] **Step 2: Run focused frontend tests and verify failure**

Run: `cd apps/desktop && npm test -- --run src/lib/ai.test.ts src/features/settings/SettingsPage.test.tsx`

Expected: FAIL because unified engine APIs/UI do not exist.

- [ ] **Step 3: Implement the frontend Tauri bridge**

Add:

```ts
export function translateText(
  engineId: TranslationEngineId,
  text: string,
  targetLanguage: string,
  call: Invoke = invoke,
): Promise<TranslationResult> {
  return call("translate_text", { engineId, text, targetLanguage });
}

export function appleTranslationAvailable(call: Invoke = invoke): Promise<boolean> {
  return call("apple_translation_available");
}
```

- [ ] **Step 4: Update Settings selection and persistence**

Load Apple availability once, construct `searchableModels` from available built-ins plus AI discoveries, keep Apple first, and use the translation engine persistence helper. Prefill Apple Translation only when no valid saved/legacy preference exists. Treat `google-translation` as a key-backed provider whose `listModels` returns the fixed NMT entry.

Change `onDefaultChange` to `(engineId: TranslationEngineId | null) => void`. Preserve keyboard search behavior and existing provider editor behavior.

- [ ] **Step 5: Run focused frontend tests**

Run: `cd apps/desktop && npm test -- --run src/domain/translation.test.ts src/lib/ai.test.ts src/features/settings/SettingsPage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the Settings slice**

```bash
git add apps/desktop/src/lib/ai.ts apps/desktop/src/lib/ai.test.ts apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/settings/SettingsPage.test.tsx
git commit -m "feat: select native and cloud translation engines"
```

### Task 5: Card Composer routing and compatibility

**Files:**
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing App routing tests**

Assert a fresh preference routes through Apple and a migrated AI selection routes through its encoded engine ID:

```ts
expect(aiApi.translate).toHaveBeenCalledWith(
  "apple-translation",
  selectedText,
  "Vietnamese",
);
```

- [ ] **Step 2: Run the App tests and verify failure**

Run: `cd apps/desktop && npm test -- --run src/app/App.test.tsx`

Expected: FAIL because App still expects provider and model arguments.

- [ ] **Step 3: Route by selected engine**

Replace `aiPreference.provider/model` state with `{ engineId, targetLanguage }`. `handleTranslate` requires a selected engine and calls `translateText(engineId, text, targetLanguage)`. Settings changes update the same state without re-reading provider/model assumptions.

- [ ] **Step 4: Run App and Card Composer tests**

Run: `cd apps/desktop && npm test -- --run src/app/App.test.tsx src/features/cards/CardComposer.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the routing slice**

```bash
git add apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "feat: route card translation by engine"
```

### Task 6: Full verification and documentation reconciliation

**Files:**
- Modify only files required by failures found in verification.

- [ ] **Step 1: Run the frontend suite**

Run: `cd apps/desktop && npm test -- --run`

Expected: all tests PASS.

- [ ] **Step 2: Run the production frontend build**

Run: `cd apps/desktop && npm run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 3: Run Rust tests and compile checks**

Run: `cd apps/desktop/src-tauri && cargo test --lib`

Expected: all tests PASS.

Run: `cd apps/desktop/src-tauri && cargo check`

Expected: check completes successfully with the Swift package linked on macOS.

- [ ] **Step 4: Verify security and workspace scope**

Run: `rg -n "api[_-]?key|sourceText|translatedText" apps/desktop/src-tauri/src apps/desktop/src-tauri/swift`

Expected: no logging of credentials or translation content; credential persistence changes that predated this plan remain preserved rather than silently reverted.

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended feature files and pre-existing user changes remain.

- [ ] **Step 5: Record the final verification state**

Run: `git diff --stat && git status --short`

Expected: the feature diff is reviewable and the three pre-existing Rust/Cargo modifications remain present; do not create a final commit that would accidentally absorb user-owned changes.
