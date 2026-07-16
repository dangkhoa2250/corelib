# Corelib agent instructions

## Desktop app verification is version-sensitive

Do **not** treat an already-open `Library.app` or an existing `tauri dev`
process as evidence for the current checkout. It may be a binary from an
earlier commit, even when its screen looks identical.

Before reporting a macOS/Tauri UI behavior as reproduced, fixed, or manually
verified:

1. Record the source revision with `git rev-parse --short HEAD` and inspect
   `git status --short` to identify the exact code being tested.
2. Identify any running `tauri dev`, `vite`, or `library_desktop` processes.
   Do not silently reuse them. Restart the development app from the current
   checkout, or explicitly state that no fresh runtime verification occurred.
3. For a release-app test, run `npm run tauri build` from `apps/desktop` after
   the relevant source changes. Launch only the freshly generated artifact at
   `apps/desktop/src-tauri/target/release/bundle/macos/Library.app`; confirm
   its modification time is newer than the build started. Do not substitute an
   older app in `/Applications`.
4. Do not overwrite or replace the user's installed `/Applications/Library.app`
   without their explicit approval.
5. Distinguish unit-test/build results from real WKWebView behavior. A passing
   Vitest test or Vite build does not prove a media, focus, scroll, or rendering
   issue is fixed in the macOS app.

In the final handoff for desktop UI work, state the commit, launch mode
(`tauri dev` or release), and exact artifact path that was actually tested. If
fresh runtime testing was not performed, say so plainly rather than inferring a
result from an older window or binary.
