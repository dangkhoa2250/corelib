# Native and cloud translation engines

## Goal

Add Apple Translation and Google Cloud Translation as first-class choices in Settings → Model. New installations use Apple Translation by default for the lowest translation latency, while the existing AI models remain selectable for translations that benefit from broader context.

## Scope

This increment adds:

- Apple Translation as an on-device translation engine on supported macOS versions.
- Google Cloud Translation NMT as a dedicated cloud translation engine.
- A provider-neutral translation engine contract shared by native, translation API, and AI-backed engines.
- Engine discovery and selection in the existing Translate model search UI.

LibreTranslate, automatic cloud fallback, dictionary definitions, document translation, and translation history are out of scope.

## Product behavior

### Default selection

On a new installation, the selected translation engine is Apple Translation and the model search field displays `Apple Translation`. Existing installations retain a valid saved engine or AI provider/model selection rather than being overwritten.

Search results order dedicated translation engines before general-purpose AI models:

1. Apple Translation
2. Google Cloud Translation
3. Configured AI models

Apple Translation is labeled `On-device · Fast · No API key`. Google Cloud Translation is labeled `Cloud NMT · API key required`.

### Translation flow

Card Composer continues to call one translation operation and receives plain translated text. The selected engine determines how the operation runs:

- Apple Translation processes the request on the device through Apple's Translation framework.
- Google Cloud Translation sends the request to the Cloud Translation text API.
- Existing AI engines continue to use their selected provider and model.

All engines use the existing target-language preference. A successful result fills the card back field. A failure leaves the composer and all user-entered content intact.

The app never silently falls back from Apple to Google or an AI provider. Sending selected text to a cloud service requires the user to have selected that cloud-backed engine.

## Architecture

### Translation engine contract

Replace the assumption that every translation has an AI `provider + model` with a translation-specific selection:

```ts
type TranslationEngineId =
  | "apple-translation"
  | "google-translation"
  | `ai:${AiProviderId}:${string}`;

interface TranslationEngine {
  id: TranslationEngineId;
  name: string;
  source: "native" | "translation-api" | "ai";
  availability: "available" | "configuration-required" | "unavailable";
}

interface TranslateInput {
  engineId: TranslationEngineId;
  text: string;
  targetLanguage: string;
}
```

The frontend maintains a registry of built-in engine definitions plus AI models discovered from connected providers. A single Tauri command routes translation requests by engine kind. AI request and model-list behavior remain inside the existing AI adapter boundary.

### Preference compatibility

Persist a new selected translation engine key. Preference loading follows this order:

1. Return a valid saved translation engine ID.
2. Migrate a valid existing AI provider/model pair into an `ai:` engine ID without changing the user's selection.
3. Default to `apple-translation` when neither exists.

Keep the target-language preference unchanged. Once migration succeeds, all new writes use the translation engine key; legacy keys may remain readable for backward compatibility during this increment.

### Apple Translation bridge

Apple's Translation framework is Swift-native, while the app backend is Rust/Tauri. Add a small macOS-only Swift bridge with a narrow request/response boundary. The bridge:

- Checks framework and language-pair availability.
- Uses the low-latency translation strategy when the installed SDK and runtime support it, otherwise uses the framework default.
- Hosts the translation task in an appropriate native view context when system UI is required for language-pack permission or download.
- Returns translated text or a normalized error to Rust.
- Never writes source or translated content to logs.

On unsupported macOS versions or unsupported language pairs, the engine remains visible but reports a clear unavailable state. The build must keep non-macOS targets compiling by isolating the Swift bridge and returning a platform-unavailable error outside macOS.

### Google Cloud Translation adapter

Add `google-translation` as a provider distinct from `google-ai-studio`. It has its own keychain entry because Cloud Translation credentials and Gemini API credentials are not interchangeable assumptions.

The adapter exposes one fixed selectable model, `Google Cloud Translation — NMT`, after a key is saved and validated. It calls the official text translation endpoint, supports source-language auto-detection, maps the target-language preference to a supported language code, and normalizes the response to the shared translation result.

The provider editor does not attempt model discovery for Google Cloud Translation. Connect validates the key with the authenticated supported-languages endpoint, which does not translate user content. The UI reports a successful connection only after that request succeeds.

## Settings UI

Rename copy that implies every selectable item is an AI model where needed, while keeping the existing Settings → Model route.

The Translate model search combines:

- Apple Translation, regardless of API-key configuration.
- Google Cloud Translation when its key is configured.
- Models loaded from connected AI providers.

Apple Translation appears first and is selected on new installations on supported macOS systems. When the framework is unavailable, its disabled result explains why and the app prompts the user to choose a cloud-backed engine. An Apple selection restored from preferences on a now-unsupported system produces the same actionable error rather than silently changing the preference.

Google Cloud Translation appears in Providers with API-key controls. It does not share the Google AI Studio connection state. Removing its key removes it from selectable search results and clears it as the active engine if it was selected.

## Language handling

The initial default target remains Vietnamese. Internally, translation adapters use normalized BCP 47 language identifiers rather than passing display names directly to native or cloud APIs. The UI may continue to display a human-readable language value, but selection must resolve to a supported identifier before a request is sent.

Apple availability is checked for the detected or specified source and selected target. If automatic source detection is inconclusive, show the framework's normalized language-identification error. Google may use its API's source detection when the source is not specified.

## Error handling

Normalize errors into stable categories with concise user messages:

- `engine_unavailable`: Apple Translation or its framework is unavailable on this Mac.
- `language_pack_required`: the required Apple language assets are not installed and download permission or completion is required.
- `unsupported_language_pair`: the selected source/target pairing is unsupported.
- `authentication_failed`: the Google or AI provider credential is invalid or unauthorized.
- `quota_exceeded`: the cloud provider quota or rate limit was reached.
- `network_failed`: the cloud request could not reach its provider.
- `malformed_response`: the provider returned no usable translation.

Errors never clear credentials, overwrite the selected engine, replace manually entered card text, or trigger an unapproved cloud fallback.

## Security and privacy

- Store Google Cloud Translation credentials in the existing OS keychain boundary under a distinct provider ID.
- Never place credentials in local storage, cards, logs, fixtures, or error messages.
- Treat Apple Translation as on-device processing. Cloud-backed engine labels must make their network behavior clear.
- Do not log source text or translated results.
- Preserve the current CSP posture by keeping provider network calls in the Rust/native backend.

## Testing

### Unit tests

- Engine registry ordering and availability.
- New-install Apple default.
- Migration of existing AI provider/model preferences.
- Preservation of an existing valid selection.
- Google request construction, language-code mapping, response parsing, and normalized auth/quota/network errors.
- Native bridge error mapping and non-macOS unavailable behavior.

### Component tests

- Apple appears first and is selected by default.
- Apple needs no provider connection or API key.
- Google Cloud Translation appears only after its dedicated provider is configured.
- Google AI Studio and Google Cloud Translation connection states remain independent.
- Selecting every engine persists and updates Card Composer routing.
- Removing the active Google Translation key clears that unavailable selection safely.
- Translation failure preserves user-entered card content.

### Native and integration verification

- Exercise Apple Translation on a real supported Mac because Apple's Translation APIs do not function in simulators.
- Verify language-pack permission/download, installed language translation, unsupported pairing, and offline behavior.
- Run the Rust test suite, frontend unit/component suite, production frontend build, and Tauri compile checks.

## Rollout constraints

- Apple Translation is the default only when no prior preference exists and the native framework is supported.
- The feature must degrade safely on unsupported systems without breaking application startup.
- Google Translation is opt-in and is never contacted until selected for translation or explicitly validated during provider setup.
- No automatic fallback policy is included in this increment.
