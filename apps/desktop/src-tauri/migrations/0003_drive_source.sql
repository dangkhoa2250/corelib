CREATE UNIQUE INDEX IF NOT EXISTS documents_drive_source_ref_unique
  ON documents (source, source_ref)
  WHERE source = 'google_drive' AND source_ref IS NOT NULL;
