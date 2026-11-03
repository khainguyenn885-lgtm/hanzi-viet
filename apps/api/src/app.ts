import express from "express";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { db, getWord, searchWords } from "./db.js";
import { segmentChineseText } from "./segment.js";
import { adminRouter, authRouter } from "./auth-routes.js";
import { userRouter } from "./user-routes.js";
import { communityRouter, groupRouter } from "./group-routes.js";
import { friendRouter } from "./friend-routes.js";
import { chatRouter, supportAdminRouter } from "./chat-routes.js";
import { authenticateOptional } from "./auth-middleware.js";

export const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, stage: "local-auth-rbac" }));
app.use("/api/auth", authRouter);
app.use("/api/me", userRouter);
app.use("/api/community", communityRouter);
app.use("/api/groups", groupRouter);
app.use("/api/friends", friendRouter);
app.use("/api/chat", chatRouter);
app.use("/api/admin/support", supportAdminRouter);
app.use("/api/admin", adminRouter);

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
    const exact = matches[0];
    return { ...token, pinyin: exact?.pinyin ?? "", needsReview: matches.length === 0 || readings.size > 1, word: exact ?? null, matches };
  });
  const normalizedSentence = parsed.data.text.normalize("NFC").replace(/[\s\u3000]+/gu, "").trim();
  const translation = db.prepare(`SELECT sentence_zh AS sentenceZh,meaning_vi AS meaningVi,meaning_en AS meaningEn,source
    FROM sentence_translations WHERE replace(sentence_zh,' ','')=? LIMIT 1`).get(normalizedSentence) as
    { sentenceZh: string; meaningVi: string; meaningEn: string; source: string } | undefined;
  res.json({ tokens, sentenceTranslation: translation ? { available: true, ...translation } : {
    available: false, sentenceZh: parsed.data.text, meaningVi: "", meaningEn: "", source: null
  } });
});

app.get("/api/words", (req, res) => {
  const term = String(req.query.term ?? "").trim();
  const level = Number(req.query.level ?? 0);
  if (term.length < 1) return res.json({ words: [], total: (db.prepare("SELECT COUNT(*) AS n FROM vocabulary").get() as { n: number }).n });
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const normalizePinyin = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[1-5\s'’]/g, "").toLowerCase();
  const normalizeLookup = (value: string) => value.toLowerCase().replace(/[đĐ]/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\p{Script=Han}]+/gu, " ").trim().replace(/\s+/g, " ");
  const normalized = normalizeLookup(term);
  const words = searchWords.all({ term: pattern, pinyin: `%${normalizePinyin(term)}%`, prefix: `${normalized}%`, contains: `%${normalized}%`, level, limit });
  res.json({ words, total: words.length });
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

app.get("/api/writing-characters", (req, res) => {
  const level = Number(req.query.level ?? 1);
  if (level !== 1 && level !== 2) return res.status(400).json({ error: "INVALID_LEVEL" });
  const rows = db.prepare("SELECT hanzi FROM vocabulary WHERE level = ? ORDER BY hanzi").all(level) as Array<{ hanzi: string }>;
  const characters = [...new Set(rows.flatMap(row => [...row.hanzi]).filter(char => /\p{Script=Han}/u.test(char) && char !== "〇"))];
  res.json({ level, characters });
});

app.post("/api/feedback", authenticateOptional, (req, res) => {
  const parsed = z.object({
    category: z.enum(["vocabulary", "feature", "experience", "other"]),
    details: z.string().trim().min(5).max(3000),
    screenshotBase64: z.string().max(650_000).regex(/^data:image\/(png|jpeg|webp);base64,/).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_FEEDBACK" });
  const result = db.prepare("INSERT INTO feedbacks(user_id,category,details,screenshot_base64) VALUES (?,?,?,?)")
    .run(req.user?.userId ?? null, parsed.data.category, parsed.data.details, parsed.data.screenshotBase64 ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("/api/strokes/:char", (req, res) => {
  const char = req.params.char;
  if ([...char].length !== 1 || !/\p{Script=Han}/u.test(char)) return res.status(400).json({ error: "INVALID_CHARACTER" });
  res.sendFile(`${char}.json`, { root: fileURLToPath(new URL("../data/strokes/", import.meta.url)) }, error => {
    if (error && !res.headersSent) res.status(404).json({ error: "STROKE_DATA_UNAVAILABLE" });
  });
});

