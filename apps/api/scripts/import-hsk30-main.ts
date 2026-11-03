import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { WordRecord } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../data");
const sourceDir = path.join(dataDir, "hsk30-main-source");
const catalogPath = path.join(dataDir, "hsk-words.json");
const hanPattern = /\p{Script=Han}/u;

function readSource(relativePath: string): string {
  return readFileSync(path.join(sourceDir, relativePath), "utf8").replace(/^\uFEFF/, "");
}

function parseJsonLiteral(source: string, start: number, end: number): unknown {
  return JSON.parse(source.slice(start, end).replace(/,\s*([}\]])/g, "$1"));
}

function assignmentLiteral(source: string, variable: string, open: "[" | "{"): unknown {
  const marker = new RegExp(`${variable}\\s*=\\s*\\${open}`).exec(source);
  if (!marker) throw new Error(`Could not locate ${variable} data`);
  const start = marker.index + marker[0].lastIndexOf(open);
  const close = open === "[" ? "]" : "}";
  let depth = 0; let quoted = false; let escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === open) depth++;
    else if (char === close && --depth === 0) return parseJsonLiteral(source, start, i + 1);
  }
  throw new Error(`Unclosed ${variable} data`);
}

function arrayInCall(source: string, callName: string): unknown[] {
  const call = source.indexOf(`${callName}(`);
  if (call < 0) throw new Error(`Could not locate ${callName}`);
  const start = source.indexOf("[", call);
  let depth = 0; let quoted = false; let escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return parseJsonLiteral(source, start, i + 1) as unknown[];
  }
  throw new Error(`Unclosed array in ${callName}`);
}

function templateBlocks(source: string, functionName: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`${functionName}\\.push\\(\\s*\x60([\\s\\S]*?)\x60\\s*\\)`, "g");
  for (const match of source.matchAll(pattern)) blocks.push(match[1]);
  return blocks;
}

function contentRow(line: string): string[] {
  return line.split("|").map(value => value.trim());
}

function stableId(level: number, surface: string, tag: string): string {
  const digest = createHash("sha256").update(`${tag}|${level}|${surface}`).digest("hex").slice(0, 12);
  return `hsk30-main-${level}-${digest}`;
}

function makeRecord(surface: string, pinyin: string, pos: string, level: number): WordRecord {
  return {
    id: stableId(level, surface, "simplified"), source: "hsk30-main-user-supplied-2025", level,
    hanzi: surface, pinyin, tones: "", meaningEn: "", meaningVi: "", hanViet: "", partOfSpeech: pos,
    exampleChinese: "", examplePinyin: "", exampleEnglish: "", exampleVietnamese: "",
    sourceAttribution: "User-supplied hsk30-main 2025 dataset; English fallback is attributed to CC-CEDICT; see source notes.",
    translationStatus: ""
  };
}

function main() {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as { data: WordRecord[]; [key: string]: unknown };
  const baseRows = assignmentLiteral(readSource("hsk-base.js"), "window.HSK_BASE", "[") as unknown[][];
  const level79Source = readSource("hsk79.js");
  const advancedRows = arrayInCall(level79Source, "concat") as unknown[][];
  const english = assignmentLiteral(readSource("nghia-en.js"), "window.HSK_EN", "{") as Record<string, string>;

  const vietnamese: Record<string, string> = {};
  for (const name of ["nghia-vi/hsk3.js", "nghia-vi/hsk4.js", "nghia-vi/hsk5.js", "nghia-vi/hsk5b.js", "nghia-vi/hsk6.js", "nghia-vi/hsk6b.js"]) {
    for (const block of templateBlocks(readSource(name), "HSK_VI")) {
      for (const line of block.split(/\r?\n/)) {
        const separator = line.indexOf("|"); if (separator < 1) continue;
        vietnamese[line.slice(0, separator).trim()] ||= line.slice(separator + 1).trim();
      }
    }
  }

  const examples = new Map<string, { zh: string[]; pinyin: string[]; vi: string[] }>();
  const contentFiles = readdirSync(path.join(sourceDir, "noidung"))
    .filter(name => /^hsk[1-6].*\.js$/i.test(name)).map(name => `noidung/${name}`);
  for (const name of new Set(contentFiles)) {
    let source: string;
    try { source = readSource(name); } catch { continue; }
    for (const block of templateBlocks(source, "HSK_CONTENT")) {
      for (const line of block.split(/\r?\n/)) {
        const cells = contentRow(line); const surface = cells[0];
        if (!surface || !hanPattern.test(surface) || cells.length < 8) continue;
        const record = examples.get(surface) ?? { zh: [], pinyin: [], vi: [] };
        for (const [bucket, value] of [[record.zh, cells[2]], [record.pinyin, cells[3]], [record.vi, cells[4]], [record.zh, cells[5]], [record.pinyin, cells[6]], [record.vi, cells[7]]] as Array<[string[], string]>) {
          if (value && !bucket.includes(value)) bucket.push(value);
        }
        examples.set(surface, { zh: record.zh.slice(0, 2), pinyin: record.pinyin.slice(0, 2), vi: record.vi.slice(0, 2) });
      }
    }
  }

  const rowsBySurface = new Map<string, WordRecord[]>();
  for (const word of catalog.data) rowsBySurface.set(word.hanzi, [...(rowsBySurface.get(word.hanzi) ?? []), word]);
  let added = 0; let enrichedVi = 0; let enrichedEn = 0; let enrichedExamples = 0;
  const ingest = (raw: unknown[], fixedLevel?: number) => {
    const surface = String(raw[0] ?? "").trim(); const pinyin = String(raw[1] ?? "").trim();
    const pos = String(raw[2] ?? "").trim(); const level = fixedLevel ?? Number(raw[3]);
    if (!surface || !hanPattern.test(surface) || !Number.isFinite(level)) return;
    let matches = rowsBySurface.get(surface);
    if (!matches?.length) {
      const created = makeRecord(surface, pinyin, pos, level);
      catalog.data.push(created); rowsBySurface.set(surface, [created]); matches = [created]; added++;
    }
    const word = matches.find(row => row.source.startsWith("gushi-")) ?? matches.find(row => row.source.startsWith("hsk30-main")) ?? matches[0];
    if (word.source.startsWith("hsk30-main")) word.level = level;
    const entry = examples.get(surface);
    const hasSourceMaterial = Boolean(pinyin || pos || vietnamese[surface] || english[surface] || entry?.zh.length || entry?.vi.length || entry?.pinyin.length);
    if (hasSourceMaterial && !word.sourceAttribution.includes("hsk30-main")) {
      word.sourceAttribution = `${word.sourceAttribution}; checked against user-supplied hsk30-main 2025 (see source notes)`;
    }
    let enrichedFromAttachment = false;
    if (!word.pinyin && pinyin) { word.pinyin = pinyin; enrichedFromAttachment = true; }
    if (!word.partOfSpeech && pos) { word.partOfSpeech = pos; enrichedFromAttachment = true; }
    if (!word.meaningVi && vietnamese[surface]) { word.meaningVi = vietnamese[surface]; enrichedVi++; enrichedFromAttachment = true; }
    if (!word.meaningEn && english[surface]) { word.meaningEn = english[surface]; enrichedEn++; enrichedFromAttachment = true; }
    if (entry && !word.exampleChinese && entry.zh.length) { word.exampleChinese = entry.zh.join(" · "); enrichedExamples++; enrichedFromAttachment = true; }
    if (entry && !word.exampleVietnamese && entry.vi.length) { word.exampleVietnamese = entry.vi.join(" · "); enrichedFromAttachment = true; }
    if (entry && !word.examplePinyin && entry.pinyin.length) { word.examplePinyin = entry.pinyin.join(" · "); enrichedFromAttachment = true; }
    if (enrichedFromAttachment && !word.sourceAttribution.includes("hsk30-main")) {
      word.sourceAttribution = `${word.sourceAttribution}; additional fields from user-supplied hsk30-main 2025 (see source notes)`;
    }
  };

  for (const row of baseRows) ingest(row);
  for (const row of advancedRows) ingest(row, 7);

  for (const block of templateBlocks(readSource("bo-sung.js"), "HSK_EXTRA")) {
    for (const line of block.split(/\r?\n/)) {
      const cells = contentRow(line); const surface = cells[0];
      if (!surface || !hanPattern.test(surface)) continue;
      const rawLevel = cells[2]; const level = rawLevel.includes("7") ? 7 : Number(rawLevel) || 0;
      ingest([surface, cells[1] ?? "", "", level], level);
      const target = rowsBySurface.get(surface)?.[0]; if (!target) continue;
      let addedSupplement = false;
      if (!target.meaningVi && cells[4]) { target.meaningVi = cells[4]; addedSupplement = true; }
      const zh = [cells[5], cells[8]].filter(Boolean); const vi = [cells[7], cells[10]].filter(Boolean);
      if (!target.exampleChinese && zh.length) { target.exampleChinese = zh.join(" · "); addedSupplement = true; }
      if (!target.exampleVietnamese && vi.length) { target.exampleVietnamese = vi.join(" · "); addedSupplement = true; }
      if (!target.exampleChinese && cells[11]) { target.exampleChinese = cells[11]; addedSupplement = true; }
      if (!target.exampleVietnamese && cells[12]) { target.exampleVietnamese = cells[12]; addedSupplement = true; }
      if (!target.meaningEn && english[surface]) target.meaningEn = english[surface];
      if (addedSupplement && !target.sourceAttribution.includes("hsk30-main")) target.sourceAttribution += "; additional fields from user-supplied hsk30-main 2025 (see source notes)";
    }
  }

  catalog.datasetId = "hsk3.0-2025-user-supplied-hsk30-main-plus-existing-sources";
  catalog.count = catalog.data.length;
  const existingDatasets = Array.isArray(catalog.datasets) ? catalog.datasets as string[] : [];
  catalog.datasets = [...new Set([...existingDatasets, "User-supplied hsk30-main 2025: HSK 1–6 and pooled level 7–9; English fallback CC-CEDICT"])];
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8");
  console.log(`Added ${added} new surfaces; filled ${enrichedVi} Vietnamese glosses, ${enrichedEn} English glosses, ${enrichedExamples} example sets.`);
  console.log(`Vocabulary catalog now has ${catalog.data.length} records. Levels 7–9 remain pooled in the source and are stored as level 7.`);
}

main();
