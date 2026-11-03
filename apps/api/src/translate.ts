import type { AiTokenGloss, TargetLanguage, TokenInput, TranslationResult } from "./types.js";

const cleanBase = (value: string) => value.replace(/\/+$/, "");

export interface LlmConfig {
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_BASE_URL?: string;
}

export async function translateSentence(text: string, targetLanguage: TargetLanguage, tokens: TokenInput[], config: LlmConfig = process.env): Promise<TranslationResult> {
  const key = config.LLM_API_KEY;
  const model = config.LLM_MODEL;
  const base = cleanBase(config.LLM_BASE_URL || "https://api.openai.com/v1");
  if (!key || !model) throw new Error("AI_ENDPOINT_NOT_CONFIGURED");

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["translation", "tokens"],
    properties: {
      translation: { type: "string" },
      tokens: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["surface", "meaningVi", "meaningEn"],
        properties: { surface: { type: "string" }, meaningVi: { type: ["string", "null"] }, meaningEn: { type: ["string", "null"] } }
      } }
    }
  };
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_schema", json_schema: { name: "chinese_translation", strict: true, schema } },
      messages: [
        { role: "system", content: `Translate Chinese text into ${targetLanguage === "vi" ? "Vietnamese" : "English"}. Return the complete sentence translation and concise, context-specific glosses for each supplied token in BOTH Vietnamese and English. Do not invent Pinyin, Han-Viet readings, or parts of speech. If a gloss is genuinely unclear, return null. Preserve punctuation and meaning; do not add commentary.` },
        { role: "user", content: JSON.stringify({ text, tokens }) }
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`LLM_HTTP_${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM_EMPTY_RESPONSE");
  const parsed = JSON.parse(content) as { translation?: unknown; tokens?: unknown };
  if (typeof parsed.translation !== "string" || !Array.isArray(parsed.tokens)) throw new Error("LLM_INVALID_RESPONSE");
  const glosses: AiTokenGloss[] = parsed.tokens.map((item: any) => ({
    surface: String(item.surface ?? ""),
    meaningVi: typeof item.meaningVi === "string" ? item.meaningVi : null,
    meaningEn: typeof item.meaningEn === "string" ? item.meaningEn : null
  })).filter(item => tokens.some(token => token.surface === item.surface));
  return { translation: parsed.translation, targetLanguage, tokens: glosses, label: "machine-translation" };
}
