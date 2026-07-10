CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('local_managed', 'google_drive')),
  source_ref TEXT,
  content_hash TEXT,
  title TEXT NOT NULL,
  author TEXT,
  managed_path TEXT,
  cover_path TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'processing', 'download_required', 'error')),
  index_state TEXT NOT NULL DEFAULT 'pending' CHECK (index_state IN ('pending', 'ready', 'failed')),
  last_read_page INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_local_content_hash_unique
  ON documents (content_hash)
  WHERE source = 'local_managed' AND content_hash IS NOT NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS document_text
  USING fts5(document_id UNINDEXED, body, tokenize = 'unicode61');
