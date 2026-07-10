# Library

Desktop application built with Tauri, React, and TypeScript.

## Native learning cards

Select text in the PDF reader and choose **Create flashcard**. The selected text becomes Front; write and edit Back yourself, then choose a deck and optional tags. Review today uses FSRS 6.6 with Again, Hard, Good, and Easy ratings. Cmd/Ctrl+K searches both documents and cards, and Show source returns to the original PDF page when it is still available.

The learning data is local SQLite data. Removing a source PDF keeps its card and quote, but marks the source unavailable. Sync, AI card generation, cloze cards, and advanced statistics are intentionally deferred.
