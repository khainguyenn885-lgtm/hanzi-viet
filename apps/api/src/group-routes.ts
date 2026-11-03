import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate, requireUser } from "./auth-middleware.js";

export const communityRouter=Router();communityRouter.use(authenticate,requireUser);
export const groupRouter=Router();groupRouter.use(authenticate,requireUser);
const userId=(req:import("express").Request)=>req.user!.userId!;
communityRouter.get("/me",(req,res)=>{
  const id=userId(req);const account=db.prepare("SELECT study_uid AS studyUid,timezone FROM users WHERE id=?").get(id) as {studyUid:string;timezone:string};
  const metrics=statsFor(id,account.timezone);
  const groups=db.prepare(`SELECT g.id,g.name,g.kind,COUNT(m.user_id) AS memberCount FROM study_groups g JOIN group_members mine ON mine.group_id=g.id
    JOIN group_members m ON m.group_id=g.id WHERE mine.user_id=? GROUP BY g.id ORDER BY g.created_at`).all(id);
  const decks=db.prepare("SELECT id,name FROM user_decks WHERE user_id=? ORDER BY name").all(id);
  res.json({studyUid:account.studyUid,metrics,groups,decks});
});
communityRouter.get("/activity",(req,res)=>{
  const days=Math.min(Math.max(Number(req.query.days??84),1),366);const id=userId(req);
  const profile=db.prepare("SELECT timezone FROM users WHERE id=?").get(id) as {timezone:string};const tz=validTz(profile.timezone)?profile.timezone:"Asia/Ho_Chi_Minh";
  const today=localDate(tz);const from=offset(today,-days+1);const rows=db.prepare("SELECT study_date,unique_words FROM daily_study_stats WHERE user_id=? AND study_date>=?").all(id,from) as Array<{study_date:string;unique_words:number}>;
  const byDate=new Map(rows.map(row=>[row.study_date,row.unique_words]));const result=Array.from({length:days},(_,i)=>byDate.get(offset(from,i))??0);
  res.json({days:result});
});
communityRouter.get("/invites",(req,res)=>{
  const row=db.prepare("SELECT study_uid FROM users WHERE id=?").get(userId(req)) as {study_uid:string};
  res.json({invites:db.prepare(`SELECT i.id,i.group_id AS groupId,g.name AS groupName,u.display_name AS inviterName,i.expires_at AS expiresAt
    FROM group_invites i JOIN study_groups g ON g.id=i.group_id JOIN users u ON u.id=i.inviter_user_id
    WHERE i.invitee_study_uid=? AND i.status='pending' AND i.expires_at>CURRENT_TIMESTAMP ORDER BY i.created_at DESC`).all(row.study_uid)});
});
communityRouter.patch("/invites/:id",(req,res)=>{
  const parsed=z.object({accept:z.boolean()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_INVITE_RESPONSE"});
  const invite=db.prepare(`SELECT i.id,i.group_id AS groupId,i.invitee_study_uid AS inviteeStudyUid,g.kind FROM group_invites i
    JOIN study_groups g ON g.id=i.group_id WHERE i.id=? AND i.status='pending' AND i.expires_at>CURRENT_TIMESTAMP`).get(req.params.id) as {id:string;groupId:string;inviteeStudyUid:string;kind:string}|undefined;
  const self=db.prepare("SELECT study_uid AS studyUid FROM users WHERE id=?").get(userId(req)) as {studyUid:string};
  if(!invite||invite.inviteeStudyUid!==self.studyUid)return res.status(404).json({error:"INVITE_NOT_FOUND"});
  db.exec("BEGIN IMMEDIATE");try{
    if(parsed.data.accept)db.prepare("INSERT OR IGNORE INTO group_members(group_id,user_id,role) VALUES(?,?,'member')").run(invite.groupId,userId(req));
    db.prepare("UPDATE group_invites SET status=? WHERE id=? AND status='pending'").run(parsed.data.accept?"accepted":"declined",invite.id);db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");if(String(error).includes("GROUP_FULL"))return res.status(409).json({error:"GROUP_FULL"});throw error;}
  res.json({accepted:parsed.data.accept});
});
groupRouter.post("/",(req,res)=>{
  const parsed=z.object({name:z.string().trim().min(1).max(40),kind:z.enum(["pair","group"]).default("group")}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"INVALID_GROUP"});const id=randomUUID();
  db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO study_groups(id,owner_user_id,name,kind) VALUES(?,?,?,?)").run(id,userId(req),parsed.data.name,parsed.data.kind);db.prepare("INSERT INTO group_members(group_id,user_id,role) VALUES(?,?,'owner')").run(id,userId(req));db.exec("COMMIT");}
  catch(error){db.exec("ROLLBACK");throw error;}
  res.status(201).json({group:{id,name:parsed.data.name,kind:parsed.data.kind,memberCount:1}});
});
groupRouter.post("/:id/invites",(req,res)=>{
  const parsed=z.object({studyUid:z.string().regex(/^#[0-9]{6}$/)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_STUDY_UID"});
  const id=userId(req);const group=db.prepare(`SELECT g.id,g.kind FROM study_groups g JOIN group_members m ON m.group_id=g.id WHERE g.id=? AND m.user_id=?`).get(req.params.id,id) as {id:string;kind:string}|undefined;
  if(!group)return res.status(404).json({error:"GROUP_NOT_FOUND"});const recipient=db.prepare("SELECT id,study_uid FROM users WHERE study_uid=?").get(parsed.data.studyUid) as {id:string;study_uid:string}|undefined;
  if(!recipient)return res.status(404).json({error:"STUDY_UID_NOT_FOUND"});if(recipient.id===id)return res.status(400).json({error:"CANNOT_INVITE_SELF"});
  const count=(db.prepare("SELECT COUNT(*) AS count FROM group_members WHERE group_id=?").get(group.id) as {count:number}).count;
  const max=group.kind==="pair"?2:5;if(count>=max)return res.status(409).json({error:"GROUP_FULL"});
  const duplicate=db.prepare("SELECT 1 FROM group_invites WHERE group_id=? AND invitee_study_uid=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP").get(group.id,recipient.study_uid);
  if(duplicate)return res.status(409).json({error:"INVITE_ALREADY_PENDING"});
  const inviteId=randomUUID();db.prepare(`INSERT INTO group_invites(id,group_id,inviter_user_id,invitee_study_uid,expires_at) VALUES(?,?,?,?,datetime('now','+7 days'))`).run(inviteId,group.id,id,recipient.study_uid);
  res.status(201).json({inviteId});
});
groupRouter.get("/:id/leaderboard",(req,res)=>{
  const membership=db.prepare(`SELECT u.timezone FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND m.user_id=?`).get(req.params.id,userId(req)) as {timezone:string}|undefined;
  if(!membership)return res.status(403).json({error:"GROUP_MEMBERSHIP_REQUIRED"});const tz=validTz(membership.timezone)?membership.timezone:"Asia/Ho_Chi_Minh";const today=localDate(tz);const weekStart=monday(today);
  const rows=db.prepare(`SELECT u.study_uid AS studyUid,u.display_name AS displayName,
    COUNT(DISTINCT CASE WHEN e.local_date=? THEN e.word_id END) AS learnedToday,
    COUNT(DISTINCT CASE WHEN e.local_date>=? THEN e.word_id END) AS learnedThisWeek
    FROM group_members m JOIN users u ON u.id=m.user_id LEFT JOIN review_events e ON e.user_id=u.id
    WHERE m.group_id=? GROUP BY u.id ORDER BY learnedToday DESC,learnedThisWeek DESC`).all(today,weekStart,req.params.id);
  const all=rows as Array<{studyUid:string;learnedToday:number;learnedThisWeek:number}>;res.json({day:all,week:[...all].sort((a,b)=>b.learnedThisWeek-a.learnedThisWeek)});
});
groupRouter.post("/:id/decks",(req,res)=>{
  const parsed=z.object({deckId:z.string().uuid()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_DECK"});const id=userId(req);
  const member=db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(req.params.id,id);if(!member)return res.status(403).json({error:"GROUP_MEMBERSHIP_REQUIRED"});
  const deck=db.prepare("SELECT id FROM user_decks WHERE id=? AND user_id=?").get(parsed.data.deckId,id);if(!deck)return res.status(404).json({error:"DECK_NOT_FOUND"});
  db.prepare("INSERT OR IGNORE INTO group_deck_shares(group_id,deck_id,shared_by) VALUES(?,?,?)").run(req.params.id,parsed.data.deckId,id);res.status(201).json({shared:true});
});
function statsFor(id:string,timezone:string){const tz=validTz(timezone)?timezone:"Asia/Ho_Chi_Minh";const today=localDate(tz);const learnedToday=(db.prepare("SELECT COUNT(DISTINCT word_id) AS n FROM review_events WHERE user_id=? AND local_date=?").get(id,today) as {n:number}).n;const mastered=(db.prepare("SELECT COUNT(*) AS n FROM flashcard_reviews WHERE user_id=? AND success_streak>=5").get(id) as {n:number}).n;const reviewing=(db.prepare("SELECT COUNT(*) AS n FROM flashcard_reviews WHERE user_id=? AND success_streak<5").get(id) as {n:number}).n;for(const target of [50,100,500,1000])if(mastered>=target)db.prepare("INSERT OR IGNORE INTO badge_awards(user_id,badge_key) VALUES(?,?)").run(id,`mastered-${target}`);const dates=db.prepare("SELECT DISTINCT local_date FROM review_events WHERE user_id=? ORDER BY local_date DESC LIMIT 400").all(id) as Array<{local_date:string}>;const activeDates=new Set(dates.map(row=>row.local_date));let cursor=activeDates.has(today)?today:offset(today,-1);let streak=0;while(activeDates.has(cursor)){streak++;cursor=offset(cursor,-1);}return{learnedToday,mastered,reviewing,streak};}
function validTz(value:string){try{Intl.DateTimeFormat("en-US",{timeZone:value});return true;}catch{return false;}}
function localDate(tz:string,date=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
function offset(iso:string,days:number){const date=new Date(`${iso}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function monday(iso:string){const date=new Date(`${iso}T00:00:00Z`);const day=date.getUTCDay()||7;return offset(iso,-day+1);}
