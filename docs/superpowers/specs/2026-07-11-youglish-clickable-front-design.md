# Design: Clickable Flashcard Front with YouGlish

## Overview

Add in-context YouGlish pronunciation lookup to the front of a review card. Every card stores the language of its front text. During review, each word in the front is clickable. Selecting a word keeps the card on its front, highlights that word with a subtle blue background, and opens the official YouGlish widget directly below the card.

The feature is limited to the desktop review flow. It does not change scheduling, card back content, deck settings, or existing source-card behavior.

## Goals

- Let a learner hear a selected word pronounced in real video contexts without leaving review.
- Save a per-card `frontLanguage` so queries use the correct YouGlish language.
- Detect the front language locally when front text changes, while preserving an explicit manual override.
- Preserve the existing flashcard interaction: clicking empty card space flips the card.
- Embed the official YouGlish widget lazily and visibly attribute YouGlish.

## Non-goals

- Bulk language detection for all existing cards.
- Automatic language detection for the card back.
- Searching phrases or multi-word text by selection. Each clickable word is searched independently.
- Replacing YouGlish with an external browser, a custom video player, or a third-party pronunciation service.

## Data Model and Language Selection

### Stored value

Add nullable `front_language` to `cards`. Its value is a supported base BCP-47 language code, such as `en`, `fr`, `ja`, or `vi`. `NULL` means the language has not been confirmed or detected yet.

`LearningCard`, card-browser rows, create-card input, and update-card input expose this field as `frontLanguage: string | null`.

### Creation and editing

The card composer and the card edit flow show a Front language control beside the Front field.

- When the front text has changed and the user has not manually chosen a language, a local detector proposes a supported language code.
- The control shows the detected language and permits choosing any supported YouGlish language.
- A manual selection is authoritative. Subsequent text changes do not replace it automatically.
- Empty, ambiguous, or unsupported results leave `frontLanguage` unset and show a concise prompt to choose a language before YouGlish can be used.

The detector operates locally. It is best-effort for sentences; a single short or shared word may be ambiguous, so the manual picker is always available.

### Existing cards

Existing rows gain `NULL` through an additive migration. No background scan occurs. The composer/editor detects a language when an old card is opened or its Front changes; review asks the learner to select a language if the value remains absent.

## Review Experience

### Clickable words

`ClickableFrontText` receives front text, `frontLanguage`, the selected word, and a selection callback.

- It preserves original whitespace and punctuation in display.
- Only word tokens are interactive. A query normalizes the clicked token by removing leading and trailing punctuation; the visible token is not changed.
- The current selection has a pale blue fill with a small radius. Hover and keyboard focus use a lighter version of the same treatment.
- Tokens are native buttons or equivalent accessible controls, have an accessible label such as “Hear ‘learn’ in YouGlish”, and support Enter and Space.

### Flip behavior

The front card remains the current face after a word selection. The token handler stops propagation so selecting a word cannot trigger the card’s click-to-flip behavior. Clicking any non-interactive area of the front card still flips it exactly as it does today.

When the user flips to the back, changes card, completes the session, or leaves review, any active YouGlish panel closes and its widget is disposed. No audio/video continues in the background.

### YouGlish panel

`YouGlishPanel` is rendered directly below the flashcard, not inside it. It appears only after a valid word and supported `frontLanguage` are selected.

- It lazy-loads the official YouGlish widget script on the first lookup, then calls the widget API to search the selected word in the selected language.
- It replaces the existing query when a learner selects another word on the same card.
- It includes a close control and a continuously visible “Powered by YouGlish.com” attribution.
- The player container is never smaller than 200 × 200 px when visible, satisfying the widget’s YouTube-player requirement.
- The panel presents compact loading, no-results, unsupported-language, and network/widget-error states without blocking review.

## Architecture

```text
Card composer / card editor
  -> local language detector + manual LanguagePicker
  -> create/update command
  -> cards.front_language
  -> LearningCard.frontLanguage

ReviewPage front
  -> ClickableFrontText
  -> selected token + stopPropagation
  -> YouGlishPanel
  -> official YouGlish Widget API
```

### Frontend components

- `LanguagePicker`: translates stored codes to readable labels, receives detection proposals, tracks whether the user manually selected a value, and returns `string | null`.
- `ClickableFrontText`: tokenizes display text, owns no widget state, and emits the normalized clicked query.
- `YouGlishPanel`: loads the external script once, creates/searches a widget, reports loading/error state, and destroys its instance during cleanup.
- `ReviewPage`: owns the selected word and panel visibility, resets both when the card changes or flips, and keeps all existing rating behavior unchanged.

### API and persistence

The Rust model, SQL mapping, create command, update command, list/get commands, TypeScript domain models, and API wrappers are updated together so `frontLanguage` cannot silently disappear on edit.

The migration is additive:

```sql
ALTER TABLE cards ADD COLUMN front_language TEXT;
```

The application validates codes against the supported YouGlish language map before persisting and before loading the widget.

### Security and legal integration

The Tauri CSP is extended only for the official YouGlish script and its YouTube-hosted player resources; it remains restrictive for unrelated origins. Required permissions cover script, frame, image, and connection sources used by the widget rather than enabling broad wildcards.

The app’s legal/information area links to YouTube Terms of Service and Google Privacy Policy, and explains that YouGlish/YouTube may use cookies or device storage where consent is required. The desktop feature retains YouGlish attribution at all times.

Before commercial distribution, or any mobile implementation, the project owner must contact YouGlish for the permission their published developer policy requests. This design does not add mobile support.

## Error Handling

| Condition | User-facing result |
| --- | --- |
| No confirmed front language | No widget loads; a message asks the learner to choose the front language in card edit. |
| Unsupported language | No widget loads; the message identifies the unsupported language and offers the same next step. |
| Script is loading | Panel reserves player space and shows a loading label. |
| Widget or network failure | Panel shows a non-blocking error and Retry/Close controls. |
| No matching videos | Panel says that no YouGlish result was found and remains closable. |

Failures never reveal the answer, advance a card, change scheduling data, or prevent rating a revealed card.

## Testing

### Persistence and API

- Migration preserves existing cards and yields `frontLanguage: null` for them.
- Create, get, list, and update round-trip a valid `frontLanguage`.
- Invalid language values are rejected consistently by the command boundary.

### Composer and editor

- A detection proposal appears after Front changes when no manual value exists.
- Manual selection wins over future automatic proposals.
- The selected value is sent on save/update.

### Review UI

- A punctuation-wrapped word produces the normalized lookup query while rendering unchanged text.
- Clicking a word opens the panel and does not reveal the back.
- Clicking unused front-card space reveals the back.
- The selected token uses the chosen pale-blue highlight and has keyboard access.
- A second word replaces the widget query.
- Flipping, changing cards, or unmounting removes the panel and disposes the widget.
- Loading, no-results, missing-language, and error states are accessible and do not break ratings.

## Acceptance Criteria

1. A card can persist a manual or detected `frontLanguage`.
2. In review, every word of a valid-language front can be selected without flipping the card.
3. The chosen word is highlighted pale blue and its official YouGlish result is visible beneath the flashcard.
4. Unused flashcard space still flips the card.
5. The YouGlish panel closes and playback is cleaned up whenever the learner leaves the active front card.
6. Missing/ambiguous language and external widget failures leave review usable and explain the next action.
