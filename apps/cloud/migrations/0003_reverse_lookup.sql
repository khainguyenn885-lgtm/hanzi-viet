ALTER TABLE vocabulary ADD COLUMN vi_search TEXT NOT NULL DEFAULT '';
ALTER TABLE vocabulary ADD COLUMN en_search TEXT NOT NULL DEFAULT '';
ALTER TABLE vocabulary ADD COLUMN hv_search TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS vocabulary_vi_search_idx ON vocabulary(vi_search COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS vocabulary_en_search_idx ON vocabulary(en_search COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS vocabulary_hv_search_idx ON vocabulary(hv_search COLLATE NOCASE);
