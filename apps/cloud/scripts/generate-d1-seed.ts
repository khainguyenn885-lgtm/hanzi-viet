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
const columns = ["id", "source", "level", "hanzi", "pinyin", "tones", "meaning_en", "meaning_vi", "han_viet", "pos", "example_zh", "example_pinyin", "example_en", "example_vi", "attribution", "translation_status"];
const fields: Array<keyof WordRecord> = ["id", "source", "level", "hanzi", "pinyin", "tones", "meaningEn", "meaningVi", "hanViet", "partOfSpeech", "exampleChinese", "examplePinyin", "exampleEnglish", "exampleVietnamese", "sourceAttribution", "translationStatus"];
const quote = (value: string | number | null | undefined) => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const statements: string[] = [];
const chunkSize = 40;
for (let i = 0; i < catalog.data.length; i += chunkSize) {
  const values = catalog.data.slice(i, i + chunkSize).map(word => `(${fields.map(field => quote(word[field] as string | number)).join(",")})`);
  statements.push(`INSERT OR IGNORE INTO vocabulary(${columns.join(",")}) VALUES\n${values.join(",\n")};`);
}
writeFileSync(outputPath, statements.join("\n\n"), "utf8");
const surfaces = [...new Set(catalog.data.map(word => word.hanzi))];
writeFileSync(surfacesPath, JSON.stringify(surfaces), "utf8");
console.log(`Wrote ${catalog.data.length} vocabulary entries to ${outputPath} (${statements.length} statements).`);
console.log(`Wrote ${surfaces.length} dictionary surfaces for Worker segmentation to ${surfacesPath}.`);
