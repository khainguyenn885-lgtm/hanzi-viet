export type WritingMode = "watch" | "trace" | "recall";
export type StrokeMode = WritingMode;

export function nextStrokeMode(mode: WritingMode): WritingMode {
  return mode === "watch" ? "trace" : mode === "trace" ? "recall" : "watch";
}

export function getWritingFeedback(mistakes: number, showHintAfter = 3): "encourage" | "hint" {
  return mistakes >= showHintAfter ? "hint" : "encourage";
}

export const practiceOptions = {
  watch: { showCharacter: true, showOutline: false },
  trace: { showCharacter: true, showOutline: true },
  recall: { showCharacter: false, showOutline: false }
} satisfies Record<WritingMode, { showCharacter: boolean; showOutline: boolean }>;
