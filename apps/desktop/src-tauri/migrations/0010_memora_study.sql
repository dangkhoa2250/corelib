ALTER TABLE cards
  ADD COLUMN learning_step INTEGER
  CHECK (learning_step IS NULL OR learning_step IN (0, 1));

CREATE TABLE memora_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  new_cards_per_day INTEGER NOT NULL CHECK (new_cards_per_day BETWEEN 0 AND 999),
  desired_retention REAL NOT NULL CHECK (desired_retention BETWEEN 0.80 AND 0.97),
  updated_at TEXT NOT NULL
);

INSERT INTO memora_settings(id, new_cards_per_day, desired_retention, updated_at)
VALUES(1, 20, 0.90, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE deck_learning_settings (
  deck_id TEXT PRIMARY KEY NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  new_cards_per_day INTEGER NOT NULL CHECK (new_cards_per_day BETWEEN 0 AND 999),
  updated_at TEXT NOT NULL
);

CREATE TABLE card_introductions (
  card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  study_day TEXT NOT NULL,
  introduced_at TEXT NOT NULL
);

CREATE INDEX card_introductions_deck_day
  ON card_introductions(deck_id, study_day);

CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('all', 'deck')),
  deck_id TEXT REFERENCES decks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  CHECK (
    (scope_kind = 'all' AND deck_id IS NULL)
    OR (scope_kind = 'deck' AND deck_id IS NOT NULL)
  )
);

CREATE TABLE study_session_cards (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grant_token TEXT NOT NULL UNIQUE,
  expected_state TEXT NOT NULL,
  expected_due_at TEXT NOT NULL,
  admitted_as_new INTEGER NOT NULL CHECK (admitted_as_new IN (0, 1)),
  granted_at TEXT NOT NULL,
  consumed_at TEXT,
  review_log_id TEXT REFERENCES review_logs(id) ON DELETE SET NULL,
  result_json TEXT
);

CREATE INDEX study_session_cards_open
  ON study_session_cards(session_id, consumed_at, card_id);

UPDATE cards
SET learning_step = CASE
  WHEN state = 'learning'
    THEN CASE
      WHEN julianday(due_at) - julianday('now') <= (5.0 / 1440.0) THEN 0
      ELSE 1
    END
  WHEN state = 'relearning' THEN 0
  WHEN state = 'suspended' AND suspended_from_state = 'learning'
    THEN CASE
      WHEN julianday(due_at) - julianday('now') <= (5.0 / 1440.0) THEN 0
      ELSE 1
    END
  WHEN state = 'suspended' AND suspended_from_state = 'relearning' THEN 0
  ELSE NULL
END;
