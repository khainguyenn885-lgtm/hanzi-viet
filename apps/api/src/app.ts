import express from "express";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { db, getWord, searchWords } from "./db.js";
import { translateSentence } from "./translate.js";
import { segmentChineseText } from "./segment.js";

export const app = express();
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, stage: "1A+1B" }));

app.post("/api/analyze", (req, res) => {
  const parsed = z.object({ text: z.string().trim().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_TEXT" });
  const dictionary = (db.prepare("SELECT DISTINCT hanzi FROM vocabulary").all() as Array<{ hanzi: string }>).map(row => row.hanzi);
  const tokens = segmentChineseText(parsed.data.text, dictionary).map(token => {
    if (!token.isChinese) return token;
    const matches = db.prepare(`SELECT id, source, level, hanzi, pinyin, tones, meaning_en AS meaningEn,
      meaning_vi AS meaningVi, han_viet AS hanViet, pos AS partOfSpeech, example_zh AS exampleChinese,
      example_pinyin AS examplePinyin, example_en AS exampleEnglish, example_vi AS exampleVietnamese,
      attribution AS sourceAttribution, translation_status AS translationStatus FROM vocabulary WHERE hanzi = ?`).all(token.surface) as any[];
    const readings = new Set(matches.map(match => match.pinyin));
    const exact = matches.find(match => match.pinyin.replaceAll(" ", "").toLowerCase() === token.pinyin.replaceAll(" ", "").toLowerCase()) ?? matches[0];
    return { ...token, pinyin: exact?.pinyin ?? token.pinyin, needsReview: matches.length === 0 || readings.size > 1, word: exact ?? null, matches };
  });
  res.json({ tokens });
});

app.get("/api/words", (req, res) => {
  const term = String(req.query.term ?? "").trim();
  const level = Number(req.query.level ?? 0);
  if (term.length < 1) return res.json({ words: [], total: (db.prepare("SELECT COUNT(*) AS n FROM vocabulary").get() as { n: number }).n });
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const words = searchWords.all({ term: pattern, limit }) as unknown[];
  const filtered = level ? words.filter((word: any) => word.level === level) : words;
  res.json({ words: filtered, total: filtered.length });
});

app.get("/api/words/:id", (req, res) => {
  const id = req.params.id;
  const byId = db.prepare(`SELECT id, source, level, hanzi, pinyin, tones, meaning_en AS meaningEn,
    meaning_vi AS meaningVi, han_viet AS hanViet, pos AS partOfSpeech, example_zh AS exampleChinese,
    example_pinyin AS examplePinyin, example_en AS exampleEnglish, example_vi AS exampleVietnamese,
    attribution AS sourceAttribution, translation_status AS translationStatus FROM vocabulary WHERE id = ?`).get(id);
  if (byId) return res.json({ word: byId });
  const bySurface = db.prepare(`SELECT id, source, level, hanzi, pinyin, tones, meaning_en AS meaningEn,
    meaning_vi AS meaningVi, han_viet AS hanViet, pos AS partOfSpeech, example_zh AS exampleChinese,
    example_pinyin AS examplePinyin, example_en AS exampleEnglish, example_vi AS exampleVietnamese,
    attribution AS sourceAttribution, translation_status AS translationStatus FROM vocabulary WHERE hanzi = ? LIMIT 1`).get(id);
  if (!bySurface) return res.status(404).json({ error: "WORD_NOT_FOUND" });
  res.json({ word: bySurface });
});

const translateSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  targetLanguage: z.enum(["vi", "en"]),
  tokens: z.array(z.object({ surface: z.string().min(1).max(64), pinyin: z.string().max(128) })).max(300),
  consentToSend: z.literal(true)
});

app.post("/api/translate", async (req, res) => {
  const parsed = translateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_TRANSLATION_REQUEST", details: parsed.error.flatten() });
  try {
    const result = await translateSentence(parsed.data.text, parsed.data.targetLanguage, parsed.data.tokens);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRANSLATION_FAILED";
    if (message === "AI_ENDPOINT_NOT_CONFIGURED") return res.status(503).json({ error: "AI_ENDPOINT_NOT_CONFIGURED" });
    if (message.startsWith("LLM_HTTP_")) return res.status(502).json({ error: message, message: "Dịch vụ AI trả về lỗi. Kiểm tra endpoint, model và API key." });
    return res.status(502).json({ error: "TRANSLATION_FAILED", message: "Không nhận được bản dịch hợp lệ." });
  }
});

app.get("/api/saved-words", (_req, res) => {
  const words = db.prepare(`SELECT v.id, v.level, v.hanzi, v.pinyin, v.meaning_en AS meaningEn,
    v.meaning_vi AS meaningVi, s.saved_at AS savedAt FROM saved_words s JOIN vocabulary v ON v.id=s.word_id ORDER BY s.saved_at DESC`).all();
  res.json({ words });
});

app.get("/api/writing-characters", (req, res) => {
  const level = Number(req.query.level ?? 1);
  if (level !== 1 && level !== 2) return res.status(400).json({ error: "INVALID_LEVEL" });
  const rows = db.prepare("SELECT hanzi FROM vocabulary WHERE level = ? ORDER BY hanzi").all(level) as Array<{ hanzi: string }>;
  const characters = [...new Set(rows.flatMap(row => [...row.hanzi]).filter(char => /\p{Script=Han}/u.test(char) && char !== "〇"))];
  res.json({ level, characters });
});

app.post("/api/saved-words", (req, res) => {
  const parsed = z.object({ wordId: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_WORD_ID" });
  const exists = db.prepare("SELECT id FROM vocabulary WHERE id = ?").get(parsed.data.wordId);
  if (!exists) return res.status(404).json({ error: "WORD_NOT_FOUND" });
  db.prepare("INSERT OR IGNORE INTO saved_words(word_id) VALUES (?)").run(parsed.data.wordId);
  res.status(201).json({ saved: true });
});

app.delete("/api/saved-words/:id", (req, res) => {
  db.prepare("DELETE FROM saved_words WHERE word_id = ?").run(req.params.id);
  res.status(204).end();
});

app.post("/api/reports", (req, res) => {
  const parsed = z.object({ wordId: z.string().max(200).optional(), surface: z.string().min(1).max(100), field: z.string().min(1).max(50), suggested: z.string().max(500).default(""), note: z.string().max(1000).default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_REPORT" });
  const result = db.prepare("INSERT INTO error_reports(word_id,surface,field,suggested,note) VALUES (@wordId,@surface,@field,@suggested,@note)").run(parsed.data);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("/api/strokes/:char", (req, res) => {
  const char = req.params.char;
  if ([...char].length !== 1 || !/\p{Script=Han}/u.test(char)) return res.status(400).json({ error: "INVALID_CHARACTER" });
  res.sendFile(`${char}.json`, { root: fileURLToPath(new URL("../data/strokes/", import.meta.url)) }, error => {
    if (error && !res.headersSent) res.status(404).json({ error: "STROKE_DATA_UNAVAILABLE" });
  });
});

