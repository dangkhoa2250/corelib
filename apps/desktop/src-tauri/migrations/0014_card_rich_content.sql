-- Rich card content and per-card media attachments (e.g. Pixabay images).
-- Nullable doc columns keep legacy plain-text cards unchanged (NULL = plain text).

ALTER TABLE cards ADD COLUMN front_doc_json TEXT;
ALTER TABLE cards ADD COLUMN back_doc_json TEXT;

CREATE TABLE card_media (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NULL REFERENCES cards(id) ON DELETE CASCADE,
  draft_id TEXT NULL,
  mime_type TEXT,
  relative_path TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('file', 'clipboard', 'pixabay')),
  pixabay_attribution TEXT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX card_media_card_id ON card_media (card_id);
CREATE INDEX card_media_draft_id ON card_media (draft_id);
CREATE INDEX card_media_created_at ON card_media (created_at);
