# Rich Flashcards with Pixabay Media

**Date:** 2026-08-01
**Status:** Approved design

## Scope and goals

Add optional rich documents to the existing flashcard editor while retaining
the existing plain-text `front` and `back` values for search, scheduling,
language detection, translation, and legacy consumers. Add local media
staging and server-side Pixabay search without exposing the Pixabay key to the
WebView. Review must render validated rich documents through a fixed renderer;
the Card Browser and Trash remain plain-text surfaces.

This is not a new route or a new editor command-palette action. The feature is
inside the existing card editor and existing Settings navigation.

## Rich document format and validation

Each face is a Tiptap JSON document with a `doc` root and recursively validated
children. The editor uses these Tiptap requirements:

- `StarterKit`
- `underline`
- `text-style` and `color`
- `highlight`
- `text-align`
- `image`
- `file-handler`

The server applies the same allowlist on every save. Allowed nodes are
`doc`, `paragraph`, `heading` (levels 1–3), `text`, `bulletList`,
`orderedList`, `listItem`, `hardBreak`, and `image`. Allowed marks and
attributes must cover the configured extensions: `bold`, `italic`, `strike`,
`underline`, text-style/color, highlight, and text-align attributes. Unknown
nodes, marks, and attributes are rejected. Documents also enforce bounded
depth and node count, and text nodes contain strings.

The rich image node is exactly:

```ts
{ mediaId: string; alt: string; widthPercent: number }
```

It has no `src`, `asset`, or `width` field. `widthPercent` is constrained to
10–100. The renderer resolves `mediaId` to a local path and then to a Tauri
asset-protocol URL; it never accepts a caller-provided URL.

The field value is valid when it contains text, images, or both, with at most
10 images per face. Image files are limited to 10 MB and MIME types JPEG, PNG,
WebP, or GIF. Plain text derived from a rich document continues to populate
the existing `front`/`back` columns.

## Migration and data model

The migration is exactly `0014_card_rich_content.sql`. It adds nullable
`cards.front_doc_json` and `cards.back_doc_json` columns. `NULL` preserves the
legacy plain-text path.

It also creates `card_media` with fields covering:

- media ID;
- card ID (nullable while staged);
- MIME type;
- relative path;
- source type (`file`, `clipboard`, or `pixabay`);
- Pixabay attribution (nullable for non-Pixabay media); and
- creation/update timestamps.

The table may additionally record the draft ID and ordinary file metadata
needed for lifecycle checks, but it must not require a content-addressed key,
global media sharing, or provider-specific assumptions. Rich documents refer
to rows by `mediaId`; a media row belongs to the saved card that references it.

Media paths are relative to the application media root and are resolved only
after validating that the referenced row belongs to the card or active draft.

## Domain model and commands

`LearningCard` gains `frontDoc`, `backDoc`, and `media`. Create and update
inputs gain the rich documents and `mediaDraftId`. The existing plain-text
fields remain available for derived text and legacy callers.

The Rust/Tauri API is:

- `save_pixabay_key`, `check_pixabay_key`, and `delete_pixabay_key`;
- `search_pixabay_images(query, page)`;
- stage an image from a local file, clipboard, or Pixabay result;
- discard a media draft;
- resolve a media path for a validated `mediaId`; and
- create/update a card with rich documents and `mediaDraftId`.

Pixabay search uses SafeSearch and returns exactly 12 results per page. Search
and download happen in Rust. The key is stored with the macOS Keychain
service `com.library.desktop.pixabay`, never in SQLite, local storage, a
settings file, or the WebView.

## Media lifecycle

1. A draft stages files under `card-media/staging/<draftId>`. Staging supports
   local file selection, clipboard images, and Pixabay results.
2. The draft records the staged media IDs used by each rich document. A save
   validates the documents and computes the referenced set.
3. During the same save transaction, only referenced staged media move to
   `card-media/<cardId>` and the card plus media metadata commit atomically.
   Unreferenced staged files remain disposable draft material.
4. Discarding a draft removes its staged rows/files. A startup cleanup removes
   staged material older than 24 hours.
5. Updating a card removes no-longer-referenced media only after the card save
   succeeds. A failed save leaves the prior card and its files intact.
6. Moving a card to Trash retains its media. Permanent deletion and Empty
   Trash delete the card's files. No renderer may delete media merely because
   a card is in Trash.

## Editor behavior

`CardRichTextEditor` replaces the editor's plain textarea path while preserving
the existing create/edit flows. Each focused field has the common toolbar
commands required by the approved design: undo/redo, bold, italic, underline,
strike, text color, highlight, paragraph/heading levels 1–3, bullet and
ordered lists, text alignment, image insertion, and clear formatting where
the existing toolbar exposes it. Toolbar commands operate on the focused
field only.

Images can be inserted at the cursor repeatedly, pasted, or dropped. The
editor stages each accepted file, inserts the exact image node above, and
supports resizing from 10% through 100%. Keyboard deletion removes the image
node and permits its staged media to be discarded when no longer referenced.

The Pixabay button is adjacent to Translate. It targets the Back field and
searches the plain-text Front value. Its result grid is below Tags and covers
loading, no-key/setup, empty results, result display, attribution, download
failure, and retry states. Each result shows the required Pixabay attribution;
the full image is staged locally before it is inserted into the document.

Translation creates a paragraph when Back is empty. When Back is non-empty it
inserts the translated text at the current selection without replacing or
discarding the surrounding rich content.

While a draft has a saved `source`, the source preview is hidden. Saving and
editing source metadata must not erase the rich documents or media references.

## Rendering and existing surfaces

Review uses a safe fixed node renderer for rich fronts and backs. The renderer
maps only the allowlisted nodes/marks to fixed React elements and resolves
images through the Tauri asset protocol from validated media IDs. It must not
use `dangerouslySetInnerHTML`, remote full-size image URLs, or arbitrary HTML.
The existing derived plain text remains available to YouGlish and other
behavior that depends on text.

The Card Browser and Trash show plain-text summaries only; they do not use the
rich renderer. Legacy cards with `NULL` documents continue through the
existing plain-text editor/review behavior.

## Settings and registration

The Pixabay key controls live in `SettingsSection = 'images'`. The Quick Open
destination is registered and searchable as `Settings › Media`, with the
corresponding command-registry coverage tests. There is no command-palette
editor action: the rich editor and media picker remain internal card-editing
surfaces.

## Scroll surfaces

Use the existing `ScrollArea` for the editor content and the Pixabay result
grid. The custom thumb-side content inset is exactly 20px. The grid must use
parent-scroll only: the parent owns scrolling and the grid itself must not
introduce a nested scroll container. Add the native WKWebView scrollbar-track
reset and custom-thumb inset coverage required by the scroll-surface skill;
do not add an independent `overflow: auto` surface or a second scrollbar.

## Testing plan and commands

Run from `apps/desktop`:

```sh
npm run test
npm run build
npm run test:e2e
```

Rust tests must cover migration `0014_card_rich_content.sql`, nullable
document columns, the `card_media` fields/constraints, rich-document
validation including every configured Tiptap mark/attribute, plain-text
derivation, media staging from all three sources, atomic referenced-media
commit, discard, 24-hour cleanup, update cleanup after successful save,
Trash retention, permanent deletion, Empty Trash, Pixabay key save/check/delete,
SafeSearch pagination with exactly 12 results, and media-path resolution.

Frontend tests must cover toolbar allowlisting, focused-field commands, paste
and drop insertion, 10-image and 10 MB/type limits, 10–100% resize and
keyboard deletion, Pixabay grid states/attribution/retry, Back translation
insertion semantics, source-preview hiding, the fixed asset-protocol renderer,
plain-text Browser/Trash summaries, Settings `images` and Quick Open registry
coverage, and the exact ScrollArea/inset/parent-scroll rules.

Do not claim desktop behavior from unit tests or a Vite build. Before fresh
desktop verification, record `git rev-parse --short HEAD` and `git status
--short`, identify any running Tauri/Vite/library processes, and restart from
this checkout rather than reusing an old app. For release verification, run
`npm run tauri build` from `apps/desktop`, launch only
`apps/desktop/src-tauri/target/release/bundle/macos/Library.app`, and confirm
the artifact is newer than the build start. Do not replace
`/Applications/Library.app`. Report the commit, launch mode (`tauri dev` or
release), and exact artifact path. The manual pass covers rich text and image
create/save/reopen/review, Pixabay key behavior, source-preview behavior,
translation, discard/stale cleanup, Trash/permanent-delete behavior, and
light/dark scrollbar track/thumb behavior.

## Acceptance criteria

- Rich front/back documents save with exactly the approved image node shape
  and derive matching plain text.
- Files from file, clipboard, and Pixabay sources follow the staging and
  atomic-save lifecycle without deleting Trash media prematurely.
- Pixabay uses the Keychain service above, SafeSearch, and exactly 12 results.
- Review is safe and local-asset based; Browser and Trash remain plain text.
- Settings, Quick Open, command registration, and ScrollArea requirements are
  covered by tests.
- The specified test commands and fresh desktop verification are completed
  and reported with the tested revision and artifact.
