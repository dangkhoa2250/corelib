-- Replace the Pixabay-specific media contract without losing existing rows.
-- SQLite requires rebuilding the table to change the CHECK constraint and column name.
-- LibraryDatabase applies migrations inside one transaction with foreign-key
-- enforcement enabled, so the replacement keeps the same cards(id) FK and
-- cascade semantics throughout the rebuild.

ALTER TABLE card_media RENAME TO card_media_0014;

CREATE TABLE card_media (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NULL REFERENCES cards(id) ON DELETE CASCADE,
  draft_id TEXT NULL,
  mime_type TEXT,
  relative_path TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('file', 'clipboard', 'web')),
  attribution TEXT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO card_media (
  id, card_id, draft_id, mime_type, relative_path, source_type, attribution,
  width, height, size_bytes, created_at, updated_at
)
SELECT
  id, card_id, draft_id, mime_type, relative_path,
  CASE source_type WHEN 'pixabay' THEN 'web' ELSE source_type END,
  pixabay_attribution, width, height, size_bytes, created_at, updated_at
FROM card_media_0014;

DROP TABLE card_media_0014;

CREATE INDEX card_media_card_id ON card_media (card_id);
CREATE INDEX card_media_draft_id ON card_media (draft_id);
CREATE INDEX card_media_created_at ON card_media (created_at);
