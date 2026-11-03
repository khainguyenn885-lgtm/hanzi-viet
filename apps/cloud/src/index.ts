import { z } from "zod";
import { segmentChineseText } from "../../api/src/segment.js";
import type { WordRecord } from "../../api/src/types.js";

interface D1Result<T> { results: T[]; success?: boolean; }
interface D1Statement { bind(...values: unknown[]): D1Statement; all<T>(): Promise<D1Result<T>>; first<T>(): Promise<T | null>; run<T>(): Promise<T>; }
interface D1Database { prepare(sql: string): D1Statement; batch<T>(statements: D1Statement[]): Promise<Array<D1Result<T>>>; }
interface RateLimitBinding { limit(input: { key: string }): Promise<{ success: boolean }>; }
interface AssetBinding { fetch(request: Request | string): Promise<Response>; }
interface Env {
  DB: D1Database;
  ASSETS: AssetBinding;
  FEEDBACK_LIMIT?: RateLimitBinding;
}

const recordColumns = `id, source, level, hanzi, pinyin, tones, meaning_en AS meaningEn,
  meaning_vi AS meaningVi, han_viet AS hanViet, pos AS partOfSpeech, example_zh AS exampleChinese,
  example_pinyin AS examplePinyin, example_en AS exampleEnglish, example_vi AS exampleVietnamese,
  attribution AS sourceAttribution, translation_status AS translationStatus`;
let cachedDictionary: string[] | undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

function normalizePinyin(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[1-5\s'’]/g, "").toLowerCase();
}

function normalizeLookup(value: string): string {
  return value.toLowerCase().replace(/[đĐ]/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\p{Script=Han}]+/gu, " ").trim().replace(/\s+/g, " ");
}

async function parseBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 750 * 1024) throw new Error("BODY_TOO_LARGE");
  return request.json();
}

async function withinRateLimit(binding: RateLimitBinding | undefined, request: Request, route: string): Promise<boolean> {
  if (!binding) return true;
  const clientHint = request.headers.get("x-app-client") || "";
  const client = /^[\da-f-]{16,64}$/i.test(clientHint) ? clientHint : request.headers.get("cf-connecting-ip") || "local";
  return (await binding.limit({ key: `${client}:${route}` })).success;
}

async function vocabularyDictionary(assets: AssetBinding, request: Request): Promise<string[]> {
  if (!cachedDictionary) {
    const asset = await assets.fetch(new URL("/data/dictionary-surfaces.json", request.url).toString());
    if (!asset.ok) throw new Error("DICTIONARY_ASSET_MISSING");
    cachedDictionary = await asset.json() as string[];
  }
  return cachedDictionary;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname;

  if (route === "/api/health" && request.method === "GET") return json({ ok: true, stage: "1A+1B", hosting: "cloudflare-workers" });

  if (route === "/api/analyze" && request.method === "POST") {
    let body: unknown;
    try { body = await parseBody(request); } catch { return json({ error: "INVALID_JSON" }, 400); }
    const parsed = z.object({ text: z.string().trim().min(1).max(4000) }).safeParse(body);
    if (!parsed.success) return json({ error: "INVALID_TEXT" }, 400);
    const dictionary = await vocabularyDictionary(env.ASSETS, request);
    const tokens = segmentChineseText(parsed.data.text, dictionary);
    const statements = tokens.filter(token => token.isChinese).map(token => env.DB.prepare(`SELECT ${recordColumns} FROM vocabulary WHERE hanzi = ? ORDER BY CASE WHEN source LIKE 'gushi-%' THEN 0 ELSE 1 END, level LIMIT 100`).bind(token.surface));
    const queryResults = statements.length ? await env.DB.batch<WordRecord>(statements) : [];
    let queryIndex = 0;
    const hydrated = tokens.map(token => {
      if (!token.isChinese) return token;
      const matches = queryResults[queryIndex++].results;
      const readings = new Set(matches.map(word => word.pinyin));
      const exact = matches[0];
      return { ...token, pinyin: exact?.pinyin || "", needsReview: matches.length === 0 || readings.size > 1, word: exact ?? null, matches };
    });
    return json({ tokens: hydrated });
  }

  if (route === "/api/words" && request.method === "GET") {
    const term = (url.searchParams.get("term") || "").trim();
    if (!term) {
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM vocabulary").first<{ n: number }>();
      return json({ words: [], total: row?.n ?? 0 });
    }
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 50);
    const level = Number(url.searchParams.get("level") || 0);
    const normalized = normalizeLookup(term);
    const prefix = `${normalized}%`;
    const pinyinPrefix = `${normalizePinyin(term)}%`;
    const byPrefix = await env.DB.prepare(`SELECT ${recordColumns} FROM vocabulary
      WHERE (hanzi LIKE ? OR pinyin_search LIKE ? OR vi_search LIKE ? OR en_search LIKE ? OR hv_search LIKE ?)
      AND (? = 0 OR level = ?) ORDER BY level, hanzi LIMIT ?`).bind(`${term}%`, pinyinPrefix, prefix, prefix, prefix, level, level, limit).all<WordRecord>();
    const words = [...byPrefix.results];
    if (words.length < limit) {
      const contains = await env.DB.prepare(`SELECT ${recordColumns} FROM vocabulary
        WHERE (instr(hanzi, ?) > 0 OR instr(pinyin_search, ?) > 0 OR instr(vi_search, ?) > 0 OR instr(en_search, ?) > 0 OR instr(hv_search, ?) > 0)
        AND (? = 0 OR level = ?) ORDER BY level, hanzi LIMIT ?`).bind(term, normalizePinyin(term), normalized, normalized, normalized, level, level, limit).all<WordRecord>();
      const seen = new Set(words.map(word => word.id));
      for (const word of contains.results) if (!seen.has(word.id) && words.length < limit) { words.push(word); seen.add(word.id); }
    }
    return json({ words, total: words.length });
  }

  if (route.startsWith("/api/words/") && request.method === "GET") {
    const id = decodeURIComponent(route.slice("/api/words/".length));
    const word = await env.DB.prepare(`SELECT ${recordColumns} FROM vocabulary WHERE id = ? OR hanzi = ? ORDER BY CASE WHEN source LIKE 'gushi-%' THEN 0 ELSE 1 END, level LIMIT 1`).bind(id, id).first<WordRecord>();
    return word ? json({ word }) : json({ error: "WORD_NOT_FOUND" }, 404);
  }

  if (route === "/api/writing-characters" && request.method === "GET") {
    const level = Number(url.searchParams.get("level") || 1);
    if (level !== 1 && level !== 2) return json({ error: "INVALID_LEVEL" }, 400);
    const rows = await env.DB.prepare("SELECT DISTINCT hanzi FROM vocabulary WHERE level = ? ORDER BY hanzi").bind(level).all<{ hanzi: string }>();
    const characters = [...new Set(rows.results.flatMap(row => [...row.hanzi]).filter(char => /\p{Script=Han}/u.test(char) && char !== "〇"))];
    return json({ level, characters });
  }

  if (route.startsWith("/api/strokes/") && request.method === "GET") {
    const character = decodeURIComponent(route.slice("/api/strokes/".length));
    if ([...character].length !== 1 || !/\p{Script=Han}/u.test(character)) return json({ error: "INVALID_CHARACTER" }, 400);
    const asset = await env.ASSETS.fetch(new URL(`/data/strokes/${encodeURIComponent(character)}.json`, request.url).toString());
    return asset.ok ? new Response(asset.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" } }) : json({ error: "STROKE_DATA_UNAVAILABLE" }, 404);
  }

  if (route === "/api/feedback" && request.method === "POST") {
    if (!(await withinRateLimit(env.FEEDBACK_LIMIT, request, route))) return json({ error: "RATE_LIMITED" }, 429);
    let body: unknown;
    try { body = await parseBody(request); } catch { return json({ error: "INVALID_JSON" }, 400); }
    const parsed = z.object({
      category: z.enum(["vocabulary", "feature", "experience", "other"]),
      details: z.string().trim().min(5).max(3000),
      screenshotBase64: z.string().max(650_000).regex(/^data:image\/(png|jpeg|webp);base64,/).optional()
    }).safeParse(body);
    if (!parsed.success) return json({ error: "INVALID_FEEDBACK" }, 400);
    await env.DB.prepare("INSERT INTO feedbacks(category,details,screenshot_base64) VALUES(?,?,?)")
      .bind(parsed.data.category, parsed.data.details, parsed.data.screenshotBase64 ?? null).run();
    return json({ id: crypto.randomUUID() }, 201);
  }

  return json({ error: "NOT_FOUND" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    return handleApi(request, env);
  }
};
