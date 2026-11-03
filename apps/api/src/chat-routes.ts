import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authenticate, checkRole, requireUser } from "./auth-middleware.js";
import { db } from "./db.js";

export const chatRouter = Router();
chatRouter.use(authenticate, requireUser);
export const supportAdminRouter = Router();
supportAdminRouter.use(authenticate, requireUser, checkRole(["admin"]));
const me = (req: Request) => req.user!.userId!;

chatRouter.get("/", (req, res) => res.json({ conversations: listConversations(me(req), false) }));

chatRouter.post("/direct", (req, res) => {
  const parsed = z.object({ identifier: z.string().trim().min(3).max(24) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_FRIEND_IDENTIFIER" });
  const id = me(req); const identifier = parsed.data.identifier.replace(/^@/, "");
  const friend = db.prepare("SELECT id FROM users WHERE study_uid=? OR username=? COLLATE NOCASE LIMIT 1").get(identifier, identifier) as { id: string } | undefined;
  if (!friend) return res.status(404).json({ error: "USER_NOT_FOUND" });
  if (!db.prepare(`SELECT 1 FROM friendships WHERE status='accepted' AND ((user_low_id=? AND user_high_id=?) OR (user_low_id=? AND user_high_id=?))`)
    .get(id, friend.id, friend.id, id)) return res.status(403).json({ error: "FRIENDSHIP_REQUIRED" });
  const low = id < friend.id ? id : friend.id; const high = id < friend.id ? friend.id : id; const key = `${low}:${high}`;
  let conversation = db.prepare("SELECT id FROM chat_conversations WHERE direct_key=?").get(key) as { id: string } | undefined;
  if (!conversation) {
    const convId = randomUUID();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT OR IGNORE INTO chat_conversations(id,kind,direct_key) VALUES(?,'direct',?)").run(convId,key);
      conversation = db.prepare("SELECT id FROM chat_conversations WHERE direct_key=?").get(key) as { id: string };
      db.prepare("INSERT OR IGNORE INTO chat_participants(conversation_id,user_id) VALUES(?,?),(?,?)").run(conversation.id,id,conversation.id,friend.id);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  res.json({ conversation: listOneConversation(conversation.id, id) });
});

chatRouter.post("/groups/:groupId", (req, res) => {
  const id = me(req); const group = db.prepare(`SELECT g.id,g.name FROM study_groups g JOIN group_members m ON m.group_id=g.id
    WHERE g.id=? AND m.user_id=?`).get(req.params.groupId,id) as { id:string; name:string }|undefined;
  if (!group) return res.status(403).json({ error: "GROUP_MEMBERSHIP_REQUIRED" });
  let conversation = db.prepare("SELECT id FROM chat_conversations WHERE group_id=? AND kind='group'").get(group.id) as { id:string }|undefined;
  if (!conversation) {
    const convId=randomUUID();db.exec("BEGIN IMMEDIATE");try{
      db.prepare("INSERT OR IGNORE INTO chat_conversations(id,kind,group_id) VALUES(?,'group',?)").run(convId,group.id);
      conversation=db.prepare("SELECT id FROM chat_conversations WHERE group_id=? AND kind='group'").get(group.id) as {id:string};
      db.prepare("INSERT OR IGNORE INTO chat_participants(conversation_id,user_id) SELECT ?,user_id FROM group_members WHERE group_id=?").run(conversation.id,group.id);
      db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error;}
  }
  res.json({ conversation:listOneConversation(conversation.id,id) });
});

chatRouter.post("/support",(req,res)=>{
  const userId=me(req);let conversation=db.prepare("SELECT id FROM chat_conversations WHERE kind='support' AND support_user_id=?").get(userId) as {id:string}|undefined;
  if(!conversation){const id=randomUUID();db.prepare("INSERT OR IGNORE INTO chat_conversations(id,kind,support_user_id) VALUES(?,'support',?)").run(id,userId);conversation=db.prepare("SELECT id FROM chat_conversations WHERE kind='support' AND support_user_id=?").get(userId) as {id:string};db.prepare("INSERT OR IGNORE INTO chat_participants(conversation_id,user_id) VALUES(?,?)").run(conversation.id,userId);}
  res.json({conversation:listOneConversation(conversation.id,userId)});
});

chatRouter.get("/:id/messages",(req,res)=>messages(req,res,false));
chatRouter.post("/:id/messages",(req,res)=>sendMessage(req,res,false));
supportAdminRouter.get("/",(_req,res)=>res.json({conversations:listConversations(null,true)}));
supportAdminRouter.get("/:id/messages",(req,res)=>messages(req,res,true));
supportAdminRouter.post("/:id/messages",(req,res)=>sendMessage(req,res,true));

function listConversations(userId:string|null,admin:boolean){
  const where=admin?"c.kind='support'":"p.user_id=?";
  const params=admin?[]:[userId];
  return db.prepare(`SELECT c.id,c.kind,c.group_id AS groupId,c.created_at AS createdAt,c.last_message_at AS lastMessageAt,
    CASE WHEN c.kind='support' THEN CASE WHEN ? THEN COALESCE(requester.display_name,'Người học')||' · Hotline' ELSE 'Hotline hỗ trợ' END
      WHEN c.kind='group' THEN g.name ELSE COALESCE(peer.username,peer.display_name,'Bạn học') END AS title,
    lm.message_type AS lastMessageType,lm.body AS lastMessage,
    (SELECT COUNT(*) FROM chat_messages m2 WHERE m2.conversation_id=c.id) AS messageCount
    FROM chat_conversations c LEFT JOIN chat_participants p ON p.conversation_id=c.id AND p.user_id=?
    LEFT JOIN users requester ON requester.id=c.support_user_id LEFT JOIN study_groups g ON g.id=c.group_id
    LEFT JOIN chat_participants otherp ON otherp.conversation_id=c.id AND otherp.user_id<>?
    LEFT JOIN users peer ON peer.id=otherp.user_id
    LEFT JOIN chat_messages lm ON lm.id=(SELECT m3.id FROM chat_messages m3 WHERE m3.conversation_id=c.id ORDER BY m3.created_at DESC,m3.id DESC LIMIT 1)
    WHERE ${where} ORDER BY c.last_message_at DESC`).all(admin?1:0,userId,userId,...params);
}
function listOneConversation(id:string,userId:string){
  return db.prepare(`SELECT c.id,c.kind,c.group_id AS groupId,c.last_message_at AS lastMessageAt,
    CASE WHEN c.kind='support' THEN 'Hotline hỗ trợ' WHEN c.kind='group' THEN g.name ELSE COALESCE(peer.username,peer.display_name,'Bạn học') END AS title
    FROM chat_conversations c LEFT JOIN study_groups g ON g.id=c.group_id
    LEFT JOIN chat_participants p ON p.conversation_id=c.id AND p.user_id=?
    LEFT JOIN users peer ON peer.id=(SELECT user_id FROM chat_participants WHERE conversation_id=c.id AND user_id<>? LIMIT 1)
    WHERE c.id=?`).get(userId,userId,id);
}
function allowed(conversationId:string,userId:string,admin:boolean){
  return db.prepare(`SELECT c.kind,c.support_user_id AS supportUserId FROM chat_conversations c
    WHERE c.id=? AND (?=1 AND c.kind='support' OR EXISTS(SELECT 1 FROM chat_participants p WHERE p.conversation_id=c.id AND p.user_id=?))`)
    .get(conversationId,admin?1:0,userId) as {kind:string;supportUserId:string|null}|undefined;
}
function messages(req:Request,res:Response,admin:boolean){
  const userId=me(req);const conversation=allowed(req.params.id,userId,admin);
  if(!conversation)return res.status(404).json({error:"CONVERSATION_NOT_FOUND"});
  const after=String(req.query.after??"").slice(0,80);
  const rows=db.prepare(`SELECT m.id,m.message_type AS type,m.body,m.word_card_json AS wordCardJson,m.created_at AS createdAt,
    u.id AS senderId,u.display_name AS senderName,u.username AS senderUsername FROM chat_messages m JOIN users u ON u.id=m.sender_user_id
    WHERE m.conversation_id=? AND (?='' OR (m.created_at,m.id)>(SELECT created_at,id FROM chat_messages WHERE id=? AND conversation_id=?))
    ORDER BY m.created_at,m.id LIMIT 200`).all(req.params.id,after,after,req.params.id) as Array<Record<string,unknown>&{wordCardJson:string|null}>;
  res.json({messages:rows.map(row=>({...row,wordCard:row.wordCardJson?JSON.parse(row.wordCardJson):null,wordCardJson:undefined}))});
}
function sendMessage(req:Request,res:Response,admin:boolean){
  const parsed=z.object({type:z.enum(["text","word_card"]).default("text"),body:z.string().trim().max(1500).default(""),wordCard:z.object({wordId:z.string().max(200).optional(),hanzi:z.string().min(1).max(40),pinyin:z.string().max(120).default(""),meaningVi:z.string().max(400).default(""),meaningEn:z.string().max(400).default("")}).optional()}).safeParse(req.body);
  if(!parsed.success||parsed.data.type==="text"&&!parsed.data.body||parsed.data.type==="word_card"&&!parsed.data.wordCard)return res.status(400).json({error:"INVALID_MESSAGE"});
  const userId=me(req);const conversation=allowed(req.params.id,userId,admin);
  if(!conversation)return res.status(404).json({error:"CONVERSATION_NOT_FOUND"});
  if(parsed.data.type==="word_card"&&parsed.data.wordCard?.wordId&&!db.prepare("SELECT 1 FROM vocabulary WHERE id=?").get(parsed.data.wordCard.wordId))return res.status(404).json({error:"WORD_NOT_FOUND"});
  if(admin)db.prepare("INSERT OR IGNORE INTO chat_participants(conversation_id,user_id) VALUES(?,?)").run(req.params.id,userId);
  const id=randomUUID();
const conversationId = String(req.params.id || '');
  const messageId = String(id);
  const senderId = String(userId || '');
  const wordCardJson = parsed.data.wordCard ? JSON.stringify(parsed.data.wordCard) : null;

  db.prepare("INSERT INTO chat_messages(id,conversation_id,sender_user_id,message_type,body,word_card_json) VALUES(?,?,?,?,?,?)")
    .run(messageId, conversationId, senderId, parsed.data.type, parsed.data.body, wordCardJson);

  db.prepare("UPDATE chat_conversations SET last_message_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(conversationId);

  res.status(201).json({ id, created: true });
}
