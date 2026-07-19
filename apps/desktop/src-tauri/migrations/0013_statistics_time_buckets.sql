CREATE TABLE activity_session_time_buckets (
  session_id TEXT NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  local_day TEXT NOT NULL,
  bucket_start_hour INTEGER NOT NULL
    CHECK (bucket_start_hour IN (0, 4, 8, 12, 16, 20)),
  raw_active_ms INTEGER NOT NULL DEFAULT 0 CHECK (raw_active_ms >= 0),
  PRIMARY KEY (session_id, local_day, bucket_start_hour)
);

CREATE INDEX activity_session_time_buckets_day
  ON activity_session_time_buckets(local_day, bucket_start_hour);

ALTER TABLE review_logs
  ADD COLUMN local_minute_of_day INTEGER NOT NULL DEFAULT 0
  CHECK (local_minute_of_day >= 0 AND local_minute_of_day < 1440);
