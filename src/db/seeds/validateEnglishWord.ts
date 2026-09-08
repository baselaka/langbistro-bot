import fs from "node:fs";
import path from "node:path";
import { EN_JUNK_REPLACEMENTS, EN_UNMAPPABLE_JUNK } from "./enJunkReplacements";

const ALLOW_SINGLE = new Set(["a", "i"]);

const CONTRACTION_STEMS = new Set(
  Object.keys(EN_JUNK_REPLACEMENTS).filter((w) => !w.startsWith("'") && !w.includes("'"))
);

let lexiconCache: Set<string> | null = null;

export function loadEnglishLexicon(lexiconPath?: string): Set<string> {
  if (lexiconCache && !lexiconPath) {
    return lexiconCache;
  }
  const resolved =
    lexiconPath ?? path.resolve(__dirname, "data", "en_lexicon.txt");
  const content = fs.readFileSync(resolved, "utf8");
  const set = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (w && !w.startsWith("#")) {
      set.add(w);
    }
  }
  if (!lexiconPath) {
    lexiconCache = set;
  }
  return set;
}

/** Reset cached lexicon (tests). */
export function resetEnglishLexiconCache(): void {
  lexiconCache = null;
}

export type EnglishWordRejectReason =
  | "empty"
  | "single_letter"
  | "unmappable_junk"
  | "contraction_stem"
  | "bad_shape"
  | "not_in_lexicon";

export function structuralEnglishOk(word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  if (ALLOW_SINGLE.has(w) && w.length === 1) return true;
  if (/^[a-z]+'[a-z]+$/.test(w)) return true;
  if (/^[a-z]+(-[a-z]{2,})+$/.test(w)) return true;
  if (/^[a-z]{2,}$/.test(w)) return true;
  return false;
}

/**
 * Returns a reject reason, or null if the candidate is acceptable for English seeding.
 */
export function validateEnglishSeedWord(
  raw: string,
  lexicon?: Set<string>
): EnglishWordRejectReason | null {
  const word = raw.trim().toLowerCase();
  if (!word) return "empty";
  if (EN_UNMAPPABLE_JUNK.has(word)) return "unmappable_junk";
  if (CONTRACTION_STEMS.has(word)) return "contraction_stem";
  // Raw junk keys that start with apostrophe (fragments) are also stems to reject.
  if (word in EN_JUNK_REPLACEMENTS) return "contraction_stem";
  if (word.length === 1 && !ALLOW_SINGLE.has(word)) return "single_letter";
  if (!structuralEnglishOk(word)) return "bad_shape";
  const lex = lexicon ?? loadEnglishLexicon();
  if (!lex.has(word)) return "not_in_lexicon";
  return null;
}

export function assertEnglishSeedWords(words: string[], lexicon?: Set<string>): void {
  const rejects: Array<{ word: string; reason: EnglishWordRejectReason }> = [];
  for (const word of words) {
    const reason = validateEnglishSeedWord(word, lexicon);
    if (reason) {
      rejects.push({ word, reason });
    }
  }
  if (rejects.length > 0) {
    const sample = rejects
      .slice(0, 30)
      .map((r) => `${JSON.stringify(r.word)} (${r.reason})`)
      .join(", ");
    const more = rejects.length > 30 ? ` …and ${rejects.length - 30} more` : "";
    throw new Error(
      `[vocabulary-en] Rejected ${rejects.length} English seed candidate(s): ${sample}${more}`
    );
  }
}
