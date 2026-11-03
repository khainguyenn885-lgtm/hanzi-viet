export interface WordRecord {
  id: string;
  source: string;
  level: number;
  hanzi: string;
  pinyin: string;
  tones: string;
  meaningEn: string;
  meaningVi: string;
  hanViet: string;
  partOfSpeech: string;
  exampleChinese: string;
  examplePinyin: string;
  exampleEnglish: string;
  exampleVietnamese: string;
  sourceAttribution: string;
  translationStatus: string;
}

export interface AnalyzedToken {
  surface: string;
  pinyin: string;
  isChinese: boolean;
  needsReview: boolean;
  word?: WordRecord | null;
  matches?: WordRecord[];
}

export type FeedbackCategory = "vocabulary" | "feature" | "experience" | "other";
export interface ReviewState { wordId: string; dueAt: number; remembered: boolean; seen: number; }
