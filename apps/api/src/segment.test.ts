import { describe, expect, it } from "vitest";
import { segmentChineseText } from "./segment.js";

describe("Chinese text segmentation", () => {
  it("keeps Chinese tokens with tone-marked Pinyin and punctuation", () => {
    const tokens = segmentChineseText("你好，中国！");
    expect(tokens.map(token => token.surface).join("")).toBe("你好，中国！");
    expect(tokens.some(token => token.isChinese && /[ǎōǐǔǖáéíóú]/u.test(token.pinyin))).toBe(true);
    expect(tokens.at(-1)?.isChinese).toBe(false);
  });

  it("returns no tokens for blank input", () => {
    expect(segmentChineseText("   ")).toEqual([]);
  });

  it("merges a newly imported multi-character dictionary word", () => {
    const tokens = segmentChineseText("我学阿拉伯语。", ["我", "学", "阿拉伯语"]);
    expect(tokens.map(token => token.surface)).toEqual(["我", "学", "阿拉伯语", "。"]);
  });
});
