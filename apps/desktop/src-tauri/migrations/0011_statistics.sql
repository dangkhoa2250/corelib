CREATE TABLE activity_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  app_key TEXT NOT NULL,
  activity_kind TEXT NOT NULL,
  context_kind TEXT,
  context_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  local_day TEXT NOT NULL,
  timezone_offset_minutes INTEGER NOT NULL,
  raw_active_ms INTEGER NOT NULL DEFAULT 0 CHECK (raw_active_ms >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX activity_sessions_day_app ON activity_sessions(local_day, app_key);
CREATE INDEX activity_sessions_context_day ON activity_sessions(context_kind, context_id, local_day);
CREATE INDEX activity_sessions_started ON activity_sessions(started_at);

CREATE TABLE reading_session_pages (
  session_id TEXT NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL CHECK (page > 0),
  raw_active_ms INTEGER NOT NULL DEFAULT 0 CHECK (raw_active_ms >= 0),
  visit_count INTEGER NOT NULL CHECK (visit_count > 0),
  first_visited_at TEXT NOT NULL,
  last_visited_at TEXT NOT NULL,
  PRIMARY KEY(session_id, document_id, page)
);
CREATE INDEX reading_session_pages_document_page
  ON reading_session_pages(document_id, page, last_visited_at);
