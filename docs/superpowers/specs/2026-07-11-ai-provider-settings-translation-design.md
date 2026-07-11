# AI provider settings and card translation

## Goal

Add a Settings entry at the bottom of the desktop sidebar where the user can configure AI providers by entering only an API key. The app discovers models from the selected provider, lets the user choose a model, and uses the default configuration to translate selected text while creating a card.

## Scope

Initial built-in providers:

- Google AI Studio / Gemini API
- NVIDIA NIM
- OpenRouter
- Cerebras

The settings UI hides provider-specific base URLs. Each provider has a preset adapter that knows how to list models and send a text-generation request. A future custom-provider flow may be added, but is out of scope for this increment.

## User flow

1. User opens `Settings` from the bottom of the sidebar.
2. User selects a provider and enters an API key.
3. User clicks `Connect`; the app validates the key and loads models available from that provider.
4. User selects a model and marks a provider/model pair as the default.
5. User selects text in the reader and opens the card composer.
6. User clicks `Translate`; the app uses the saved default provider/model to translate the selected text and fills the card back field.
7. If translation fails, the composer remains usable for manual editing and shows a recoverable error.

API keys are not stored in card content and are not requested during card creation. They should be stored through the desktop secure-storage boundary when available; the UI must never display the full key after saving.

## Provider adapters

Use a provider-neutral interface:

```ts
interface AiProviderAdapter {
  listModels(apiKey: string): Promise<AiModel[]>;
  translate(input: TranslateInput): Promise<TranslateResult>;
}
```

Google uses its native Gemini models endpoint and filters to models supporting content generation. NVIDIA, OpenRouter, and Cerebras use their OpenAI-compatible model-list and chat-completions contracts. The adapter normalizes model IDs, display names, capabilities, and errors for the UI.

The model list is refreshed explicitly after connecting and can be refreshed later. Only text-generation-capable models should be shown for translation. Provider responses are never assumed to contain the same fields; parsing and error normalization stay inside adapters.

## Translation contract

The first version translates the selected text into the configured target language. The target language is a user setting with Vietnamese as the initial default. The request asks for concise natural translation and returns structured JSON:

```ts
interface TranslateResult {
  translation: string;
  importantPhrases: Array<{ text: string; meaning: string }>;
}
```

The UI uses `translation` to fill `back`. Phrase explanations are optional metadata for a later sentence-card enhancement and must not block saving a card.

## UI changes

- Add `Settings` as a bottom-pinned sidebar action.
- Add a Settings page/route with provider cards, API-key input, Connect/Refresh actions, model dropdown, default-provider selection, and connection/error states.
- Add a `Translate` action to `CardComposer`.
- Disable Translate while loading and preserve user-edited back text unless the user explicitly accepts the generated translation.

## Persistence and compatibility

Persist provider configuration separately from learning cards. Existing cards and scheduler behavior remain unchanged. Persist provider ID, selected model, target language, and a secure-storage reference for the API key; never put raw keys into card JSON, logs, tests, or ordinary app state snapshots.

## Error handling

- Invalid key: show provider-authentication error and keep existing settings.
- Model-list failure: show retry action; do not overwrite a previously selected model.
- Unsupported model or rate limit during translation: show a concise error and retain manual editing.
- Malformed model/translation response: treat as provider error and do not save partial generated content.

## Verification

- Unit-test each provider adapter's model parsing, filtering, auth error, rate-limit error, and translation parsing.
- Component-test Settings for provider selection, API-key entry, model loading, default selection, and redacted key display.
- Component-test CardComposer translation success, loading, failure, and preservation of manual edits.
- Run the existing desktop unit suite and production build.

## Non-goals

- Text-to-speech/audio generation.
- Dictionary lookup, IPA, or per-token annotations.
- Arbitrary custom endpoints.
- Multi-user account synchronization.
