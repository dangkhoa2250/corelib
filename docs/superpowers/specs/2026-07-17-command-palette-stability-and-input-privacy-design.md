# Command Palette Stability and Input Privacy Design

## Goal

Make the desktop command palette stable while typing, remove the visual elements the user rejected, and disable native text suggestions throughout the app.

## Command palette behaviour

Typing a new query must retain the currently rendered result list until the latest debounced search completes. The palette will mark the list as busy during that interval and must not execute a stale result through Enter or a click. When the latest request resolves, it atomically replaces the result list and clears the busy state. A failed latest request clears the list, shows the existing error message, and clears the busy state.

This removes the visible empty-list flash without permitting an outdated command to run.

## Palette visual treatment

The shared palette CSS will:

- remove the divider below the search field;
- remove the decorative square pseudo-element before every result;
- keep the neutral selected/match colours already derived from theme tokens;
- paint the WebKit scrollbar track and corner with the palette surface token, with a themed thumb, so WKWebView cannot expose a white background.

## Input privacy guard

A root-mounted `InputPrivacyGuard` will set these properties on editable text controls throughout the desktop app:

- `autocomplete="off"`
- `autocorrect="off"`
- `autocapitalize="off"`
- `spellcheck="false"`

It will apply them to existing controls, newly added DOM nodes, and controls when they receive focus. This covers native inputs, textareas, and contenteditable elements without duplicating attributes in every feature. It intentionally applies to password and account inputs as requested: browser/WKWebView text suggestions and stored-value autofill must remain off globally.

## Validation

Focused palette tests will cover retained rows and blocked stale execution while a query is pending. Input guard tests will cover initial, dynamically inserted, and focus-time controls. Existing palette/view, application, style, build, and E2E coverage will run after implementation.
