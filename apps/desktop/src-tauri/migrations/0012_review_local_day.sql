-- Keep the migration tolerant of old development fixtures that recorded the
-- learning migration id but did not contain its optional review table.
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

ALTER TABLE review_logs
  ADD COLUMN local_day TEXT NOT NULL DEFAULT '';

CREATE INDEX review_logs_local_day
  ON review_logs(local_day, reviewed_at);
