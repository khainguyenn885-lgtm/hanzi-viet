import type { AnalyzedToken, FeedbackCategory, WordRecord } from "./types";

function appClientId(): string {
  return "local-browser";
}
let tokenProvider: (() => Promise<string>) | null = null;
export const setAuthTokenProvider = (provider: (() => Promise<string>) | null) => { tokenProvider=provider; };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const token=tokenProvider?await tokenProvider():null;
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", "X-App-Client": appClientId(), ...(token?{Authorization:`Bearer ${token}`} : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || body.error || `HTTP ${response.status}`), { status: response.status, code: body.error });
  return body as T;
}

export const analyze = (text: string) => json<{ tokens: AnalyzedToken[]; sentenceTranslation: { available: boolean; sentenceZh: string; meaningVi: string; meaningEn: string; source: string | null } }>("/api/analyze", { method: "POST", body: JSON.stringify({ text }) });
export const searchWords = (term: string, level = 0) => json<{ words: WordRecord[]; total: number }>(`/api/words?term=${encodeURIComponent(term)}&level=${level}&limit=50`);
export const requestJson = <T>(url:string,init?:RequestInit)=>json<T>(url,init);
export const syncProfile = () => json<{profile:import("./auth-session").UserProfile}>("/api/auth/sync",{method:"POST",body:"{}"});
export const getSavedWords = () => json<{words:WordRecord[]}>("/api/me/saved-words");
export const saveWord = (wordId: string,deckId?:string) => json<{saved:boolean}>("/api/me/saved-words",{method:"POST",body:JSON.stringify({wordId,...(deckId?{deckId}:{})})});
export const unsaveWord = (wordId:string) => json<void>(`/api/me/saved-words/${encodeURIComponent(wordId)}`,{method:"DELETE"});
export const getDueWords = () => json<{words:(WordRecord & {dueAt:number})[]}>("/api/me/reviews");
export const submitReview = (wordId:string,remembered:boolean,timezone:string) => json<{saved:boolean;dueAt:number}>(`/api/me/reviews/${encodeURIComponent(wordId)}`,{method:"POST",body:JSON.stringify({remembered,timezone,clientEventId:crypto.randomUUID()})});
export const getUserStats = () => json<{metrics:{learnedToday:number;mastered:number;reviewing:number;streak:number}}>("/api/me/stats");
export const findWord = (surface: string) => json<{ word: WordRecord }>(`/api/words/${encodeURIComponent(surface)}`);
export const getWritingCharacters = (level: 1 | 2) => json<{ level: number; characters: string[] }>(`/api/writing-characters?level=${level}`);
export const sendFeedback = (body: { category: FeedbackCategory; details: string; screenshotBase64?: string }) =>
  json<{ id: number }>("/api/feedback", { method: "POST", body: JSON.stringify(body) });
export const submitActiveTime = (seconds:number) => json<{saved:boolean;studyDate:string;acceptedSeconds:number}>("/api/me/active-time",{method:"POST",body:JSON.stringify({seconds})});
