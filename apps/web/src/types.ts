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

export interface AiTokenGloss { surface: string; meaningVi: string | null; meaningEn: string | null; }
export interface TranslationResult { translation: string; targetLanguage: "vi" | "en"; tokens: AiTokenGloss[]; label: "machine-translation"; }
