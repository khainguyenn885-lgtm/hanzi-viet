import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { WordRecord } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../data");
const sourceFile = path.join(dataDir, "hsk30-master-expanded.csv");
const catalogFile = path.join(dataDir, "hsk-words.json");

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

const hanPattern = /^\p{Script=Han}+$/u;
const stableId = (id: string, surface: string, kind: string) => {
  const suffix = createHash("sha256").update(`${id}|${surface}|${kind}`).digest("hex").slice(0, 10);
  return `hsk30-${id.replace(/[^A-Za-z0-9-]/g, "-")}-${kind}-${suffix}`;
};

function makeWord(row: Record<string, string>, surface: string, kind: "simplified" | "traditional"): WordRecord {
  const parsedLevel = Number.parseInt(row.Level, 10);
  return {
    id: stableId(row.ID, surface, kind), source: "hsk30-master-2023-user-supplied",
    level: Number.isFinite(parsedLevel) ? parsedLevel : 7, hanzi: surface,
    pinyin: row.Pinyin || "", tones: "", meaningEn: "", meaningVi: "", hanViet: "",
    partOfSpeech: row.POS || "", exampleChinese: "", examplePinyin: "", exampleEnglish: "",
    exampleVietnamese: "", sourceAttribution: "HSK 3.0 vocabulary compilation (2023), user-supplied hsk30-master; see bundled source README and LICENSE",
    translationStatus: "meaning-and-example-missing"
  };
}

function main() {
  if (!existsSync(sourceFile) || !existsSync(catalogFile)) throw new Error("Expected bundled hsk30-master-expanded.csv and hsk-words.json in apps/api/data.");
  const rows = parseCsv(readFileSync(sourceFile, "utf8"));
  const header = rows.shift()?.map(value => value.replace(/^\uFEFF/, "")) ?? [];
  const sourceRows = rows.filter(row => row.length && row[header.indexOf("Simplified")]);
  const base = JSON.parse(readFileSync(catalogFile, "utf8")) as { data: WordRecord[]; [key: string]: unknown };
  const bySurface = new Map(base.data.map((word, index) => [word.hanzi, index]));
  const addedIds = new Set(base.data.map(word => word.id));
  const added = new Set<string>();
  const enriched = new Set<string>();
  for (const values of sourceRows) {
    const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])) as Record<string, string>;
    const simplified = row.Simplified.trim();
    if (row.Example.trim() || !hanPattern.test(simplified)) continue;
    const existingIndex = bySurface.get(simplified);
    if (existingIndex !== undefined) {
      const existing = base.data[existingIndex];
      if (!existing.pinyin && row.Pinyin) { existing.pinyin = row.Pinyin; enriched.add(simplified); }
      if (!existing.partOfSpeech && row.POS) { existing.partOfSpeech = row.POS; enriched.add(simplified); }
    } else if (!added.has(simplified)) {
      const word = makeWord(row, simplified, "simplified");
      if (!addedIds.has(word.id)) { base.data.push(word); addedIds.add(word.id); bySurface.set(simplified, base.data.length - 1); added.add(simplified); }
    }

    const traditionalForms = [...new Set(row.Traditional.split("|").map(value => value.trim()).filter(value => hanPattern.test(value)))];
    for (const traditional of traditionalForms) {
      if (traditional === simplified || bySurface.has(traditional) || added.has(traditional)) continue;
      const alias = makeWord(row, traditional, "traditional");
      if (!addedIds.has(alias.id)) { base.data.push(alias); addedIds.add(alias.id); bySurface.set(traditional, base.data.length - 1); added.add(traditional); }
    }
  }

  base.datasetId = "hsk3.0-2025-11+user-hsk30-master-2023";
  base.count = base.data.length;
  base.datasets = ["Gushi HSK 3.0 2025, levels 1–6 (CC BY-SA 4.0)", "User-supplied hsk30-master 2023, levels 1–6 and pooled 7–9"];
  writeFileSync(catalogFile, JSON.stringify(base, null, 2), "utf8");
  console.log(`Merged ${added.size} new dictionary surfaces from ${sourceRows.length} CSV rows; enriched ${enriched.size} existing words; catalog now has ${base.data.length} records.`);
  console.log("Traditional forms are added as searchable surface aliases. English/Vietnamese definitions and examples stay blank when absent from the source.");
}

main();
