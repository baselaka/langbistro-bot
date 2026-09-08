const MAX_STRIKE_TOKENS = 6;

export type CorrectionDisplay = {
  mistake: string;
  correctedSentence: string;
};

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function tokenCore(token: string): string {
  return token
    .replace(/^[¡¿«»"'“”‘’]+/u, "")
    .replace(/[.,;:!?…«»"'“”‘’]+$/u, "")
    .toLowerCase();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const row: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = current;
    }
  }
  return row[b.length];
}

function looksLikeFragment(tokenCount: number, otherTokenCount: number): boolean {
  return tokenCount > 0 && tokenCount <= MAX_STRIKE_TOKENS && otherTokenCount >= tokenCount * 2;
}

function findTokenSpan(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || haystack.length < needle.length) {
    return -1;
  }
  const needleCores = needle.map(tokenCore);
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    const matches = needleCores.every((core, offset) => tokenCore(haystack[start + offset]) === core);
    if (matches) {
      return start;
    }
  }
  return -1;
}

function replaceTokenSpan(tokens: string[], start: number, count: number, replacement: string[]): string {
  return [...tokens.slice(0, start), ...replacement, ...tokens.slice(start + count)].join(" ");
}

function spliceFragment(host: string, fromFragment: string, toFragment: string): string | null {
  const hostTokens = tokenize(host);
  const fromTokens = tokenize(fromFragment);
  const toTokens = tokenize(toFragment);
  const start = findTokenSpan(hostTokens, fromTokens);
  if (start < 0) {
    return null;
  }
  return replaceTokenSpan(hostTokens, start, fromTokens.length, toTokens);
}

function extractChangedSpan(fromText: string, toText: string): string | null {
  const fromTokens = tokenize(fromText);
  const toTokens = tokenize(toText);
  if (fromTokens.length === 0) {
    return null;
  }

  let prefix = 0;
  while (
    prefix < fromTokens.length &&
    prefix < toTokens.length &&
    tokenCore(fromTokens[prefix]) === tokenCore(toTokens[prefix])
  ) {
    prefix += 1;
  }

  let fromEnd = fromTokens.length;
  let toEnd = toTokens.length;
  while (
    fromEnd > prefix &&
    toEnd > prefix &&
    tokenCore(fromTokens[fromEnd - 1]) === tokenCore(toTokens[toEnd - 1])
  ) {
    fromEnd -= 1;
    toEnd -= 1;
  }

  const changed = fromTokens.slice(prefix, fromEnd);
  if (changed.length === 0) {
    return null;
  }
  if (changed.length === fromTokens.length && fromTokens.length > MAX_STRIKE_TOKENS) {
    return null;
  }
  if (changed.length > MAX_STRIKE_TOKENS) {
    return null;
  }
  return changed.join(" ");
}

function findClosestTokenIndex(tokens: string[], target: string): number {
  const targetCore = tokenCore(target);
  if (!targetCore) {
    return -1;
  }

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < tokens.length; index += 1) {
    const core = tokenCore(tokens[index]);
    if (!core) {
      continue;
    }
    const distance = levenshtein(core, targetCore);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  const maxDistance = Math.max(1, Math.floor(targetCore.length * 0.34));
  if (bestIndex < 0 || bestDistance > maxDistance) {
    return -1;
  }
  return bestIndex;
}

function pickHostSentence(original: string, userText: string, corrected: string): string {
  const originalCount = tokenize(original).length;
  const userCount = tokenize(userText).length;
  const correctedCount = tokenize(corrected).length;

  if (originalCount >= 3 && Math.abs(originalCount - correctedCount) <= 4) {
    return original;
  }
  if (userCount >= 3 && Math.abs(userCount - correctedCount) <= 4) {
    return userText;
  }
  if (userCount > originalCount) {
    return userText;
  }
  return original || userText;
}

export function normalizeCorrection(
  original: string,
  corrected: string,
  userText = ""
): CorrectionDisplay {
  const orig = original.trim();
  const corr = corrected.trim();
  const user = userText.trim();
  const origTokens = tokenize(orig);
  const corrTokens = tokenize(corr);
  const userTokens = tokenize(user);
  const origIsFragment = looksLikeFragment(origTokens.length, corrTokens.length);
  const corrIsFragment = looksLikeFragment(corrTokens.length, origTokens.length);

  if (origTokens.length === 0) {
    return { mistake: "", correctedSentence: corr };
  }
  if (corrTokens.length === 0) {
    return { mistake: "", correctedSentence: orig };
  }

  if (
    userTokens.length > Math.max(origTokens.length, corrTokens.length) &&
    origTokens.length <= MAX_STRIKE_TOKENS &&
    corrTokens.length <= MAX_STRIKE_TOKENS
  ) {
    const reconstructed = spliceFragment(user, orig, corr);
    if (reconstructed) {
      return { mistake: orig, correctedSentence: reconstructed };
    }
  }

  if (origIsFragment && !corrIsFragment) {
    return { mistake: orig, correctedSentence: corr };
  }

  if (corrIsFragment && !origIsFragment) {
    const host = pickHostSentence(orig, user, corr);
    const hostTokens = tokenize(host);
    const closest = findClosestTokenIndex(hostTokens, corr);
    if (closest >= 0) {
      return {
        mistake: hostTokens[closest],
        correctedSentence: replaceTokenSpan(hostTokens, closest, 1, corrTokens),
      };
    }
    return { mistake: "", correctedSentence: corr };
  }

  const host = pickHostSentence(orig, user, corr);
  const mistake = extractChangedSpan(host, corr) ?? extractChangedSpan(orig, corr) ?? "";
  return { mistake, correctedSentence: corr };
}

export function formatCorrectionMarkdownV2(
  original: string,
  corrected: string,
  escapeMarkdownV2: (value: string) => string,
  userText = ""
): string {
  const display = normalizeCorrection(original, corrected, userText);
  const correctedMarkdown = `*${escapeMarkdownV2(display.correctedSentence)}*`;
  if (display.mistake) {
    return `~${escapeMarkdownV2(display.mistake)}~ \\-\\> ${correctedMarkdown}`;
  }

  const shownOriginal = (userText.trim() || original.trim());
  if (shownOriginal && shownOriginal !== display.correctedSentence) {
    return `${escapeMarkdownV2(shownOriginal)} \\-\\> ${correctedMarkdown}`;
  }

  return correctedMarkdown;
}

/** Changed span on the corrected side (e.g. "a pancake" for a missing article). */
function extractChangedToSpan(fromText: string, toText: string): string | null {
  const fromTokens = tokenize(fromText);
  const toTokens = tokenize(toText);
  if (toTokens.length === 0) {
    return null;
  }

  let prefix = 0;
  while (
    prefix < fromTokens.length &&
    prefix < toTokens.length &&
    tokenCore(fromTokens[prefix]!) === tokenCore(toTokens[prefix]!)
  ) {
    prefix += 1;
  }

  let fromEnd = fromTokens.length;
  let toEnd = toTokens.length;
  while (
    fromEnd > prefix &&
    toEnd > prefix &&
    tokenCore(fromTokens[fromEnd - 1]!) === tokenCore(toTokens[toEnd - 1]!)
  ) {
    fromEnd -= 1;
    toEnd -= 1;
  }

  const changed = toTokens.slice(prefix, toEnd);
  if (changed.length === 0) {
    return null;
  }
  if (changed.length > MAX_STRIKE_TOKENS) {
    return null;
  }
  return changed.join(" ");
}

/**
 * Short phrase to highlight in the elicit invite (prefer the corrected fix span).
 */
export function invitePhraseFromCorrection(original: string, corrected: string): string {
  const orig = original.trim();
  const corr = corrected.trim();
  if (!corr) {
    return orig;
  }

  const corrTokens = tokenize(corr);
  const origTokens = tokenize(orig);

  // Mistake fragment already normalized by openai → expand with inserted articles/prepositions.
  if (
    origTokens.length > 0 &&
    origTokens.length <= MAX_STRIKE_TOKENS &&
    looksLikeFragment(origTokens.length, corrTokens.length)
  ) {
    const idx = findTokenSpan(corrTokens, origTokens);
    if (idx >= 0) {
      let start = idx;
      while (start > 0 && isGrammarFunctionWord(tokenCore(corrTokens[start - 1]!))) {
        start -= 1;
      }
      return corrTokens.slice(start, idx + origTokens.length).join(" ");
    }
  }

  const toSpan = extractChangedToSpan(orig, corr);
  if (toSpan) {
    const toToks = tokenize(toSpan);
    // Missing article/preposition: TO span is "a" — invite "a pancake" (include next token).
    if (toToks.every((token) => isGrammarFunctionWord(tokenCore(token)))) {
      const idx = findTokenSpan(corrTokens, toToks);
      if (idx >= 0 && idx + toToks.length < corrTokens.length) {
        return corrTokens.slice(idx, idx + toToks.length + 1).join(" ");
      }
    }
    return toSpan;
  }

  if (corrTokens.length <= MAX_STRIKE_TOKENS) {
    return corr;
  }
  return corr;
}

export type CorrectionSeverity = "high" | "medium" | "low";

/**
 * Classify how serious a correction is for level gating.
 * Function-word-only diffs (articles/prepositions) are medium; content/verb changes are high.
 */
export function classifyCorrectionSeverity(original: string, corrected: string): CorrectionSeverity {
  const origCores = tokenize(original).map(tokenCore).filter(Boolean);
  const corrCores = tokenize(corrected).map(tokenCore).filter(Boolean);
  if (origCores.length === 0 || corrCores.length === 0) {
    return "low";
  }

  const origNorm = origCores.map(normalizePronounCore);
  const corrNorm = corrCores.map(normalizePronounCore);
  const origSet = new Set(origNorm);
  const corrSet = new Set(corrNorm);
  const onlyInOrig = [...origSet].filter((token) => !corrSet.has(token));
  const onlyInCorr = [...corrSet].filter((token) => !origSet.has(token));

  if (onlyInOrig.length === 0 && onlyInCorr.length === 0) {
    return "low";
  }

  const styleOnly =
    onlyInOrig.every(isStyleOnlyWord) &&
    onlyInCorr.every(isStyleOnlyWord) &&
    onlyInOrig.length + onlyInCorr.length > 0;
  if (styleOnly) {
    return "low";
  }

  const allDiffs = [...onlyInOrig, ...onlyInCorr];
  if (allDiffs.every(isGrammarFunctionWord)) {
    return "medium";
  }

  return "high";
}

/** Keep medium+ at every level; advanced also keeps low (if it survived style filters). */
export function shouldShowCorrectionForLevel(
  severity: CorrectionSeverity,
  level: string
): boolean {
  const normalized = level.toLowerCase();
  if (normalized === "advanced") {
    return true;
  }
  return severity === "medium" || severity === "high";
}

export type CorrectionReattemptTarget = {
  correctedPhrase: string;
  correctedSentence: string;
};

/** True when the learner's utterance includes the invited fix (optional re-attempt). */
export function matchesCorrectionReattempt(
  text: string,
  target: CorrectionReattemptTarget
): boolean {
  const utterance = text.trim().toLowerCase();
  if (!utterance) {
    return false;
  }

  const phrase = target.correctedPhrase.trim().toLowerCase();
  if (phrase && utterance.includes(phrase)) {
    return true;
  }

  const sentence = target.correctedSentence.trim().toLowerCase();
  if (sentence && utterance.includes(sentence)) {
    return true;
  }

  if (phrase) {
    const phraseCores = tokenize(phrase).map(tokenCore).filter(Boolean);
    const utteranceCores = new Set(tokenize(utterance).map(tokenCore).filter(Boolean));
    if (
      phraseCores.length > 0 &&
      phraseCores.every((core) => utteranceCores.has(core))
    ) {
      return true;
    }
  }

  return false;
}

function normalizePronounCore(token: string): string {
  if (token === "yourself" || token === "yourselves" || token === "you") {
    return "you";
  }
  return token;
}

const GRAMMAR_FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "at",
  "in",
  "on",
  "for",
  "from",
  "with",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "al",
  "le",
  "les",
  "du",
  "des",
  "une",
  "au",
  "aux",
  "à",
]);

const STYLE_ONLY_WORDS = new Set(["and", "but", "or", "so", "you", "yourself", "yourselves"]);

function isGrammarFunctionWord(token: string): boolean {
  return GRAMMAR_FUNCTION_WORDS.has(token);
}

function isStyleOnlyWord(token: string): boolean {
  return STYLE_ONLY_WORDS.has(token);
}

/** Drop GPT corrections that are stale (about a prior turn) or stylistic paraphrases of valid input. */
export function shouldKeepCorrection(
  original: string,
  corrected: string,
  userText: string
): boolean {
  const orig = original.trim();
  const corr = corrected.trim();
  const user = userText.trim();
  if (!orig || !corr || !user) {
    return false;
  }

  const userCores = tokenize(user).map(tokenCore).filter(Boolean);
  const origCores = tokenize(orig).map(tokenCore).filter(Boolean);
  const corrCores = tokenize(corr).map(tokenCore).filter(Boolean);
  if (origCores.length === 0 || corrCores.length === 0 || userCores.length === 0) {
    return false;
  }

  const userSet = new Set(userCores);
  const origContent = origCores.filter((token) => !isGrammarFunctionWord(token));
  const groundedSource = origContent.length > 0 ? origContent : origCores;
  const grounded = groundedSource.every((token) => userSet.has(token));
  if (!grounded) {
    return false;
  }

  const userNorm = userCores.map(normalizePronounCore);
  const corrNorm = corrCores.map(normalizePronounCore);
  if (userNorm.join(" ") === corrNorm.join(" ")) {
    return false;
  }

  const userNormSet = new Set(userNorm);
  const corrNormSet = new Set(corrNorm);
  const onlyInUser = [...userNormSet].filter((token) => !corrNormSet.has(token));
  const onlyInCorr = [...corrNormSet].filter((token) => !userNormSet.has(token));
  const styleOnlyDiff =
    onlyInUser.every(isStyleOnlyWord) &&
    onlyInCorr.every(isStyleOnlyWord) &&
    onlyInUser.length + onlyInCorr.length > 0;
  if (styleOnlyDiff) {
    return false;
  }

  return true;
}
