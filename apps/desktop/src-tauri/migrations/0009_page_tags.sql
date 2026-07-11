CREATE TABLE IF NOT EXISTS page_tags (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE (document_id, page)
);

CREATE INDEX IF NOT EXISTS page_tags_document_id ON page_tags (document_id);
