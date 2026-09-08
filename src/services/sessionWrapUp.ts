import { t, type InterfaceLanguage } from "../i18n";
import type { SentWord } from "../utils/wordMatch";

export type WrapUpInput = {
  wordsUsed: number;
  wordsSent: number;
  streak: number;
  sessionWin: string | null;
  leftoverWord: string | null;
  sessionsCompleted: number;
};

/** Build the one-shot wrap-up message. No trailing question. */
export function buildWrapUpMessage(locale: InterfaceLanguage, input: WrapUpInput): string {
  const lines: string[] = [
    t(locale, "session.wrapUpHeader"),
    t(locale, "session.wrapUpWords", { used: input.wordsUsed, total: input.wordsSent }),
  ];

  if (input.sessionWin?.trim()) {
    lines.push(t(locale, "session.wrapUpWin", { win: input.sessionWin.trim() }));
  }

  lines.push(t(locale, "session.wrapUpStreak", { streak: input.streak }));

  if (input.sessionsCompleted === 1) {
    lines.push(t(locale, "session.wrapUpStreakExplainer"));
  }

  if (input.leftoverWord?.trim()) {
    lines.push(t(locale, "session.wrapUpTomorrowWord", { word: input.leftoverWord.trim() }));
  } else {
    lines.push(t(locale, "session.wrapUpTomorrowFresh"));
  }

  return lines.join("\n");
}

export function unusedWords(wordsSent: SentWord[], wordsUsed: SentWord[]): SentWord[] {
  const usedIds = new Set(wordsUsed.map((w) => w.id));
  return wordsSent.filter((w) => !usedIds.has(w.id));
}

/** Tunable floor: enough real TL conversation to earn a wrap-up/streak without finishing the checklist. */
export const AUTO_COMPLETE_TARGET_TURNS = 5;

/** True when the checklist is full, or enough target-language turns, and there was something to complete. */
export function shouldAutoComplete(
  wordsSent: SentWord[],
  wordsUsed: SentWord[],
  targetLanguageTurns: number
): boolean {
  return (
    wordsSent.length > 0 &&
    (wordsUsed.length >= wordsSent.length ||
      targetLanguageTurns >= AUTO_COMPLETE_TARGET_TURNS)
  );
}

/** Compact in-place checklist body. */
export function buildChecklistMessage(
  locale: InterfaceLanguage,
  wordsSent: SentWord[],
  wordsUsed: SentWord[]
): string {
  const usedIds = new Set(wordsUsed.map((w) => w.id));
  const usedCount = wordsSent.filter((w) => usedIds.has(w.id)).length;
  const header = t(locale, "session.checklistHeader", {
    used: usedCount,
    total: wordsSent.length,
  });

  const usedLine = wordsSent
    .filter((w) => usedIds.has(w.id))
    .map((w) => `✓ ${w.word}`)
    .join("  ");
  const unusedLine = wordsSent
    .filter((w) => !usedIds.has(w.id))
    .map((w) => w.word)
    .join(" · ");

  const parts = [header];
  if (usedLine) {
    parts.push(usedLine);
  }
  if (unusedLine) {
    parts.push(unusedLine);
  }
  return parts.join("\n");
}

/** System prompt injection for unused daily words. */
export function unusedWordsPromptInjection(unused: SentWord[]): string | null {
  if (unused.length === 0) {
    return null;
  }
  const list = unused.map((w) => w.word).join(", ");
  return `[DAILY WORDS: Naturally elicit these unused target words in your next turns: ${list}. Do not list them as a quiz or demand them.]`;
}

/** Closing-turn hint when this utterance completes the checklist. */
export const CLOSING_TURN_HINT =
  "[SESSION CLOSING: The learner just finished today's word checklist. Reply warmly without asking a follow-up question. Do not invite them to keep going.]";
