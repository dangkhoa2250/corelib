CREATE TABLE card_sources_repaired (
  card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  page INTEGER NOT NULL CHECK (page > 0),
  quote TEXT NOT NULL,
  rects_json TEXT NOT NULL
);

INSERT INTO card_sources_repaired (card_id, document_id, page, quote, rects_json)
  SELECT card_id, document_id, page, quote, rects_json FROM card_sources;

DROP TABLE card_sources;

ALTER TABLE card_sources_repaired RENAME TO card_sources;

CREATE INDEX IF NOT EXISTS card_sources_document_id_page
  ON card_sources (document_id, page);

CREATE TRIGGER IF NOT EXISTS cards_delete_card_text
AFTER DELETE ON cards
BEGIN
  DELETE FROM card_text WHERE card_id = OLD.id;
END;
