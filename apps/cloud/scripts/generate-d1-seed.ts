import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WordRecord } from "../../api/src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.resolve(here, "../../api/data/hsk-words.json");
const outputPath = path.resolve(here, "../seeds/vocabulary.generated.sql");
const surfacesPath = path.resolve(here, "../../web/public/data/dictionary-surfaces.json");
mkdirSync(path.dirname(outputPath), { recursive: true });
mkdirSync(path.dirname(surfacesPath), { recursive: true });
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as { data: WordRecord[] };
const columns = ["id", "source", "level", "hanzi", "pinyin", "pinyin_search", "tones", "meaning_en", "meaning_vi", "han_viet", "vi_search", "en_search", "hv_search", "pos", "example_zh", "example_pinyin", "example_en", "example_vi", "attribution", "translation_status"];
const fields: Array<keyof WordRecord | "pinyinSearch" | "viSearch" | "enSearch" | "hvSearch"> = ["id", "source", "level", "hanzi", "pinyin", "pinyinSearch", "tones", "meaningEn", "meaningVi", "hanViet", "viSearch", "enSearch", "hvSearch", "partOfSpeech", "exampleChinese", "examplePinyin", "exampleEnglish", "exampleVietnamese", "sourceAttribution", "translationStatus"];
const normalizePinyin = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[1-5\s'’]/g, "").toLowerCase();
const normalizeLookup = (value: string) => value.toLowerCase().replace(/[đĐ]/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\p{Script=Han}]+/gu, " ").trim().replace(/\s+/g, " ");
const quote = (value: string | number | null | undefined) => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const statements: string[] = [];
const chunkSize = 40;
for (let i = 0; i < catalog.data.length; i += chunkSize) {
  const values = catalog.data.slice(i, i + chunkSize).map(word => `(${fields.map(field => {
    const normalized = field === "pinyinSearch" ? normalizePinyin(word.pinyin)
      : field === "viSearch" ? normalizeLookup(word.meaningVi)
      : field === "enSearch" ? normalizeLookup(word.meaningEn)
      : field === "hvSearch" ? normalizeLookup(word.hanViet)
      : word[field] as string | number;
    return quote(normalized);
  }).join(",")})`);
  statements.push(`INSERT OR IGNORE INTO vocabulary(${columns.join(",")}) VALUES\n${values.join(",\n")};`);
}
writeFileSync(outputPath, statements.join("\n\n"), "utf8");
const surfaces = [...new Set(catalog.data.map(word => word.hanzi))];
writeFileSync(surfacesPath, JSON.stringify(surfaces), "utf8");
console.log(`Wrote ${catalog.data.length} vocabulary entries to ${outputPath} (${statements.length} statements).`);
console.log(`Wrote ${surfaces.length} dictionary surfaces for Worker segmentation to ${surfacesPath}.`);
