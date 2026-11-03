import { segment } from "pinyin-pro";

export interface SegmentedToken { surface: string; pinyin: string; isChinese: boolean; needsReview: boolean; }

export function segmentChineseText(text: string, dictionary: readonly string[] = []): SegmentedToken[] {
  if (!text.trim()) return [];
  if (dictionary.length) return forwardMaximumMatch(text, dictionary);
  return segment(text).map(({ origin, result }) => {
    const isChinese = /\p{Script=Han}/u.test(origin);
    return { surface: origin, pinyin: isChinese ? result : "", isChinese, needsReview: isChinese };
  });
}

function forwardMaximumMatch(text: string, dictionary: readonly string[]): SegmentedToken[] {
  const knownWords = new Set(dictionary);
  const maxWordLength = Math.max(1, ...dictionary.map(word => [...word].length));
  const chars = [...text];
  const merged: SegmentedToken[] = [];
  for (let i = 0; i < chars.length;) {
    if (!/\p{Script=Han}/u.test(chars[i])) {
      let surface = chars[i++];
      while (i < chars.length && !/\p{Script=Han}/u.test(chars[i])) surface += chars[i++];
      merged.push({ surface, pinyin: "", isChinese: false, needsReview: false });
      continue;
    }
    let best = "";
    const end = Math.min(chars.length, i + maxWordLength);
    for (let j = end; j > i; j--) {
      const candidate = chars.slice(i, j).join("");
      if ([...candidate].every(char => /\p{Script=Han}/u.test(char)) && knownWords.has(candidate)) { best = candidate; break; }
    }
    const surface = best || chars[i];
    merged.push({ surface, pinyin: "", isChinese: true, needsReview: true });
    i += [...surface].length;
  }
  return merged;
}
