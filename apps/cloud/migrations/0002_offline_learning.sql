ALTER TABLE vocabulary ADD COLUMN pinyin_search TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS vocabulary_pinyin_search_idx ON vocabulary(pinyin_search);
CREATE TABLE IF NOT EXISTS feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  category TEXT NOT NULL CHECK(category IN ('vocabulary','feature','experience','other')),
  details TEXT NOT NULL,
  screenshot_base64 TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  hsk_target INTEGER CHECK(hsk_target BETWEEN 1 AND 9),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_auth_identities (
  provider TEXT NOT NULL CHECK(provider IN ('email','facebook','phone')),
  provider_uid TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(provider, provider_uid)
);
CREATE TABLE IF NOT EXISTS user_decks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS user_deck_words (
  deck_id TEXT NOT NULL REFERENCES user_decks(id) ON DELETE CASCADE,
  word_id TEXT,
  custom_hanzi TEXT,
  custom_pinyin TEXT NOT NULL DEFAULT '',
  custom_meaning_vi TEXT NOT NULL DEFAULT '',
  custom_meaning_en TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(word_id IS NOT NULL OR custom_hanzi IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  remembered INTEGER NOT NULL DEFAULT 0 CHECK(remembered IN (0,1)),
  seen_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, word_id)
);
CREATE INDEX IF NOT EXISTS user_decks_user_idx ON user_decks(user_id);
CREATE INDEX IF NOT EXISTS flashcard_reviews_due_idx ON flashcard_reviews(user_id, due_at);
