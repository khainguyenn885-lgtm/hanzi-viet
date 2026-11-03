import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate, requireUser } from "./auth-middleware.js";

export const userRouter = Router();
userRouter.use(authenticate, requireUser);
const uid = (req: import("express").Request) => req.user!.userId!;

userRouter.post("/active-time", (req, res) => {
  const parsed = z.object({ seconds: z.number().int().min(0).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_ACTIVE_SECONDS" });
  const userId = uid(req);
  const profile = db.prepare("SELECT timezone FROM users WHERE id=?").get(userId) as { timezone: string };
  const timezone = isValidTimezone(profile.timezone) ? profile.timezone : "Asia/Ho_Chi_Minh";
  const now = Date.now();
  const studyDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  if (parsed.data.seconds > 0) {
    db.prepare("UPDATE users SET last_active_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(now, userId);
    db.prepare(`INSERT INTO daily_study_stats(user_id,study_date,timezone,active_seconds) VALUES(?,?,?,?)
      ON CONFLICT(user_id,study_date) DO UPDATE SET active_seconds=active_seconds+excluded.active_seconds,
      timezone=excluded.timezone,updated_at=CURRENT_TIMESTAMP`).run(userId, studyDate, timezone, parsed.data.seconds);
  }
  res.json({ saved: true, studyDate, acceptedSeconds: parsed.data.seconds });
});

userRouter.get("/profile", (req, res) => {
  const profile = db.prepare(`SELECT username,last_username_changed_at AS lastUsernameChangedAt,
    study_uid AS studyUid,display_name AS displayName FROM users WHERE id=?`).get(uid(req));
  res.json({ profile });
});

userRouter.put("/username", (req, res) => {
  const parsed = z.object({ username: z.string().trim().regex(/^[A-Za-z0-9_]{3,20}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_USERNAME", message: "Username gồm 3–20 ký tự: chữ cái, số hoặc dấu gạch dưới." });
  const username = parsed.data.username.toLowerCase();
  const userId = uid(req);
  const current = db.prepare("SELECT username,last_username_changed_at AS changedAt FROM users WHERE id=?").get(userId) as { username: string | null; changedAt: string | null };
  if (current.username === username) return res.json({ username, unchanged: true });
  if (db.prepare("SELECT 1 FROM users WHERE username=? COLLATE NOCASE AND id<>?").get(username, userId)) return res.status(409).json({ error: "USERNAME_TAKEN" });
  if (current.changedAt) {
    const readyAt = new Date(`${current.changedAt.replace(" ", "T")}Z`).getTime() + 10 * 86_400_000;
    const remainingSeconds = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
    if (remainingSeconds > 0) return res.status(400).json({ error: "USERNAME_COOLDOWN", remainingSeconds,
      remainingDays: Math.floor(remainingSeconds / 86_400), remainingHours: Math.ceil((remainingSeconds % 86_400) / 3600) });
  }
  try { db.prepare("UPDATE users SET username=?,last_username_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(username, userId); }
  catch { return res.status(409).json({ error: "USERNAME_TAKEN" }); }
  res.json({ username, lastUsernameChangedAt: new Date().toISOString() });
});

userRouter.get("/decks", (req, res) => {
  res.json({ decks: db.prepare(`SELECT d.id,d.name,d.description,d.created_at AS createdAt,COUNT(w.rowid) AS wordCount
    FROM user_decks d LEFT JOIN user_deck_words w ON w.deck_id=d.id WHERE d.user_id=? GROUP BY d.id ORDER BY d.created_at`).all(uid(req)) });
});
userRouter.post("/decks", (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(400).default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_DECK" });
  const id = randomUUID();
  try { db.prepare("INSERT INTO user_decks(id,user_id,name,description) VALUES(?,?,?,?)").run(id,uid(req),parsed.data.name,parsed.data.description); }
  catch { return res.status(409).json({ error: "DECK_NAME_EXISTS" }); }
  res.status(201).json({ deck: db.prepare("SELECT id,name,description,created_at AS createdAt FROM user_decks WHERE id=?").get(id) });
});
userRouter.put("/decks/:id", (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(400).default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_DECK" });
  const result = db.prepare("UPDATE user_decks SET name=?,description=? WHERE id=? AND user_id=?").run(parsed.data.name,parsed.data.description,req.params.id,uid(req));
  if (!result.changes) return res.status(404).json({ error: "DECK_NOT_FOUND" });
  res.json({ updated: true });
});
userRouter.delete("/decks/:id", (req, res) => {
  const result = db.prepare("DELETE FROM user_decks WHERE id=? AND user_id=?").run(req.params.id,uid(req));
  if (!result.changes) return res.status(404).json({ error: "DECK_NOT_FOUND" });
  res.status(204).end();
});
userRouter.delete("/decks/:deckId/words/:wordId", (req,res)=>{
  const result=db.prepare(`DELETE FROM user_deck_words WHERE deck_id=? AND word_id=? AND deck_id IN (SELECT id FROM user_decks WHERE user_id=?)`)
    .run(req.params.deckId,req.params.wordId,uid(req));
  if(!result.changes)return res.status(404).json({error:"DECK_WORD_NOT_FOUND"});res.status(204).end();
});
userRouter.get("/saved-words", (req, res) => {
  res.json({ words: db.prepare(`SELECT v.id,v.level,v.hanzi,v.pinyin,v.meaning_en AS meaningEn,v.meaning_vi AS meaningVi,
    v.han_viet AS hanViet,v.pos AS partOfSpeech,d.id AS deckId,d.name AS deckName
    FROM user_decks d JOIN user_deck_words w ON w.deck_id=d.id JOIN vocabulary v ON v.id=w.word_id
    WHERE d.user_id=? ORDER BY w.created_at DESC`).all(uid(req)) });
});
userRouter.post("/saved-words", (req, res) => {
  const parsed = z.object({ wordId: z.string().min(1).max(200), deckId: z.string().uuid().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_WORD_ID" });
  if (!db.prepare("SELECT 1 FROM vocabulary WHERE id=?").get(parsed.data.wordId)) return res.status(404).json({ error: "WORD_NOT_FOUND" });
  let deckId = parsed.data.deckId;
  if (deckId && !db.prepare("SELECT 1 FROM user_decks WHERE id=? AND user_id=?").get(deckId,uid(req))) return res.status(404).json({ error: "DECK_NOT_FOUND" });
  if (!deckId) {
    let defaultDeck = db.prepare("SELECT id FROM user_decks WHERE user_id=? AND name='Từ đã lưu'").get(uid(req)) as { id: string } | undefined;
    if (!defaultDeck) { const id=randomUUID(); db.prepare("INSERT INTO user_decks(id,user_id,name) VALUES(?,?,'Từ đã lưu')").run(id,uid(req)); defaultDeck={id}; }
    deckId=defaultDeck.id;
  }
  db.prepare("INSERT OR IGNORE INTO user_deck_words(deck_id,word_id) VALUES(?,?)").run(deckId,parsed.data.wordId);
  res.status(201).json({ saved: true, deckId });
});
userRouter.delete("/saved-words/:id", (req, res) => {
  const result=db.prepare("DELETE FROM user_deck_words WHERE word_id=? AND deck_id IN (SELECT id FROM user_decks WHERE user_id=?)").run(req.params.id,uid(req));
  if (!result.changes) return res.status(404).json({ error: "SAVED_WORD_NOT_FOUND" });
  res.status(204).end();
});
userRouter.get("/reviews", (req, res) => {
  const rows=db.prepare(`SELECT v.id,v.level,v.hanzi,v.pinyin,v.meaning_en AS meaningEn,v.meaning_vi AS meaningVi,v.han_viet AS hanViet,
    v.example_zh AS exampleChinese,v.example_vi AS exampleVietnamese,v.example_en AS exampleEnglish,r.due_at AS dueAt,r.success_streak AS successStreak
    FROM flashcard_reviews r JOIN vocabulary v ON v.id=r.word_id WHERE r.user_id=? AND r.due_at<=? ORDER BY r.due_at LIMIT 100`).all(uid(req),Date.now());
  res.json({ words: rows });
});
userRouter.post("/reviews/:wordId", (req, res) => {
  const parsed=z.object({ remembered:z.boolean(),clientEventId:z.string().uuid(),timezone:z.string().max(64).default("Asia/Ho_Chi_Minh") }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"INVALID_REVIEW"});
  const userId=uid(req); const wordId=req.params.wordId; const now=Date.now();
  if(!db.prepare("SELECT 1 FROM vocabulary WHERE id=?").get(wordId))return res.status(404).json({error:"WORD_NOT_FOUND"});
  const profile=db.prepare("SELECT timezone FROM users WHERE id=?").get(userId) as {timezone:string};
  const timezone=isValidTimezone(profile.timezone)?profile.timezone:(isValidTimezone(parsed.data.timezone)?parsed.data.timezone:"Asia/Ho_Chi_Minh");
  const localDate=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
  const result=parsed.data.remembered?"remembered":"forgot";
  db.exec("BEGIN IMMEDIATE");
  try{
    const isNewToday=!db.prepare("SELECT 1 FROM review_events WHERE user_id=? AND word_id=? AND local_date=?").get(userId,wordId,localDate);
    const event=db.prepare(`INSERT OR IGNORE INTO review_events(user_id,word_id,result,occurred_at,local_date,timezone,client_event_id) VALUES(?,?,?,?,?,?,?)`)
      .run(userId,wordId,result,now,localDate,timezone,parsed.data.clientEventId);
    if(event.changes){
      db.prepare(`INSERT INTO flashcard_reviews(user_id,word_id,due_at,remembered,seen_count,success_streak,updated_at) VALUES(?,?,?,?,1,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,word_id) DO UPDATE SET due_at=excluded.due_at,remembered=excluded.remembered,seen_count=flashcard_reviews.seen_count+1,
        success_streak=CASE WHEN excluded.remembered=1 THEN flashcard_reviews.success_streak+1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP`)
        .run(userId,wordId,now+(parsed.data.remembered?86_400_000:300_000),parsed.data.remembered?1:0,parsed.data.remembered?1:0);
      db.prepare(`INSERT INTO daily_study_stats(user_id,study_date,timezone,words_reviewed,unique_words) VALUES(?,?,?,1,1)
        ON CONFLICT(user_id,study_date) DO UPDATE SET words_reviewed=words_reviewed+1,unique_words=unique_words+?,timezone=excluded.timezone,updated_at=CURRENT_TIMESTAMP`)
        .run(userId,localDate,timezone,isNewToday?1:0);
    }
    db.exec("COMMIT");
    res.json({saved:Boolean(event.changes),dueAt:now+(parsed.data.remembered?86_400_000:300_000),localDate});
  }catch(error){db.exec("ROLLBACK");throw error;}
});
userRouter.get("/stats", (req, res) => {
  const userId=uid(req); const user=db.prepare("SELECT timezone FROM users WHERE id=?").get(userId) as {timezone:string};
  const timezone=isValidTimezone(user.timezone)?user.timezone:"Asia/Ho_Chi_Minh";
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const learnedToday=(db.prepare("SELECT COUNT(DISTINCT word_id) AS count FROM review_events WHERE user_id=? AND local_date=?").get(userId,today) as {count:number}).count;
  const mastered=(db.prepare("SELECT COUNT(*) AS count FROM flashcard_reviews WHERE user_id=? AND success_streak>=5").get(userId) as {count:number}).count;
  const reviewing=(db.prepare("SELECT COUNT(*) AS count FROM flashcard_reviews WHERE user_id=? AND success_streak<5").get(userId) as {count:number}).count;
  const dates=(db.prepare("SELECT DISTINCT local_date AS date FROM review_events WHERE user_id=? ORDER BY local_date DESC LIMIT 400").all(userId) as {date:string}[]).map(row=>row.date);
  let streak=0;const activeDates=new Set(dates);let cursor=activeDates.has(today)?today:offsetDate(today,-1);
  while(activeDates.has(cursor)){streak++;cursor=offsetDate(cursor,-1);}
  const activity=db.prepare("SELECT study_date AS date,unique_words AS count FROM daily_study_stats WHERE user_id=? AND study_date>=? ORDER BY study_date").all(userId,offsetDate(today,-83));
  const activeSeconds=(db.prepare("SELECT COALESCE(SUM(active_seconds),0) AS seconds FROM daily_study_stats WHERE user_id=?").get(userId) as {seconds:number}).seconds;
  res.json({metrics:{learnedToday,mastered,reviewing,streak,activeSeconds},activity});
});
function isValidTimezone(zone:string){try{new Intl.DateTimeFormat("en-US",{timeZone:zone});return true;}catch{return false;}}
function offsetDate(iso:string,days:number){const d=new Date(`${iso}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
