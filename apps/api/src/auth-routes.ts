import { randomInt, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate, checkRole, requireUser } from "./auth-middleware.js";

export const authRouter = Router();
authRouter.get("/me", authenticate, requireUser, (req, res) => {
  const profile = db.prepare(`SELECT u.id,u.email,u.phone,u.display_name AS displayName,u.study_uid AS studyUid,u.username,u.last_username_changed_at AS lastUsernameChangedAt,u.avatar_url AS avatarUrl,
    u.hsk_target AS hskTarget,u.created_at AS createdAt,
    CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_key='admin') THEN 'admin' ELSE 'user' END AS role,
    (SELECT COUNT(DISTINCT word_id) FROM review_events e WHERE e.user_id=u.id AND e.local_date=date('now','localtime')) AS learnedToday,
    (SELECT COUNT(*) FROM flashcard_reviews f WHERE f.user_id=u.id AND f.remembered=0) AS reviewing
    FROM users u WHERE u.id=?`).get(req.user!.userId);
  res.json({ profile });
});
authRouter.post("/sync", authenticate, (req, res) => {
  const auth = req.user!;
  const email = auth.email?.trim().toLowerCase() || null;
  const phone = typeof auth.claims.phone_number === "string" ? auth.claims.phone_number : null;
  const displayName = auth.displayName.trim().slice(0, 80);
  const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
  const claimIsAdmin = auth.claims.admin === true || auth.claims.role === "admin";
  const isBootstrapAdmin = Boolean(email && auth.claims.email_verified && adminEmails.has(email));

  db.exec("BEGIN IMMEDIATE");
  try {
    let existing = db.prepare("SELECT id,study_uid AS studyUid FROM users WHERE firebase_uid=?").get(auth.firebaseUid) as { id: string; studyUid: string | null } | undefined;
    if (!existing) {
      let studyUid = "";
      for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = `#${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
        if (!db.prepare("SELECT 1 FROM users WHERE study_uid=?").get(candidate)) { studyUid = candidate; break; }
      }
      if (!studyUid) throw new Error("STUDY_UID_SPACE_EXHAUSTED");
      const id = randomUUID();
      db.prepare(`INSERT INTO users(id,firebase_uid,email,phone,study_uid,display_name)
        VALUES(?,?,?,?,?,?)`).run(id, auth.firebaseUid, email, phone, studyUid, displayName);
      existing = { id, studyUid };
    } else {
      db.prepare(`UPDATE users SET email=COALESCE(?,email),phone=COALESCE(?,phone),
        display_name=CASE WHEN ?<>'' THEN ? ELSE display_name END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(email, phone, displayName, displayName, existing.id);
    }
    db.prepare("INSERT OR IGNORE INTO user_roles(user_id,role_key) VALUES (?,'user')").run(existing.id);
    if (claimIsAdmin || isBootstrapAdmin) db.prepare("INSERT OR IGNORE INTO user_roles(user_id,role_key) VALUES (?,'admin')").run(existing.id);
    const role = db.prepare("SELECT role_key FROM user_roles WHERE user_id=? AND role_key='admin'").get(existing.id) ? "admin" : "user";
    db.prepare(`INSERT OR IGNORE INTO user_auth_identities(provider,provider_uid,user_id) VALUES(?,?,?)`)
      .run(auth.claims.firebase?.sign_in_provider === "phone" ? "phone" : auth.claims.firebase?.sign_in_provider === "facebook.com" ? "facebook" : "email", auth.firebaseUid, existing.id);
    db.exec("COMMIT");
    res.json({ profile: { id: existing.id, firebaseUid: auth.firebaseUid, email, phone, displayName, studyUid: existing.studyUid, role } });
  } catch (error) {
    db.exec("ROLLBACK");
    if (error instanceof Error && error.message === "STUDY_UID_SPACE_EXHAUSTED") return res.status(503).json({ error: error.message });
    return res.status(409).json({ error: "PROFILE_SYNC_CONFLICT", message: "Email hoặc số điện thoại đã được gắn với tài khoản khác." });
  }
});

export const adminRouter = Router();
adminRouter.use(authenticate, requireUser, checkRole(["admin"]));

const wordFields = z.object({
  hanzi: z.string().trim().min(1).max(24), pinyin: z.string().trim().max(120).default(""),
  meaningVi: z.string().trim().max(2000).default(""), meaningEn: z.string().trim().max(2000).default(""),
  hanViet: z.string().trim().max(500).default(""), level: z.number().int().min(0).max(9).default(0),
  partOfSpeech: z.string().trim().max(80).default(""), exampleChinese: z.string().trim().max(1200).default(""),
  examplePinyin: z.string().trim().max(1200).default(""), exampleEnglish: z.string().trim().max(1200).default(""),
  exampleVietnamese: z.string().trim().max(1200).default("")
});
const wordSelect = `id,source,level,hanzi,pinyin,tones,meaning_en AS meaningEn,meaning_vi AS meaningVi,han_viet AS hanViet,
  pos AS partOfSpeech,example_zh AS exampleChinese,example_pinyin AS examplePinyin,example_en AS exampleEnglish,
  example_vi AS exampleVietnamese,attribution AS sourceAttribution,translation_status AS translationStatus`;
adminRouter.get("/words", (req, res) => {
  const term = String(req.query.term ?? "").trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
  const rows = db.prepare(`SELECT ${wordSelect} FROM vocabulary WHERE (?='' OR hanzi LIKE ? ESCAPE '\\' OR meaning_vi LIKE ? ESCAPE '\\' OR meaning_en LIKE ? ESCAPE '\\' OR pinyin LIKE ? ESCAPE '\\') ORDER BY level,hanzi LIMIT ?`)
    .all(term, `%${term.replace(/[\\%_]/g, "\\$&")}%`, `%${term}%`, `%${term}%`, `%${term}%`, limit);
  res.json({ words: rows });
});
adminRouter.post("/words", (req, res) => {
  const parsed = wordFields.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_WORD", issues: parsed.error.issues });
  const value = parsed.data; const id = `admin-${randomUUID()}`;
  db.prepare(`INSERT INTO vocabulary(id,source,level,hanzi,pinyin,pinyin_search,meaning_vi,meaning_en,han_viet,vi_search,en_search,hv_search,pos,
    example_zh,example_pinyin,example_en,example_vi,attribution,translation_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, "admin", value.level, value.hanzi, value.pinyin, value.pinyin.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[1-5\s'’]/g, "").toLowerCase(), value.meaningVi,
      value.meaningEn, value.hanViet, normalizeText(value.meaningVi), normalizeText(value.meaningEn), normalizeText(value.hanViet), value.partOfSpeech,
      value.exampleChinese, value.examplePinyin, value.exampleEnglish, value.exampleVietnamese, "Admin edited", "admin-edited");
  audit(req.user!.userId!, "word.create", "word", id, { hanzi: value.hanzi });
  res.status(201).json({ word: db.prepare(`SELECT ${wordSelect} FROM vocabulary WHERE id=?`).get(id) });
});
adminRouter.put("/words/:id", (req, res) => {
  const parsed = wordFields.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_WORD", issues: parsed.error.issues });
  const value = parsed.data; const result = db.prepare(`UPDATE vocabulary SET hanzi=?,pinyin=?,pinyin_search=?,meaning_vi=?,meaning_en=?,han_viet=?,vi_search=?,en_search=?,hv_search=?,
    level=?,pos=?,example_zh=?,example_pinyin=?,example_en=?,example_vi=?,attribution=CASE WHEN attribution='' THEN 'Admin edited' ELSE attribution END,translation_status='admin-edited' WHERE id=?`)
    .run(value.hanzi,value.pinyin,value.pinyin.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[1-5\s'’]/g, "").toLowerCase(),value.meaningVi,value.meaningEn,value.hanViet,
      normalizeText(value.meaningVi),normalizeText(value.meaningEn),normalizeText(value.hanViet),value.level,value.partOfSpeech,value.exampleChinese,value.examplePinyin,value.exampleEnglish,value.exampleVietnamese,req.params.id);
  if (!result.changes) return res.status(404).json({ error: "WORD_NOT_FOUND" });
  audit(req.user!.userId!, "word.update", "word", req.params.id, { hanzi: value.hanzi });
  res.json({ word: db.prepare(`SELECT ${wordSelect} FROM vocabulary WHERE id=?`).get(req.params.id) });
});
adminRouter.delete("/words/:id", (req, res) => {
  const row = db.prepare("SELECT hanzi FROM vocabulary WHERE id=?").get(req.params.id) as { hanzi: string } | undefined;
  if (!row) return res.status(404).json({ error: "WORD_NOT_FOUND" });
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM user_deck_words WHERE word_id=?").run(req.params.id);
    db.prepare("DELETE FROM flashcard_reviews WHERE word_id=?").run(req.params.id);
    db.prepare("DELETE FROM review_events WHERE word_id=?").run(req.params.id);
    db.prepare("DELETE FROM saved_words WHERE word_id=?").run(req.params.id);
    db.prepare("DELETE FROM vocabulary WHERE id=?").run(req.params.id);
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
  audit(req.user!.userId!, "word.delete", "word", req.params.id, { hanzi: row.hanzi });
  res.status(204).end();
});
adminRouter.get("/feedbacks", (req, res) => {
  const status = String(req.query.status ?? "");
  if (status && !["new", "reviewing", "resolved", "dismissed"].includes(status)) return res.status(400).json({ error: "INVALID_STATUS" });
  const rows = db.prepare(`SELECT id,user_id AS userId,category,details,screenshot_base64 AS screenshotBase64,status,created_at AS createdAt
    FROM feedbacks WHERE (?='' OR status=?) ORDER BY created_at DESC LIMIT 200`).all(status,status);
  res.json({ feedbacks: rows });
});
adminRouter.patch("/feedbacks/:id", (req, res) => {
  const parsed = z.object({ status: z.enum(["new", "reviewing", "resolved", "dismissed"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_STATUS" });
  const result = db.prepare("UPDATE feedbacks SET status=? WHERE id=?").run(parsed.data.status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "FEEDBACK_NOT_FOUND" });
  audit(req.user!.userId!, "feedback.status", "feedback", req.params.id, { status: parsed.data.status });
  res.json({ updated: true });
});
adminRouter.get("/users", (_req, res) => {
  const users = db.prepare(`SELECT u.id,u.email,u.phone,u.study_uid AS studyUid,u.display_name AS displayName,u.created_at AS createdAt,
    (SELECT role_key FROM user_roles WHERE user_id=u.id AND role_key='admin' LIMIT 1) AS adminRole,
    (SELECT MAX(occurred_at) FROM review_events WHERE user_id=u.id) AS lastActiveAt FROM users u ORDER BY u.created_at DESC LIMIT 500`).all();
  const totals = db.prepare(`SELECT COUNT(*) AS users,(SELECT COUNT(*) FROM feedbacks) AS feedbacks,(SELECT COUNT(*) FROM vocabulary) AS words FROM users`).get();
  res.json({ users, totals });
});

function normalizeText(value: string) { return value.toLowerCase().replace(/[đĐ]/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\p{Script=Han}]+/gu," ").trim().replace(/\s+/g," "); }
function audit(userId: string, action: string, entityType: string, entityId: string, details: object) {
  db.prepare("INSERT INTO admin_audit_log(actor_user_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?)")
    .run(userId,action,entityType,entityId,JSON.stringify(details));
}
