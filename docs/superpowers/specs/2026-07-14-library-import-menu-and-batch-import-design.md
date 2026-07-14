# Library Import Menu and Batch Import

## Goal

Replace the separate Library import buttons with one accessible `Import` dropdown and allow a single local-file selection to import multiple PDFs without blocking the rest of the application.

## UI

- The Library header exposes one `Import` dropdown button.
- Its menu contains, in order:
  1. **Upload file** — a neutral file-upload icon; enabled; opens the existing native file picker with multiple selection enabled.
  2. **Google Drive** — the unaltered official Google Drive mark; enabled; opens the existing Google Drive flow.
  3. **iCloud Drive** — a neutral cloud icon with the label `Coming soon`; disabled.
  4. **OneDrive** — the official Microsoft OneDrive mark with the label `Coming soon`; disabled.
- The menu closes after choosing an enabled item or clicking outside it. It remains keyboard accessible, including focusable enabled choices and accurate disabled semantics for unavailable sources.

## Brand assets

- Google Drive's local SVG asset is sourced from Google's official Drive branding guidance and used without alteration.
- OneDrive's local SVG asset is sourced from Microsoft's official brand assets and used without alteration.
- Apple does not provide a generally reusable iCloud logo asset for third-party embedding. Until an approved asset and integration exist, iCloud Drive uses the app's neutral cloud icon rather than an unofficial copy.
- Assets live in the desktop app bundle, never a runtime CDN, so the menu remains functional offline.

## Batch local import

- The native picker permits selecting multiple PDF files in one interaction.
- The frontend starts a distinct background import for every selected file. It immediately adds one `PendingImport` item per file, so the Library grid renders a matching loading thumbnail/animation for every selected file.
- Imports may progress independently; one failed import must not prevent the others from completing. Existing per-file success and error handling remain in force.
- No modal or page-level loading state is introduced. The user can navigate, search, open documents, and invoke other actions while imports are underway.

## Theme and accessibility rules

- This UI must be implemented and visually verified in both light mode and dark mode.
- Menu backgrounds, borders, text, hover/focus/disabled states, and the `Coming soon` badge use semantic tokens from `tokens.css`; no hard-coded theme colors.
- Official brand marks retain their unmodified colors. Their adjacent text and all non-brand UI remain contrast-safe and theme-aware.

## Tests

- Library UI tests verify the consolidated Import menu, enabled local/Google actions, and unavailable iCloud/OneDrive items with `Coming soon` labels.
- App/import tests verify multiple selected local files create multiple pending-import placeholders and launch each import without serially blocking the UI.
- Existing relevant test suites and production build must pass. The final manual visual check covers menu and pending placeholders in light and dark mode.
