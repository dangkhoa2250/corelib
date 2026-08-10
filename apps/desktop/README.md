# Library desktop

Library is the Corelib desktop application. The macOS and Windows editions share the same React, TypeScript, Rust, SQLite, and Tauri codebase; platform integrations live behind explicit platform boundaries.

## Run and verify

```bash
npm ci
npm test
npm run build
cargo test --all-targets --manifest-path src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path src-tauri/Cargo.toml -- -D warnings -A linker-messages
```

Run the current checkout with `npm run tauri dev`.

## Windows 11 x64

The supported Windows target is Windows 11 x64 with the evergreen Microsoft Edge WebView2 Runtime. Library uses the standard Windows title bar, Segoe UI, Windows spacing, and Ctrl-based shortcuts. The user-facing product name and Tauri identifier remain `Library` and `com.library.desktop`.

Build a local, unsigned NSIS installer without updater signing secrets:

```powershell
npm run tauri:build:windows
```

The installer is written to `src-tauri/target/release/bundle/nsis/*-setup.exe`. It installs for the current user and downloads the evergreen WebView2 bootstrapper when needed. Unsigned local builds may show a Microsoft Defender SmartScreen warning; public Authenticode signing is intentionally deferred until the certificate and CI secrets are available.

Windows creates a new local library under the application's Windows roaming AppData directory. It does not import or synchronize a macOS library. The SQLite schema and application identifier remain shared so future product features can evolve without a Windows-only fork.

Set `ACCOUNT_API_BASE_URL` while building to connect account features to the shared PocketBase service. CI and releases read it from the GitHub repository variable named `ACCOUNT_API_BASE_URL`; the backend URL is not committed to source.

## Translation

Apple Translation is shown only on macOS. On supported Windows WebView2 runtimes, Library exposes **Windows Translation**, which uses the browser's on-device `Translator` and `LanguageDetector` APIs without an API key. The first use of a language pair may download a model; translation then runs locally and can work offline. The integration is runtime feature-detected, so unsupported WebView2 versions do not show it.

Google Translate and configured AI providers remain explicit alternatives. Library does not silently send text to a cloud provider when a user selected the private Windows engine.

## Command surfaces

- **Cmd/Ctrl+K — Quick Open:** navigate to internal destinations such as Library, Memora, Trash, Settings, documents, decks, and cards.
- **Shift+Cmd/Ctrl+K — Command Palette:** run actions such as Import PDF, Review today, theme changes, and selecting an available translation engine.

Public destinations and actions are declared in the typed command registry. Registry coverage tests must pass whenever a public route or action is added.

## Learning data

PDF reading, cards, decks, study scheduling, trash, statistics, and settings use the shared native backend. Learning data is stored in local SQLite. Removing a source PDF keeps its card and quote but marks the source unavailable. OAuth and account tokens use the operating-system credential store.

## CI and releases

`.github/workflows/windows-desktop.yml` tests the frontend and Rust backend on Windows, runs Clippy, builds an unsigned NSIS installer, and uploads it as a workflow artifact.

Tags matching `desktop-vX.Y.Z` run `.github/workflows/release-desktop.yml`. The workflow builds signed Tauri updater artifacts for the native macOS runner architecture and Windows x64, then publishes one `latest.json` containing both platform entries.

Before publishing a tag:

1. Match the version in `src-tauri/tauri.conf.json` to the tag.
2. Set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets.
3. Replace the updater public-key placeholder in `tauri.conf.json` with the matching public key.
4. Set the `ACCOUNT_API_BASE_URL` repository variable.
5. Verify the previous signed build can install the new update and relaunch on both platforms.
6. Confirm the release contains the macOS archive and signature, Windows setup executable, Windows `.nsis.zip` and signature, and the combined `latest.json`.

Tauri updater signatures authenticate updates but do not replace Windows Authenticode signing. Add certificate-backed Authenticode signing before treating the NSIS installer as a public production release.

## End-to-end release checks

Before announcing a release, verify account registration and approval, feature gates, analytics opt-in and opt-out, PDF import and reading, Memora card creation and study, local translation, cloud-provider translation when configured, updater installation, and the PocketBase backup restoration drill documented under `services/pocketbase`.
