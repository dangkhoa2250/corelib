# Flashcard pronunciation design

## Goal

Let learners hear the source text without leaving the flashcard workflow.

## Scope

Add an icon-only speaker control that uses the operating system's installed text-to-speech voices through the Web Speech API. No audio files, network calls, API credentials, or persisted audio data are introduced.

## Interaction design

- In the card composer, a circular speaker control appears beside the `Front` field label and reads the current front text.
- In the reader's selected-text toolbar, the speaker control appears before `Dismiss` and reads the selected quote without clearing that selection.
- During review, the control appears directly after the front text. It remains there on both the front and revealed back face, so the learner can replay the source term after seeing its translation.
- The back text has no speaker control.
- Each control has an accessible name: `Play pronunciation`. A playing control exposes `Stop pronunciation`.

## Speech behavior

- Clicking an idle control cancels an in-progress utterance and begins reading its text.
- Clicking the currently playing control cancels playback.
- The utterance uses the known front language where available. Composer and selected text derive that language with the existing language detector; review uses the saved `frontLanguage`. If no language is known, the host voice chooses its default language.
- Empty or whitespace-only text does not start playback.
- If the Web Speech API is unavailable, the control is disabled with an explanatory tooltip; all create and review functions continue to work.
- Component cleanup cancels an utterance begun by that component, avoiding speech after navigation.

## Architecture

Create a focused client-side pronunciation helper/hook that owns feature detection, utterance lifecycle, active state, and cleanup. The three UI surfaces consume this shared behavior and keep their own layout responsibilities. This avoids persisting audio or adding Tauri backend commands.

## Testing

- Unit-test the helper against a mocked browser speech API: start with text/language, stop on repeat, cancel prior speech before replacement, ignore empty text, and cleanup.
- Component tests verify accessible speaker controls in the composer, selected-text toolbar, and review card; clicking passes the appropriate front/selected text and does not submit, dismiss, create, or flip the card.
- Run the affected Vitest tests and production TypeScript/Vite build.
