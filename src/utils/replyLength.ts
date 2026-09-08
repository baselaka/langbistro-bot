import { getLanguageConfig } from "../config/languages";

/**
 * Statement-only char caps by learner level (PRS-98).
 * Follow-up questions are appended uncapped; ~30 chars keeps total near PRS-90 TTS budget.
 */
export const REPLY_CHAR_CAPS = {
  beginner: 60,
  intermediate: 90,
  advanced: 150,
} as const;

/** Pre-PRS-98 combined TTS budgets (statement + short question). */
export const TTS_BUDGET_CAPS = {
  beginner: 90,
  intermediate: 120,
  advanced: 180,
} as const;

type ReplyLevel = keyof typeof REPLY_CHAR_CAPS;

function normalizeReplyLevel(level: string): ReplyLevel {
  const normalized = level.toLowerCase();
  if (normalized === "intermediate" || normalized === "advanced") {
    return normalized;
  }
  return "beginner";
}

export function maxReplyCharsForLevel(level: string): number {
  return REPLY_CHAR_CAPS[normalizeReplyLevel(level)];
}

export function replyCharCapRule(level: string): string {
  const max = maxReplyCharsForLevel(level);
  return (
    `LENGTH: The "reply" field (statement only) must be at most ${max} characters ` +
    `(including spaces and punctuation). Put exactly one short follow-up in "followUpQuestion" ` +
    `(not inside "reply"); that field is not length-capped but should stay under ~40 characters.`
  );
}

const SENTENCE_END = /[.!?…]/u;
const QUESTION_MARK = /[?¿？]/u;

/**
 * Truncate at the last sentence boundary within maxChars.
 * Falls back to last whitespace, then hard slice — never cuts mid-sentence when a boundary exists in budget.
 */
export function truncateAtSentenceBoundary(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }

  const window = text.slice(0, maxChars);
  let lastEnd = -1;
  for (let i = 0; i < window.length; i++) {
    if (SENTENCE_END.test(window[i]!)) {
      lastEnd = i;
    }
  }
  if (lastEnd >= 0) {
    return text.slice(0, lastEnd + 1).trimEnd();
  }

  const lastSpace = window.search(/\s+\S*$/);
  if (lastSpace > 0) {
    return text.slice(0, lastSpace).trimEnd();
  }

  return window;
}

export function looksLikeQuestion(text: string): boolean {
  return QUESTION_MARK.test(text);
}

export function fallbackFollowUpQuestion(lang: string): string {
  return getLanguageConfig(lang).fallbackFollowUpQuestion;
}

export function resolveFollowUpQuestion(
  raw: string | null | undefined,
  lang: string,
  options: { closingTurn: boolean }
): string {
  if (options.closingTurn) {
    return "";
  }
  const trimmed = (raw ?? "").trim();
  if (trimmed && looksLikeQuestion(trimmed)) {
    return trimmed;
  }
  return fallbackFollowUpQuestion(lang);
}

/**
 * Cap the statement only, then append the follow-up (never truncated).
 */
export function composeSpokenReply(reply: string, followUp: string, maxChars: number): string {
  const statement = truncateAtSentenceBoundary(reply.trim(), maxChars);
  const question = followUp.trim();
  if (!question) {
    return statement;
  }
  if (!statement) {
    return question;
  }
  return `${statement} ${question}`;
}
