import { segment } from "pinyin-pro";

export interface SegmentedToken { surface: string; pinyin: string; isChinese: boolean; needsReview: boolean; }

export function segmentChineseText(text: string, dictionary: readonly string[] = []): SegmentedToken[] {
  if (!text.trim()) return [];
  const tokens = segment(text).map(({ origin, result }) => {
    const isChinese = /\p{Script=Han}/u.test(origin);
    return { surface: origin, pinyin: isChinese ? result : "", isChinese, needsReview: isChinese };
  });
  if (!dictionary.length) return tokens;

  const knownWords = new Set(dictionary);
  const maxWordLength = Math.max(1, ...dictionary.map(word => [...word].length));
  const merged: SegmentedToken[] = [];
  for (let i = 0; i < tokens.length;) {
    const first = tokens[i];
    if (!first.isChinese) { merged.push(first); i++; continue; }
    let combined = "";
    let bestSurface = "";
    let bestEnd = i;
    for (let j = i; j < tokens.length; j++) {
      if (!tokens[j].isChinese || [...combined].length + [...tokens[j].surface].length > maxWordLength) break;
      combined += tokens[j].surface;
      if (knownWords.has(combined)) { bestSurface = combined; bestEnd = j + 1; }
    }
    if (bestSurface) {
      merged.push({ surface: bestSurface, pinyin: "", isChinese: true, needsReview: true });
      i = bestEnd;
    } else { merged.push(first); i++; }
  }
  return merged;
}
