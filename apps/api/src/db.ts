import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { WordRecord } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../data");
mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(dataDir, "user.sqlite"));
db.exec("PRAGMA journal_mode = WAL");
const normalizePinyin = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[1-5\s'’]/g, "").toLowerCase();
const normalizeLookup = (value: string) => value.toLowerCase().replace(/[đĐ]/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\p{Script=Han}]+/gu, " ").trim().replace(/\s+/g, " ");
db.exec(`
  CREATE TABLE IF NOT EXISTS vocabulary (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, level INTEGER NOT NULL, hanzi TEXT NOT NULL,
    pinyin TEXT NOT NULL, pinyin_search TEXT NOT NULL DEFAULT '', tones TEXT NOT NULL DEFAULT '', meaning_en TEXT NOT NULL DEFAULT '',
    meaning_vi TEXT NOT NULL DEFAULT '', han_viet TEXT NOT NULL DEFAULT '', vi_search TEXT NOT NULL DEFAULT '',
    en_search TEXT NOT NULL DEFAULT '', hv_search TEXT NOT NULL DEFAULT '', pos TEXT NOT NULL DEFAULT '',
    example_zh TEXT NOT NULL DEFAULT '', example_pinyin TEXT NOT NULL DEFAULT '',
    example_en TEXT NOT NULL DEFAULT '', example_vi TEXT NOT NULL DEFAULT '', attribution TEXT NOT NULL DEFAULT '',
    translation_status TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS vocabulary_hanzi_idx ON vocabulary(hanzi);
  CREATE INDEX IF NOT EXISTS vocabulary_level_idx ON vocabulary(level);
  CREATE TABLE IF NOT EXISTS saved_words (word_id TEXT PRIMARY KEY, saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS error_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, word_id TEXT, surface TEXT NOT NULL, field TEXT NOT NULL,
    suggested TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT REFERENCES users(id),
    category TEXT NOT NULL CHECK(category IN ('vocabulary','feature','experience','other')),
    details TEXT NOT NULL, screenshot_base64 TEXT, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, firebase_uid TEXT UNIQUE, email TEXT UNIQUE, phone TEXT UNIQUE, study_uid TEXT UNIQUE,
    timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh', display_name TEXT NOT NULL DEFAULT '',
    username TEXT, last_username_changed_at TEXT, last_active_at INTEGER,
    avatar_url TEXT NOT NULL DEFAULT '', hsk_target INTEGER CHECK(hsk_target BETWEEN 1 AND 9),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_auth_identities (
    provider TEXT NOT NULL CHECK(provider IN ('email','facebook','phone')),
    provider_uid TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(provider, provider_uid)
  );
  CREATE TABLE IF NOT EXISTS user_decks (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
  );
  CREATE TABLE IF NOT EXISTS user_deck_words (
    deck_id TEXT NOT NULL REFERENCES user_decks(id) ON DELETE CASCADE, word_id TEXT,
    custom_hanzi TEXT, custom_pinyin TEXT NOT NULL DEFAULT '', custom_meaning_vi TEXT NOT NULL DEFAULT '',
    custom_meaning_en TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(word_id IS NOT NULL OR custom_hanzi IS NOT NULL)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS user_deck_words_word_idx ON user_deck_words(deck_id,word_id) WHERE word_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS flashcard_reviews (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, word_id TEXT NOT NULL,
    due_at INTEGER NOT NULL, remembered INTEGER NOT NULL DEFAULT 0 CHECK(remembered IN (0,1)), seen_count INTEGER NOT NULL DEFAULT 0,
    success_streak INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, word_id)
  );
  CREATE TABLE IF NOT EXISTS roles (role_key TEXT PRIMARY KEY, label TEXT NOT NULL);
  INSERT OR IGNORE INTO roles(role_key,label) VALUES ('user','Thành viên'),('admin','Quản trị viên');
  CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_key TEXT NOT NULL REFERENCES roles(role_key), PRIMARY KEY(user_id,role_key)
  );
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS review_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id TEXT NOT NULL, result TEXT NOT NULL CHECK(result IN ('remembered','forgot')),
    occurred_at INTEGER NOT NULL, local_date TEXT NOT NULL, timezone TEXT NOT NULL,
    client_event_id TEXT NOT NULL, UNIQUE(user_id,client_event_id)
  );
  CREATE INDEX IF NOT EXISTS review_events_user_date_idx ON review_events(user_id,local_date);
  CREATE TABLE IF NOT EXISTS daily_study_stats (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, study_date TEXT NOT NULL,
    timezone TEXT NOT NULL, words_reviewed INTEGER NOT NULL DEFAULT 0, unique_words INTEGER NOT NULL DEFAULT 0,
    active_seconds INTEGER NOT NULL DEFAULT 0 CHECK(active_seconds >= 0),
    minutes_studied INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,study_date)
  );
  CREATE TABLE IF NOT EXISTS badge_awards (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_key TEXT NOT NULL, awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,badge_key)
  );
  CREATE TABLE IF NOT EXISTS study_groups (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('pair','group')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(group_id,user_id)
  );
  CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members(user_id);
  CREATE TABLE IF NOT EXISTS group_invites (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_study_uid TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS group_deck_shares (
    group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    deck_id TEXT NOT NULL REFERENCES user_decks(id) ON DELETE CASCADE,
    shared_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(group_id,deck_id)
  );
  CREATE TRIGGER IF NOT EXISTS group_members_limit BEFORE INSERT ON group_members
    WHEN (SELECT COUNT(*) FROM group_members WHERE group_id=NEW.group_id) >=
      CASE (SELECT kind FROM study_groups WHERE id=NEW.group_id) WHEN 'pair' THEN 2 ELSE 5 END
    BEGIN SELECT RAISE(ABORT, 'GROUP_FULL'); END;
  CREATE INDEX IF NOT EXISTS user_decks_user_idx ON user_decks(user_id);
  CREATE INDEX IF NOT EXISTS flashcard_reviews_due_idx ON flashcard_reviews(user_id, due_at);
  CREATE TABLE IF NOT EXISTS sentence_translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sentence_zh TEXT NOT NULL UNIQUE,
    meaning_vi TEXT NOT NULL DEFAULT '', meaning_en TEXT NOT NULL DEFAULT '',
    source_word_id TEXT, source TEXT NOT NULL DEFAULT 'dictionary-example',
    FOREIGN KEY(source_word_id) REFERENCES vocabulary(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY, user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','blocked')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(user_low_id < user_high_id), UNIQUE(user_low_id,user_high_id)
  );
  CREATE INDEX IF NOT EXISTS friendships_high_status_idx ON friendships(user_high_id,status);
  CREATE INDEX IF NOT EXISTS friendships_low_status_idx ON friendships(user_low_id,status);
  CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('direct','group','support')),
    direct_key TEXT, group_id TEXT REFERENCES study_groups(id) ON DELETE CASCADE,
    support_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS chat_direct_key_idx ON chat_conversations(direct_key) WHERE direct_key IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS chat_group_id_idx ON chat_conversations(group_id) WHERE group_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS chat_support_user_idx ON chat_conversations(support_user_id) WHERE support_user_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS chat_participants (
    conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TEXT, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(conversation_id,user_id)
  );
  CREATE INDEX IF NOT EXISTS chat_participants_user_idx ON chat_participants(user_id,conversation_id);
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type TEXT NOT NULL CHECK(message_type IN ('text','word_card')),
    body TEXT NOT NULL DEFAULT '', word_card_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id,created_at,id);
`);
if (!(db.prepare("PRAGMA table_info(vocabulary)").all() as Array<{ name: string }>).some(column => column.name === "pinyin_search")) {
  db.exec("ALTER TABLE vocabulary ADD COLUMN pinyin_search TEXT NOT NULL DEFAULT ''");
}
const vocabularyColumns = db.prepare("PRAGMA table_info(vocabulary)").all() as Array<{ name: string }>;
for (const column of ["vi_search", "en_search", "hv_search"]) {
  if (!vocabularyColumns.some(existing => existing.name === column)) db.exec(`ALTER TABLE vocabulary ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
}
const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some(column => column.name === "firebase_uid")) db.exec("ALTER TABLE users ADD COLUMN firebase_uid TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_idx ON users(firebase_uid) WHERE firebase_uid IS NOT NULL");
if (!userColumns.some(column => column.name === "study_uid")) db.exec("ALTER TABLE users ADD COLUMN study_uid TEXT");
if (!userColumns.some(column => column.name === "timezone")) db.exec("ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'");
if (!userColumns.some(column => column.name === "username")) db.exec("ALTER TABLE users ADD COLUMN username TEXT");
if (!userColumns.some(column => column.name === "last_username_changed_at")) db.exec("ALTER TABLE users ADD COLUMN last_username_changed_at TEXT");
if (!userColumns.some(column => column.name === "last_active_at")) db.exec("ALTER TABLE users ADD COLUMN last_active_at INTEGER");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_username_nocase_idx ON users(username COLLATE NOCASE) WHERE username IS NOT NULL");
const dailyStatsColumns = db.prepare("PRAGMA table_info(daily_study_stats)").all() as Array<{ name: string }>;
if (!dailyStatsColumns.some(column => column.name === "active_seconds")) db.exec("ALTER TABLE daily_study_stats ADD COLUMN active_seconds INTEGER NOT NULL DEFAULT 0 CHECK(active_seconds >= 0)");
const reviewColumns = db.prepare("PRAGMA table_info(flashcard_reviews)").all() as Array<{ name: string }>;
if (!reviewColumns.some(column => column.name === "success_streak")) db.exec("ALTER TABLE flashcard_reviews ADD COLUMN success_streak INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_study_uid_idx ON users(study_uid) WHERE study_uid IS NOT NULL");
db.exec("CREATE INDEX IF NOT EXISTS vocabulary_pinyin_search_idx ON vocabulary(pinyin_search)");
db.exec("CREATE INDEX IF NOT EXISTS vocabulary_vi_search_idx ON vocabulary(vi_search COLLATE NOCASE)");
db.exec("CREATE INDEX IF NOT EXISTS vocabulary_en_search_idx ON vocabulary(en_search COLLATE NOCASE)");
db.exec("CREATE INDEX IF NOT EXISTS vocabulary_hv_search_idx ON vocabulary(hv_search COLLATE NOCASE)");

const catalogFile = path.join(dataDir, "hsk-words.json");
if (existsSync(catalogFile)) {
  const catalog = JSON.parse(readFileSync(catalogFile, "utf8")) as { data: WordRecord[] };
  const insert = db.prepare(`INSERT INTO vocabulary
    (id, source, level, hanzi, pinyin, pinyin_search, tones, meaning_en, meaning_vi, han_viet, vi_search, en_search, hv_search, pos, example_zh,
    example_pinyin, example_en, example_vi, attribution, translation_status)
    VALUES (@id,@source,@level,@hanzi,@pinyin,@pinyinSearch,@tones,@meaningEn,@meaningVi,@hanViet,@viSearch,@enSearch,@hvSearch,@partOfSpeech,
    @exampleChinese,@examplePinyin,@exampleEnglish,@exampleVietnamese,@sourceAttribution,@translationStatus)
    ON CONFLICT(id) DO UPDATE SET
      source=excluded.source, level=excluded.level, hanzi=excluded.hanzi,
      pinyin=CASE WHEN excluded.pinyin<>'' THEN excluded.pinyin ELSE vocabulary.pinyin END,
      pinyin_search=CASE WHEN excluded.pinyin<>'' THEN excluded.pinyin_search ELSE vocabulary.pinyin_search END,
      tones=CASE WHEN excluded.tones<>'' THEN excluded.tones ELSE vocabulary.tones END,
      meaning_en=CASE WHEN excluded.meaning_en<>'' THEN excluded.meaning_en ELSE vocabulary.meaning_en END,
      meaning_vi=CASE WHEN excluded.meaning_vi<>'' THEN excluded.meaning_vi ELSE vocabulary.meaning_vi END,
      han_viet=CASE WHEN excluded.han_viet<>'' THEN excluded.han_viet ELSE vocabulary.han_viet END,
      vi_search=excluded.vi_search, en_search=excluded.en_search, hv_search=excluded.hv_search,
      pos=CASE WHEN excluded.pos<>'' THEN excluded.pos ELSE vocabulary.pos END,
      example_zh=CASE WHEN excluded.example_zh<>'' THEN excluded.example_zh ELSE vocabulary.example_zh END,
      example_pinyin=CASE WHEN excluded.example_pinyin<>'' THEN excluded.example_pinyin ELSE vocabulary.example_pinyin END,
      example_en=CASE WHEN excluded.example_en<>'' THEN excluded.example_en ELSE vocabulary.example_en END,
      example_vi=CASE WHEN excluded.example_vi<>'' THEN excluded.example_vi ELSE vocabulary.example_vi END,
      attribution=CASE WHEN excluded.attribution<>'' THEN excluded.attribution ELSE vocabulary.attribution END,
      translation_status=CASE WHEN excluded.translation_status<>'' THEN excluded.translation_status ELSE vocabulary.translation_status END`);
  db.exec("BEGIN");
  try { catalog.data.forEach(row => insert.run({ ...row, pinyinSearch: normalizePinyin(row.pinyin), viSearch: normalizeLookup(row.meaningVi), enSearch: normalizeLookup(row.meaningEn), hvSearch: normalizeLookup(row.hanViet) } as Record<string, string | number>)); db.exec("COMMIT"); }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

db.exec(`INSERT OR IGNORE INTO sentence_translations(sentence_zh,meaning_vi,meaning_en,source_word_id)
  SELECT trim(example_zh),trim(example_vi),trim(example_en),MIN(id) FROM vocabulary
  WHERE trim(example_zh)<>'' AND (trim(example_vi)<>'' OR trim(example_en)<>'') GROUP BY trim(example_zh)`);

export const searchWords = db.prepare(`SELECT id, source, level, hanzi, pinyin, tones,
  meaning_en AS meaningEn, meaning_vi AS meaningVi, han_viet AS hanViet, pos AS partOfSpeech,
  example_zh AS exampleChinese, example_pinyin AS examplePinyin, example_en AS exampleEnglish,
  example_vi AS exampleVietnamese, attribution AS sourceAttribution, translation_status AS translationStatus
  FROM vocabulary WHERE (hanzi LIKE @term OR pinyin_search LIKE @pinyin OR vi_search LIKE @prefix OR en_search LIKE @prefix OR hv_search LIKE @prefix
    OR vi_search LIKE @contains OR en_search LIKE @contains OR hv_search LIKE @contains)
    AND (@level = 0 OR level = @level)
  ORDER BY level, hanzi LIMIT @limit`);
export const getWord = db.prepare(`SELECT id, source, level, hanzi, pinyin, tones,
  meaning_en AS meaningEn, meaning_vi AS meaningVi, han_viet AS hanViet, pos AS partOfSpeech,
  example_zh AS exampleChinese, example_pinyin AS examplePinyin, example_en AS exampleEnglish,
  example_vi AS exampleVietnamese, attribution AS sourceAttribution, translation_status AS translationStatus
  FROM vocabulary WHERE id = ? OR hanzi = ? LIMIT 1`);

