import type { NextFunction, Request, Response } from "express";
import { firebaseAuth } from "./firebase-admin.js";
import { db } from "./db.js";

export type AppRole = "guest" | "user" | "admin";
export interface AuthenticatedUser {
  firebaseUid: string;
  userId: string | null;
  email: string | null;
  displayName: string;
  studyUid: string | null;
  role: AppRole;
  claims: FirebaseClaims;
}
export interface FirebaseClaims { uid: string; email?: string; email_verified?: boolean; name?: string; phone_number?: string; admin?: boolean; role?: string; firebase?: { sign_in_provider?: string }; [key: string]: unknown }
declare global { namespace Express { interface Request { user?: AuthenticatedUser } } }

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return res.status(401).json({ error: "AUTH_REQUIRED" });
  try {
    const adminAuth = await firebaseAuth();
    const claims = await adminAuth.verifyIdToken(match[1], true) as FirebaseClaims;
    claims.uid = claims.uid || String(claims.sub || "");
    if (!claims.uid) return res.status(401).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
    const row = db.prepare(`SELECT u.id AS userId,u.email,u.display_name AS displayName,u.study_uid AS studyUid,
      CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_key='admin') THEN 'admin' ELSE 'user' END AS role
      FROM users u WHERE u.firebase_uid=?`).get(claims.uid) as Omit<AuthenticatedUser, "firebaseUid" | "claims"> | undefined;
    req.user = { firebaseUid: claims.uid, userId: row?.userId ?? null, email: row?.email ?? claims.email ?? null,
      displayName: row?.displayName ?? claims.name ?? "", studyUid: row?.studyUid ?? null,
      role: row?.role as AppRole ?? "guest", claims };
    next();
  } catch (error) {
    if (error instanceof Error && error.message === "FIREBASE_PROJECT_ID_MISSING") return res.status(503).json({ error: "FIREBASE_NOT_CONFIGURED" });
    const code=(error as NodeJS.ErrnoException)?.code;
    if(code==="ERR_MODULE_NOT_FOUND"||code==="MODULE_NOT_FOUND"||error instanceof Error&&/default credentials|credential.*not found/i.test(error.message))
      return res.status(503).json({ error: "FIREBASE_CREDENTIALS_UNAVAILABLE" });
    return res.status(401).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
  }
}

export async function authenticateOptional(req: Request, res: Response, next: NextFunction) {
  if (!req.header("authorization")) return next();
  return authenticate(req, res, next);
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.userId) return res.status(403).json({ error: "PROFILE_SYNC_REQUIRED" });
  next();
}

export function checkRole(allowedRoles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  };
}
