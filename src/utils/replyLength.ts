/** Soft/hard reply length caps by learner level (PRS-90 TTS cost bound). */
export const REPLY_CHAR_CAPS = {
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
  return `LENGTH: The "reply" field must be at most ${max} characters (including spaces and punctuation). Prefer one short turn the learner can answer.`;
}

const SENTENCE_END = /[.!?…]/u;

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
