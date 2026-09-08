import { levenshtein } from "./correction";

/** Common irregular surface forms keyed by lemma (lowercase). */
const IRREGULAR_FORMS: Readonly<Record<string, readonly string[]>> = {
  être: ["suis", "es", "est", "sommes", "êtes", "sont", "été", "étais", "était", "étions", "étiez", "étaient"],
  etre: ["suis", "es", "est", "sommes", "etes", "sont", "ete", "etais", "etait", "etions", "etiez", "etaient"],
};

function normalizeToken(token: string): string {
  return token
    .normalize("NFC")
    .replace(/^[¡¿«»"'“”‘’]+/u, "")
    .replace(/[.,;:!?…«»"'“”‘’]+$/u, "")
    .toLowerCase();
}

/** Tokenize learner text for lemma matching (punctuation stripped, lowercased). */
export function tokenizeForMatch(text: string): string[] {
  return text
    .trim()
    .split(/\s+/u)
    .map(normalizeToken)
    .filter(Boolean);
}

function sharedPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) {
    i += 1;
  }
  return i;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

/** True when a single target lemma appears in the token list (exact, substring, edit, or stem). */
export function tokenMatchesLemma(lemma: string, tokens: string[]): boolean {
  const target = normalizeToken(lemma);
  if (!target) {
    return false;
  }

  const irregular = new Set(
    (IRREGULAR_FORMS[target] ?? IRREGULAR_FORMS[stripAccents(target)] ?? []).map(normalizeToken)
  );
  const maxEdit = Math.max(1, Math.floor(target.length / 3));
  const minPrefix = Math.max(3, target.length - 2);
  const targetPlain = stripAccents(target);

  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (token === target || irregular.has(token)) {
      return true;
    }
    if (token.includes(target) || target.includes(token)) {
      if (Math.min(token.length, target.length) >= Math.min(3, target.length)) {
        return true;
      }
    }
    if (levenshtein(token, target) <= maxEdit || levenshtein(stripAccents(token), targetPlain) <= maxEdit) {
      return true;
    }
    if (
      sharedPrefixLength(token, target) >= minPrefix ||
      sharedPrefixLength(stripAccents(token), targetPlain) >= minPrefix
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Match a vocabulary target word against learner text.
 * Multi-word targets require every part to match.
 */
export function textContainsWord(text: string, word: string): boolean {
  const tokens = tokenizeForMatch(text);
  const parts = word
    .trim()
    .split(/\s+/u)
    .map(normalizeToken)
    .filter(Boolean);
  if (parts.length === 0) {
    return false;
  }
  return parts.every((part) => tokenMatchesLemma(part, tokens));
}

export type SentWord = {
  id: number;
  word: string;
  /** Present on daily delivery after PRS-89 (new vs due mix). */
  kind?: "new" | "due";
};

/** Return sent words that appear in the utterance and are not already in used. */
export function matchNewWords(
  text: string,
  wordsSent: SentWord[],
  wordsUsed: SentWord[]
): SentWord[] {
  const usedIds = new Set(wordsUsed.map((w) => w.id));
  const newly: SentWord[] = [];
  for (const sent of wordsSent) {
    if (usedIds.has(sent.id)) {
      continue;
    }
    if (textContainsWord(text, sent.word)) {
      newly.push(sent);
      usedIds.add(sent.id);
    }
  }
  return newly;
}
