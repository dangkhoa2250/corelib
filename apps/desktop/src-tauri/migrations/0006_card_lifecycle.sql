PRAGMA foreign_keys = OFF;

-- 1. Rebuild cards
CREATE TABLE cards_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  deck_id TEXT REFERENCES decks(id),
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
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_from_deck_name TEXT,
  suspended_from_state TEXT CHECK (suspended_from_state IN ('new', 'learning', 'review', 'relearning') OR suspended_from_state IS NULL),
  CHECK ((deleted_at IS NULL AND deck_id IS NOT NULL) OR deleted_at IS NOT NULL)
);

INSERT INTO cards_v2 (
  id, deck_id, front, back, state, due_at, stability, difficulty,
  memory_state_json, reps, lapses, last_review_at, created_at, updated_at
)
SELECT id, deck_id, front, back, state, due_at, stability, difficulty,
       memory_state_json, reps, lapses, last_review_at, created_at, updated_at
FROM cards;

-- 2. Rebuild card_sources to point to new cards
CREATE TABLE card_sources_v2 (
  card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards_v2(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  page INTEGER NOT NULL CHECK (page > 0),
  quote TEXT NOT NULL,
  rects_json TEXT NOT NULL
);

INSERT INTO card_sources_v2 (card_id, document_id, page, quote, rects_json)
SELECT card_id, document_id, page, quote, rects_json FROM card_sources;

-- 3. Rebuild review_logs to point to new cards
CREATE TABLE review_logs_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards_v2(id) ON DELETE CASCADE,
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

INSERT INTO review_logs_v2 (
  id, card_id, reviewed_at, rating, prior_state, next_state,
  prior_due_at, next_due_at, interval_seconds, elapsed_ms, scheduler_version
)
SELECT id, card_id, reviewed_at, rating, prior_state, next_state,
       prior_due_at, next_due_at, interval_seconds, elapsed_ms, scheduler_version
FROM review_logs;

-- 4. Rebuild card_tags to point to new cards
CREATE TABLE card_tags_v2 (
  card_id TEXT NOT NULL REFERENCES cards_v2(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);

INSERT INTO card_tags_v2 (card_id, tag_id)
SELECT card_id, tag_id FROM card_tags;

-- 5. Drop old tables
DROP TABLE card_sources;
DROP TABLE review_logs;
DROP TABLE card_tags;
DROP TABLE cards;

-- 6. Rename new tables
ALTER TABLE cards_v2 RENAME TO cards;
ALTER TABLE card_sources_v2 RENAME TO card_sources;
ALTER TABLE review_logs_v2 RENAME TO review_logs;
ALTER TABLE card_tags_v2 RENAME TO card_tags;

-- 7. Recreate indexes and triggers
CREATE INDEX cards_active_deck_updated_id ON cards(deck_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX cards_state_due_at_id ON cards(state, due_at, id) WHERE deleted_at IS NULL;
CREATE INDEX cards_trash_deleted_id ON cards(deleted_at DESC, id) WHERE deleted_at IS NOT NULL;

CREATE INDEX card_sources_document_id_page ON card_sources (document_id, page);
CREATE INDEX review_logs_card_id_reviewed_at ON review_logs (card_id, reviewed_at);

CREATE TRIGGER cards_delete_card_text
AFTER DELETE ON cards
BEGIN
  DELETE FROM card_text WHERE card_id = OLD.id;
END;

PRAGMA foreign_keys = ON;
