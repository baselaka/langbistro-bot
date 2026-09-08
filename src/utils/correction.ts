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
