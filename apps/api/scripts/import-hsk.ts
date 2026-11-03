import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(here, "../data/source");
const outFile = path.resolve(here, "../data/hsk-words.json");
const expected = new Map([[1, 300], [2, 200], [3, 500], [4, 1000], [5, 1600], [6, 1800]]);

async function main() {
  mkdirSync(sourceDir, { recursive: true });
  const all: Array<Record<string, unknown>> = [];
  for (const [level, count] of expected) {
    const file = path.join(sourceDir, `hsk-3.0-words-${level}.json`);
    if (!existsSync(file)) throw new Error(`Missing ${file}. Download the JSON linked from https://gushichinese.com/hsk-3.0/downloads`);
    const source = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8")) as {
      level?: number; count?: number; license?: string; data?: Array<Record<string, unknown>>;
    };
    if (source.level !== level || source.count !== count || source.data?.length !== count) {
      throw new Error(`HSK ${level} count/metadata mismatch: expected ${count}, got ${source.data?.length ?? "none"}`);
    }
    if (!source.license?.includes("CC BY-SA 4.0")) throw new Error(`HSK ${level} source has no expected CC BY-SA 4.0 metadata`);
    all.push(...source.data.map((row, i) => ({
      id: `hsk3-2025-${level}-${i + 1}`,
      source: "gushi-hsk-3.0-2025-11",
      level,
      hanzi: String(row.hanzi ?? ""),
      pinyin: String(row.pinyin ?? ""),
      tones: String(row.tones ?? ""),
      meaningEn: String(row.meaning ?? ""),
      meaningVi: "",
      hanViet: "",
      partOfSpeech: "",
      exampleChinese: String(row.exampleChinese ?? ""),
      examplePinyin: String(row.examplePinyin ?? ""),
      exampleEnglish: String(row.exampleEnglish ?? ""),
      exampleVietnamese: "",
      sourceAttribution: String(source.attribution ?? "HSK 3.0 word list by Gushi, CC BY-SA 4.0"),
      translationStatus: "english-reviewed-vietnamese-missing"
    })));
  }
  if (all.length !== 5400) throw new Error(`Expected 5,400 rows; got ${all.length}`);
  writeFileSync(outFile, JSON.stringify({ datasetId: "hsk3.0-2025-11", count: all.length, data: all }, null, 2), "utf8");
  console.log(`Wrote ${all.length} HSK 1–6 entries to ${outFile}`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
