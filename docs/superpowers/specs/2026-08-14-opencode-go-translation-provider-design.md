# OpenCode Go Translation Provider Design

## Goal

Add OpenCode Go as a selectable AI translation provider in the existing Corelib desktop Settings > Model flow. Users can save an OpenCode API key, choose a Go model, and use it to translate text into card backs.

## Scope

- Add the `opencode-go` provider to the existing frontend and Rust provider registries.
- Use the OpenCode Go OpenAI-compatible endpoint: `https://opencode.ai/zen/go/v1`.
- Reuse the current bearer-authenticated `GET /models` and `POST /chat/completions` adapter.
- Reuse current plaintext JSON API-key storage (`ai-keys.json`).
- Display the bundled OpenCode provider icon in Settings.
- Extend unit and UI coverage for the added provider.

## Non-goals

- No custom endpoint entry, new settings route, command, or Command Palette item.
- No changes to API-key storage or migration to macOS Keychain.
- No separate HTTP adapter unless the documented OpenAI-compatible API proves incompatible with the existing request/response contract.

## Architecture and data flow

1. The frontend adds `opencode-go` to `AiProviderId` and `AI_PROVIDERS`, so it appears in the existing Add provider picker.
2. Settings saves the supplied key through the existing Tauri command and requests models through the existing bridge.
3. Rust maps `opencode-go` to `https://opencode.ai/zen/go/v1`. Its existing OpenAI-compatible branch sends bearer-authenticated requests to `/models` and `/chat/completions`.
4. The selected model persists using the existing AI translation-engine ID format, `ai:opencode-go:<model>`.
5. Rust accepts that engine ID in its provider validation allowlist and dispatches translation through the reused provider adapter.

## UI and branding

OpenCode Go uses the existing provider-management UI unchanged: key input, model refresh, model selection, and removal. The provider brand record adds the bundled `opencode.svg` icon. Unknown model families retain the existing fallback model icon.

## Errors and compatibility

Existing behavior handles missing keys, model-list failures, request failures, and malformed translation responses. No desktop WebView CSP change is needed because requests are made by the Rust backend. Existing translation engine values remain unaffected; the new provider is only accepted in addition to the current providers.

## Verification

- Rust tests cover the OpenCode Go base URL and allow `ai:opencode-go:<model>` engine IDs.
- AI bridge/domain/UI tests cover provider listing, connection state, and selecting the provider/model where applicable.
- Provider-brand tests cover the OpenCode Go brand.
- Run the affected desktop unit tests and type/lint/build checks selected by the repository scripts.
- If a fresh desktop runtime check is performed, record the revision, launch mode, and exact artifact path in the handoff.
