// Normalizes text for comparison: lowercase, remove accents, trim
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tokenizeForMatch(text: string): string[] {
  return normalizeText(text)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function checkAnswerMatch(userAnswer: string, expectedWord: string): boolean {
  return normalizeText(userAnswer) === normalizeText(expectedWord);
}

/** True when the answer is the expected phrase, or starts with it (completed fill-blank sentence). */
export function startsWithExpectedPhrase(userAnswer: string, expectedWord: string): boolean {
  const answerTokens = tokenizeForMatch(userAnswer);
  const expectedTokens = tokenizeForMatch(expectedWord);
  if (expectedTokens.length === 0 || answerTokens.length < expectedTokens.length) {
    return false;
  }
  return expectedTokens.every((token, index) => answerTokens[index] === token);
}
