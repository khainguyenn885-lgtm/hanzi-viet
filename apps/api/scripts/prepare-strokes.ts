import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataDir = path.join(root, "data");
const webStrokeDir = path.resolve(root, "../web/public/data/strokes");
const sourceDir = path.join(root, "node_modules", "hanzi-writer-data");
const catalogPath = path.join(dataDir, "hsk-words.json");
if (!existsSync(catalogPath)) throw new Error("Run `pnpm import:hsk` first.");
if (!existsSync(sourceDir)) throw new Error("hanzi-writer-data package is missing.");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as { data: Array<{ level: number; hanzi: string }> };
const characters = new Set(catalog.data.filter(word => word.level <= 2).flatMap(word => [...word.hanzi]).filter(char => /\p{Script=Han}/u.test(char) && char !== "〇"));
const outputDir = path.join(dataDir, "strokes");
mkdirSync(outputDir, { recursive: true });
mkdirSync(webStrokeDir, { recursive: true });
const available = new Set(readdirSync(sourceDir).filter(file => file.endsWith(".json")).map(file => path.basename(file, ".json")));
let copied = 0;
const missing: string[] = [];
for (const char of characters) {
  if (!available.has(char)) { missing.push(char); continue; }
  cpSync(path.join(sourceDir, `${char}.json`), path.join(outputDir, `${char}.json`)); copied++;
  cpSync(path.join(sourceDir, `${char}.json`), path.join(webStrokeDir, `${char}.json`));
}
const license = [path.resolve(sourceDir, "ARPHICPL.TXT"), path.resolve(sourceDir, "LICENSE")].find(existsSync);
if (license) writeFileSync(path.join(outputDir, "ARPHICPL.TXT"), readFileSync(license));
else throw new Error("Stroke data license file was not found in hanzi-writer-data.");
if (license) writeFileSync(path.join(webStrokeDir, "ARPHICPL.TXT"), readFileSync(license));
console.log(`Prepared ${copied}/${characters.size} unique HSK 1–2 vocabulary characters.`);
if (missing.length) console.warn(`No stroke data for ${missing.length}: ${missing.join("")}`);
