import { describe, expect, it } from "vitest";
import { getWritingFeedback, practiceOptions } from "./stroke-practice";

describe("writing practice decisions", () => {
  it("offers a gentle hint after repeated mistakes", () => {
    expect(getWritingFeedback(2)).toBe("encourage");
    expect(getWritingFeedback(3)).toBe("hint");
  });
  it("uses three distinct guided modes", () => {
    expect(practiceOptions.watch.showCharacter).toBe(true);
    expect(practiceOptions.trace.showOutline).toBe(true);
    expect(practiceOptions.recall.showCharacter).toBe(false);
  });
});
