import type { AnalyzedToken, TranslationResult, WordRecord } from "./types";

function appClientId(): string {
  const key = "hoc-tieng-trung-client-id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch { return "local-browser"; }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", "X-App-Client": appClientId(), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || body.error || `HTTP ${response.status}`), { status: response.status, code: body.error });
  return body as T;
}

export const analyze = (text: string) => json<{ tokens: AnalyzedToken[] }>("/api/analyze", { method: "POST", body: JSON.stringify({ text }) });
export const translate = (text: string, targetLanguage: "vi" | "en", tokens: AnalyzedToken[]) =>
  json<TranslationResult>("/api/translate", { method: "POST", body: JSON.stringify({ text, targetLanguage, consentToSend: true, tokens: tokens.filter(t => t.isChinese).map(t => ({ surface: t.surface, pinyin: t.pinyin })) }) });
export const saveWord = async (wordId: string): Promise<{ saved: boolean }> => {
  const key = "hoc-tieng-trung-saved-words";
  const saved = JSON.parse(localStorage.getItem(key) || "[]") as string[];
  if (!saved.includes(wordId)) localStorage.setItem(key, JSON.stringify([...saved, wordId]));
  return { saved: true };
};
export const findWord = (surface: string) => json<{ word: WordRecord }>(`/api/words/${encodeURIComponent(surface)}`);
export const getWritingCharacters = (level: 1 | 2) => json<{ level: number; characters: string[] }>(`/api/writing-characters?level=${level}`);
export const reportError = (body: { wordId?: string; surface: string; field: string; suggested?: string; note?: string }) =>
  json<{ id: number }>("/api/reports", { method: "POST", body: JSON.stringify(body) });
