# macOS 12 compatibility design

## Goal

Ship one macOS Universal release of Corelib that runs on macOS 12.0 and later on both Intel and Apple Silicon. Apple Translation remains available only on macOS 15.0 and later. On macOS 12 through 14, Corelib must start normally and users can translate with OpenCode Go or another configured cloud provider.

## Current problem

Corelib's release is Universal, but three build layers currently declare macOS 15.0 as the deployment target:

- Tauri writes `LSMinimumSystemVersion` as 15.0.
- The Rust build script links the application with a 15.0 minimum.
- The Apple Translation Swift package and linker use a 15.0 minimum.

As a result, Finder blocks the entire application on macOS 12 through 14 before Corelib can perform its existing Apple Translation availability check.

## Design

Corelib will keep a single Universal macOS artifact and set 12.0 as the deployment target consistently in Tauri, the Rust linker, and the Swift package build. The Apple Translation bridge will remain linked into the application, but every entry point that touches the macOS Translation framework will stay guarded by `@available(macOS 15.0, *)` or `#available(macOS 15.0, *)`.

The existing `apple_translation_available` command remains the runtime capability boundary:

- macOS 12–14 returns `false`; the settings UI does not offer Apple Translation and replaces a stale Apple Translation preference with an available fallback or no selection.
- macOS 15 and later returns `true`; Apple Translation remains selectable and works as it does today.
- OpenCode Go and other non-Apple providers are independent of the operating-system version and remain selectable whenever their API keys are configured.

No second installer, compatibility mode, or macOS-version-specific updater feed will be introduced.

## Failure handling

If the Translation framework cannot be safely weak-linked while targeting macOS 12, the build must fail rather than shipping an artifact that crashes at launch. In that case, implementation stops and the design is revisited; changing only `Info.plist` is explicitly not acceptable.

At runtime, Apple Translation availability failures continue to resolve to `false`, preventing the unavailable engine from becoming the active selection. OpenCode Go behavior and error handling are unchanged.

## Verification

Implementation will use a regression check that fails while any macOS deployment layer remains at 15.0. Verification must include:

1. Frontend and Rust tests relevant to translation and settings.
2. A fresh Universal Tauri release build from the tested checkout.
3. `Info.plist` inspection showing `LSMinimumSystemVersion` is 12.0.
4. Mach-O inspection showing both `x86_64` and `arm64`, with a 12.0 deployment target for both slices.
5. A fresh launch of the generated app on the available development Mac to catch link-time or startup failures.
6. A separate acceptance test on the user's Intel Mac running macOS 12.7.4. Until that test occurs, the handoff must state that real macOS 12 runtime compatibility is not yet manually verified.

## Non-goals

- Adding or changing translation providers.
- Making Apple Translation available below macOS 15.
- Supporting macOS versions earlier than 12.0.
- Creating separate Intel and Apple Silicon releases.
