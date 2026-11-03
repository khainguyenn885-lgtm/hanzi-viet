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
db.exec(`
  CREATE TABLE IF NOT EXISTS vocabulary (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, level INTEGER NOT NULL, hanzi TEXT NOT NULL,
    pinyin TEXT NOT NULL, tones TEXT NOT NULL DEFAULT '', meaning_en TEXT NOT NULL DEFAULT '',
    meaning_vi TEXT NOT NULL DEFAULT '', han_viet TEXT NOT NULL DEFAULT '', pos TEXT NOT NULL DEFAULT '',
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
`);

const catalogFile = path.join(dataDir, "hsk-words.json");
if (existsSync(catalogFile)) {
  const catalog = JSON.parse(readFileSync(catalogFile, "utf8")) as { data: WordRecord[] };
  const insert = db.prepare(`INSERT INTO vocabulary
    (id, source, level, hanzi, pinyin, tones, meaning_en, meaning_vi, han_viet, pos, example_zh,
    example_pinyin, example_en, example_vi, attribution, translation_status)
    VALUES (@id,@source,@level,@hanzi,@pinyin,@tones,@meaningEn,@meaningVi,@hanViet,@partOfSpeech,
    @exampleChinese,@examplePinyin,@exampleEnglish,@exampleVietnamese,@sourceAttribution,@translationStatus)
    ON CONFLICT(id) DO UPDATE SET
      source=excluded.source, level=excluded.level, hanzi=excluded.hanzi,
      pinyin=CASE WHEN excluded.pinyin<>'' THEN excluded.pinyin ELSE vocabulary.pinyin END,
      tones=CASE WHEN excluded.tones<>'' THEN excluded.tones ELSE vocabulary.tones END,
      meaning_en=CASE WHEN excluded.meaning_en<>'' THEN excluded.meaning_en ELSE vocabulary.meaning_en END,
      meaning_vi=CASE WHEN excluded.meaning_vi<>'' THEN excluded.meaning_vi ELSE vocabulary.meaning_vi END,
      han_viet=CASE WHEN excluded.han_viet<>'' THEN excluded.han_viet ELSE vocabulary.han_viet END,
      pos=CASE WHEN excluded.pos<>'' THEN excluded.pos ELSE vocabulary.pos END,
      example_zh=CASE WHEN excluded.example_zh<>'' THEN excluded.example_zh ELSE vocabulary.example_zh END,
      example_pinyin=CASE WHEN excluded.example_pinyin<>'' THEN excluded.example_pinyin ELSE vocabulary.example_pinyin END,
      example_en=CASE WHEN excluded.example_en<>'' THEN excluded.example_en ELSE vocabulary.example_en END,
      example_vi=CASE WHEN excluded.example_vi<>'' THEN excluded.example_vi ELSE vocabulary.example_vi END,
      attribution=CASE WHEN excluded.attribution<>'' THEN excluded.attribution ELSE vocabulary.attribution END,
      translation_status=CASE WHEN excluded.translation_status<>'' THEN excluded.translation_status ELSE vocabulary.translation_status END`);
  db.exec("BEGIN");
  try { catalog.data.forEach(row => insert.run({ ...row } as Record<string, string | number>)); db.exec("COMMIT"); }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

export const searchWords = db.prepare(`SELECT id, source, level, hanzi, pinyin, tones,
  meaning_en AS meaningEn, meaning_vi AS meaningVi, han_viet AS hanViet, pos AS partOfSpeech,
  example_zh AS exampleChinese, example_pinyin AS examplePinyin, example_en AS exampleEnglish,
  example_vi AS exampleVietnamese, attribution AS sourceAttribution, translation_status AS translationStatus
  FROM vocabulary WHERE hanzi LIKE @term OR pinyin LIKE @term OR meaning_en LIKE @term OR meaning_vi LIKE @term
  ORDER BY level, hanzi LIMIT @limit`);
export const getWord = db.prepare(`SELECT id, source, level, hanzi, pinyin, tones,
  meaning_en AS meaningEn, meaning_vi AS meaningVi, han_viet AS hanViet, pos AS partOfSpeech,
  example_zh AS exampleChinese, example_pinyin AS examplePinyin, example_en AS exampleEnglish,
  example_vi AS exampleVietnamese, attribution AS sourceAttribution, translation_status AS translationStatus
  FROM vocabulary WHERE id = ? OR hanzi = ? LIMIT 1`);

