import { parseTargetLanguage } from "../config/languages";
import { supabase } from "../db/client";
import type { InterfaceLanguage } from "../i18n";

export type VocabForGloss = {
  id: number;
  translation: string | null;
  language: string;
};

/**
 * English column is used when the UI locale is English, or when the learner's
 * interface language matches the word language (avoid tautological glosses like
 * Spanish→Spanish). ESL English words keep the English definition for `en` UI.
 */
export function shouldUseEnglishColumn(wordLanguage: string, locale: InterfaceLanguage): boolean {
  if (locale === "en") {
    return true;
  }
  return parseTargetLanguage(wordLanguage) === locale;
}

/** Pure resolver for tests and batch attach — never returns blank when English exists. */
export function pickGloss(
  english: string | null | undefined,
  localized: string | null | undefined,
  wordLanguage: string,
  locale: InterfaceLanguage
): string {
  const fallback = english ?? "";
  if (shouldUseEnglishColumn(wordLanguage, locale)) {
    return fallback;
  }
  const gloss = localized?.trim();
  return gloss || fallback;
}

export async function resolveGloss(word: VocabForGloss, locale: InterfaceLanguage): Promise<string> {
  if (shouldUseEnglishColumn(word.language, locale)) {
    return word.translation ?? "";
  }

  const { data, error } = await supabase
    .from("vocabulary_translations")
    .select("gloss")
    .eq("vocabulary_id", word.id)
    .eq("locale", locale)
    .maybeSingle();

  if (error) {
    console.error(`[vocabGloss] Failed to load gloss for vocab ${word.id}/${locale}:`, error.message);
    return word.translation ?? "";
  }

  return pickGloss(word.translation, data?.gloss, word.language, locale);
}

/**
 * Batch-resolve glosses for daily word cards. Overwrites `translation` with the
 * locale-aware gloss (English fallback). Avoids N+1 queries.
 */
export async function attachGlosses<T extends VocabForGloss>(
  words: T[],
  locale: InterfaceLanguage
): Promise<T[]> {
  if (words.length === 0) {
    return words;
  }

  if (words.every((w) => shouldUseEnglishColumn(w.language, locale))) {
    return words.map((w) => ({ ...w, translation: w.translation ?? "" }));
  }

  const ids = words.map((w) => w.id);
  const { data, error } = await supabase
    .from("vocabulary_translations")
    .select("vocabulary_id, gloss")
    .in("vocabulary_id", ids)
    .eq("locale", locale);

  if (error) {
    console.error(`[vocabGloss] Batch gloss load failed for locale ${locale}:`, error.message);
    return words.map((w) => ({ ...w, translation: w.translation ?? "" }));
  }

  const byId = new Map<number, string>();
  for (const row of data ?? []) {
    if (typeof row.vocabulary_id === "number" && typeof row.gloss === "string") {
      byId.set(row.vocabulary_id, row.gloss);
    }
  }

  return words.map((w) => ({
    ...w,
    translation: pickGloss(w.translation, byId.get(w.id), w.language, locale),
  }));
}
