CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  level INTEGER NOT NULL,
  hanzi TEXT NOT NULL,
  pinyin TEXT NOT NULL DEFAULT '',
  tones TEXT NOT NULL DEFAULT '',
  meaning_en TEXT NOT NULL DEFAULT '',
  meaning_vi TEXT NOT NULL DEFAULT '',
  han_viet TEXT NOT NULL DEFAULT '',
  pos TEXT NOT NULL DEFAULT '',
  example_zh TEXT NOT NULL DEFAULT '',
  example_pinyin TEXT NOT NULL DEFAULT '',
  example_en TEXT NOT NULL DEFAULT '',
  example_vi TEXT NOT NULL DEFAULT '',
  attribution TEXT NOT NULL DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS vocabulary_hanzi_idx ON vocabulary(hanzi);
CREATE INDEX IF NOT EXISTS vocabulary_level_idx ON vocabulary(level);
CREATE INDEX IF NOT EXISTS vocabulary_pinyin_idx ON vocabulary(pinyin);
CREATE TABLE IF NOT EXISTS error_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id TEXT,
  surface TEXT NOT NULL,
  field TEXT NOT NULL,
  suggested TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
