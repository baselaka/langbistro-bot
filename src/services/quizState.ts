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

/**
 * After an outbound message that changes conversation context (e.g. inactivity
 * nudge), drop any pending quiz so the user's next message is not graded.
 * Quiz is only cleared after `send` succeeds.
 */
export async function sendAndClearQuiz(
  telegramId: number,
  send: () => Promise<void>
): Promise<void> {
  await send();
  clearQuizState(telegramId);
}

/**
 * After a new daily word set is delivered, drop the previous quiz immediately
 * (so a reply during fill-blank generation is not graded against yesterday's
 * word). Then set the new quiz only after the new prompt is sent.
 */
export async function replaceQuizAfterWordSet(
  telegramId: number,
  sendWordSet: () => Promise<void>,
  sendNewQuizPrompt: () => Promise<void>,
  nextQuiz: QuizState
): Promise<void> {
  await sendWordSet();
  clearQuizState(telegramId);
  await sendNewQuizPrompt();
  setQuizState(telegramId, nextQuiz);
}
