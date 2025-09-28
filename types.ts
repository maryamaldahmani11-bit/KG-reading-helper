export interface Lesson {
  title: string;
  sentences: string[];
}

export interface WordAnalysis {
  word: string;
  isCorrect: boolean;
}

export type Language = 'en' | 'ar';

export interface SpeechRequest {
  text: string;
  lang: string;
  rate?: number;
  voice?: SpeechSynthesisVoice;
  onBoundary?: (event: SpeechSynthesisEvent) => void;
  onEnd?: () => void;
}