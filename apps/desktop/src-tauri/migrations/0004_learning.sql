PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT,
  color TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY NOT NULL,
  deck_id TEXT NOT NULL REFERENCES decks(id),
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('new', 'learning', 'review', 'relearning', 'suspended')),
  due_at TEXT NOT NULL,
  stability REAL,
  difficulty REAL,
  memory_state_json TEXT,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_review_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_sources (
  card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id),
  page INTEGER NOT NULL CHECK (page > 0),
  quote TEXT NOT NULL,
  rects_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_logs (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  prior_state TEXT NOT NULL,
  next_state TEXT NOT NULL,
  prior_due_at TEXT NOT NULL,
  next_due_at TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  scheduler_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS card_tags (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS card_text
  USING fts5(card_id UNINDEXED, body, tokenize = 'unicode61');

CREATE INDEX IF NOT EXISTS cards_state_due_at_id
  ON cards (state, due_at, id);

CREATE INDEX IF NOT EXISTS card_sources_document_id_page
  ON card_sources (document_id, page);

CREATE INDEX IF NOT EXISTS review_logs_card_id_reviewed_at
  ON review_logs (card_id, reviewed_at);
