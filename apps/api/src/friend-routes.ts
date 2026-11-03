import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireUser } from "./auth-middleware.js";
import { db } from "./db.js";

export const friendRouter = Router();
friendRouter.use(authenticate, requireUser);
const selfId = (req: import("express").Request) => req.user!.userId!;

friendRouter.get("/", (req, res) => {
  const rows = db.prepare(`SELECT u.id AS userId,u.display_name AS displayName,u.study_uid AS studyUid,u.username,u.last_active_at AS lastActiveAt
    FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low_id=? THEN f.user_high_id ELSE f.user_low_id END
    WHERE (f.user_low_id=? OR f.user_high_id=?) AND f.status='accepted' ORDER BY COALESCE(u.username,u.display_name) COLLATE NOCASE`)
    .all(selfId(req), selfId(req), selfId(req)) as Array<{ userId: string; displayName: string; studyUid: string; username: string | null; lastActiveAt: number | null }>;
  res.json({ friends: rows.map(({ lastActiveAt, ...friend }) => ({ ...friend, online: lastActiveAt !== null && Date.now() - lastActiveAt <= 120_000 })) });
});

friendRouter.get("/search", (req, res) => {
  const query = String(req.query.q ?? "").trim().replace(/^@/, "").slice(0, 24);
  if (query.length < 3) return res.json({ users: [] });
  const me = selfId(req);
  const row = db.prepare(`SELECT id AS userId,display_name AS displayName,study_uid AS studyUid,username,
    CASE WHEN last_active_at>=? THEN 1 ELSE 0 END AS online
    FROM users WHERE id<>? AND (study_uid=? OR username=? COLLATE NOCASE) LIMIT 10`)
    .all(Date.now() - 120_000, me, query, query) as Array<{ userId: string; displayName: string; studyUid: string; username: string | null; online: number }>;
  res.json({ users: row.map(user => ({ ...user, online: Boolean(user.online) })) });
});

friendRouter.get("/requests", (req, res) => {
  const id = selfId(req);
  const rows = db.prepare(`SELECT f.id,f.status,f.requested_by AS requestedBy,(f.requested_by<>?) AS incoming,f.created_at AS createdAt,
    u.id AS userId,u.display_name AS displayName,u.study_uid AS studyUid,u.username
    FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low_id=? THEN f.user_high_id ELSE f.user_low_id END
    WHERE (f.user_low_id=? OR f.user_high_id=?) AND f.status='pending' ORDER BY f.created_at DESC`).all(id,id,id,id);
  res.json({ requests: rows });
});

friendRouter.post("/requests", (req, res) => {
  const parsed = z.object({ identifier: z.string().trim().min(3).max(24) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_FRIEND_IDENTIFIER" });
  const identifier = parsed.data.identifier.replace(/^@/, "");
  const other = db.prepare("SELECT id,study_uid AS studyUid FROM users WHERE study_uid=? OR username=? COLLATE NOCASE LIMIT 1").get(identifier, identifier) as { id: string; studyUid: string } | undefined;
  if (!other) return res.status(404).json({ error: "USER_NOT_FOUND" });
  const me = selfId(req);
  if (other.id === me) return res.status(400).json({ error: "CANNOT_FRIEND_SELF" });
  const low = me < other.id ? me : other.id; const high = me < other.id ? other.id : me;
  const existing = db.prepare("SELECT id,status,requested_by AS requestedBy FROM friendships WHERE user_low_id=? AND user_high_id=?").get(low, high) as { id: string; status: string; requestedBy: string } | undefined;
  if (existing?.status === "accepted") return res.status(409).json({ error: "ALREADY_FRIENDS" });
  if (existing?.status === "pending") return res.status(409).json({ error: existing.requestedBy === me ? "REQUEST_ALREADY_SENT" : "INCOMING_REQUEST_EXISTS" });
  const id = existing?.id ?? randomUUID();
  db.prepare(`INSERT INTO friendships(id,user_low_id,user_high_id,requested_by,status) VALUES(?,?,?,?, 'pending')
    ON CONFLICT(user_low_id,user_high_id) DO UPDATE SET requested_by=excluded.requested_by,status='pending',updated_at=CURRENT_TIMESTAMP`)
    .run(id, low, high, me);
  res.status(201).json({ requestId: id, sent: true });
});

friendRouter.patch("/requests/:id", (req, res) => {
  const parsed = z.object({ response: z.enum(["accepted", "declined"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_REQUEST_RESPONSE" });
  const result = db.prepare(`UPDATE friendships SET status=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='pending' AND requested_by<>? AND (user_low_id=? OR user_high_id=?)`)
    .run(parsed.data.response, req.params.id, selfId(req), selfId(req), selfId(req));
  if (!result.changes) return res.status(404).json({ error: "FRIEND_REQUEST_NOT_FOUND" });
  res.json({ status: parsed.data.response });
});
