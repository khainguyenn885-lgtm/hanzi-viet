export type WritingMode = "watch" | "trace" | "recall";

export function showStrokeHint(mistakes: number, threshold = 3): boolean {
  return Number.isFinite(mistakes) && mistakes >= threshold;
}

export function nextHintMode(mode: WritingMode): WritingMode {
  if (mode === "watch") return "trace";
  if (mode === "trace") return "recall";
  return "recall";
}

export function validateStrokeAttempt(strokeIndex: number, expectedStrokeCount: number, correct: boolean): { accepted: boolean; complete: boolean } {
  const validIndex = Number.isInteger(strokeIndex) && strokeIndex >= 0 && strokeIndex < expectedStrokeCount;
  const accepted = validIndex && correct;
  return { accepted, complete: accepted && strokeIndex === expectedStrokeCount - 1 };
}
