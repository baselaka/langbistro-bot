export type QuizState = {
  type: "fill_blank" | "review";
  word: string;
  sentence?: string;
  vocabularyId: number;
  targetLanguage: string;
};

const MAX_ENTRIES = 1000;
const quizByTelegramId = new Map<number, QuizState>();

export function setQuizState(telegramId: number, state: QuizState): void {
  if (!quizByTelegramId.has(telegramId) && quizByTelegramId.size >= MAX_ENTRIES) {
    const oldest = quizByTelegramId.keys().next().value as number | undefined;
    if (oldest !== undefined) {
      quizByTelegramId.delete(oldest);
    }
  }
  quizByTelegramId.set(telegramId, state);
}

export function getQuizState(telegramId: number): QuizState | undefined {
  return quizByTelegramId.get(telegramId);
}

export function clearQuizState(telegramId: number): void {
  quizByTelegramId.delete(telegramId);
}

export function isInQuiz(telegramId: number): boolean {
  return quizByTelegramId.has(telegramId);
}
