-- Additive migration for YouGlish front language code
ALTER TABLE cards ADD COLUMN front_language TEXT;
