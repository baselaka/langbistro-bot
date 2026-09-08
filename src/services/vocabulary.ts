import { parseTargetLanguage } from "../config/languages";
import { getMilestoneMessage } from "../i18n";
import { supabase } from "../db/client";
import {
  buildDailyWordSet,
  productionFailurePatch,
  productionSuccessPatch,
  type DailyWord,
  type VocabRow,
} from "./srs";

export { getMilestoneMessage };

export type Vocabulary = VocabRow;

export type DailyVocabulary = DailyWord;

const VOCAB_SELECT = "id, word, translation, example_sentence, tier, frequency_rank, language";

async function fetchVocabByIds(ids: number[], language: string): Promise<VocabRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const lang = parseTargetLanguage(language);
  const { data, error } = await supabase
    .from("vocabulary")
    .select(VOCAB_SELECT)
    .in("id", ids)
    .eq("language", lang);

  if (error) {
    throw new Error(`Failed to fetch vocabulary by id: ${error.message}`);
  }

  const byId = new Map((data ?? []).map((row) => [row.id as number, row as VocabRow]));
  // Preserve caller order (due_at ascending).
  return ids.map((id) => byId.get(id)).filter((row): row is VocabRow => Boolean(row));
}

export async function getDailyWords(
  userId: number,
  tier: number,
  language: string = "es"
): Promise<DailyVocabulary[]> {
  const lang = parseTargetLanguage(language);
  const nowIso = new Date().toISOString();

  const { data: learnedRows, error: learnedError } = await supabase
    .from("user_vocabulary")
    .select("vocabulary_id")
    .eq("user_id", userId);

  if (learnedError) {
    throw new Error(`Failed to fetch learned words: ${learnedError.message}`);
  }

  const learnedIds = new Set((learnedRows ?? []).map((r) => r.vocabulary_id as number));

  const { data: dueRows, error: dueError } = await supabase
    .from("user_vocabulary")
    .select("vocabulary_id, due_at")
    .eq("user_id", userId)
    .not("due_at", "is", null)
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(12);

  if (dueError) {
    throw new Error(`Failed to fetch due vocabulary: ${dueError.message}`);
  }

  const dueIds = (dueRows ?? []).map((r) => r.vocabulary_id as number);
  const dueWords = await fetchVocabByIds(dueIds, lang);

  const { data: candidates, error: vocabError } = await supabase
    .from("vocabulary")
    .select(VOCAB_SELECT)
    .eq("tier", tier)
    .eq("language", lang);

  if (vocabError) {
    throw new Error(`Failed to fetch vocabulary: ${vocabError.message}`);
  }

  const newPool = ((candidates ?? []) as VocabRow[])
    .filter((row) => !learnedIds.has(row.id))
    .sort(() => Math.random() - 0.5);

  return buildDailyWordSet(dueWords, newPool);
}

/**
 * Grade a successful production: enroll at interval 1 or advance the ladder.
 * Bumps words_learned_count only when inserting a new user_vocabulary row.
 */
export async function recordProductionSuccess(
  userId: number,
  vocabularyIds: number[],
  now: Date = new Date()
): Promise<void> {
  if (vocabularyIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(vocabularyIds)];

  const { data: existingRows, error: existingError } = await supabase
    .from("user_vocabulary")
    .select("vocabulary_id, interval_days")
    .eq("user_id", userId)
    .in("vocabulary_id", uniqueIds);

  if (existingError) {
    throw new Error(`Failed to check existing vocabulary: ${existingError.message}`);
  }

  const existingById = new Map(
    (existingRows ?? []).map((r) => [r.vocabulary_id as number, r.interval_days as number])
  );

  const toInsert: Array<{
    user_id: number;
    vocabulary_id: number;
    interval_days: number;
    last_produced_at: string;
    due_at: string;
  }> = [];
  const toUpdate: Array<{ vocabulary_id: number; patch: ReturnType<typeof productionSuccessPatch> }> =
    [];

  for (const vocabularyId of uniqueIds) {
    const current = existingById.get(vocabularyId);
    if (current === undefined) {
      const patch = productionSuccessPatch(null, now);
      toInsert.push({
        user_id: userId,
        vocabulary_id: vocabularyId,
        interval_days: patch.interval_days,
        last_produced_at: patch.last_produced_at,
        due_at: patch.due_at,
      });
    } else {
      toUpdate.push({ vocabulary_id: vocabularyId, patch: productionSuccessPatch(current, now) });
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("user_vocabulary").insert(toInsert);
    if (insertError) {
      throw new Error(`Failed to enroll vocabulary: ${insertError.message}`);
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("words_learned_count")
      .eq("id", userId)
      .single();

    if (userError) {
      throw new Error(`Failed to read words_learned_count: ${userError.message}`);
    }

    const next = (userRow?.words_learned_count ?? 0) + toInsert.length;
    const { error: updateError } = await supabase
      .from("users")
      .update({ words_learned_count: next })
      .eq("id", userId);

    if (updateError) {
      throw new Error(`Failed to update words_learned_count: ${updateError.message}`);
    }
  }

  for (const { vocabulary_id, patch } of toUpdate) {
    const { error: updateError } = await supabase
      .from("user_vocabulary")
      .update({
        interval_days: patch.interval_days,
        last_produced_at: patch.last_produced_at,
        due_at: patch.due_at,
      })
      .eq("user_id", userId)
      .eq("vocabulary_id", vocabulary_id);

    if (updateError) {
      throw new Error(`Failed to advance vocabulary SRS: ${updateError.message}`);
    }
  }
}

/** Alias for quiz / legacy callers — production success is the only graduation path. */
export async function markWordsLearned(userId: number, vocabularyIds: number[]): Promise<void> {
  await recordProductionSuccess(userId, vocabularyIds);
}

/**
 * Reset due words that were missed or answered wrong.
 * Only updates existing user_vocabulary rows (never inserts).
 */
export async function recordProductionFailure(
  userId: number,
  vocabularyIds: number[],
  now: Date = new Date()
): Promise<void> {
  if (vocabularyIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(vocabularyIds)];
  const patch = productionFailurePatch(now);

  const { error } = await supabase
    .from("user_vocabulary")
    .update({
      interval_days: patch.interval_days,
      due_at: patch.due_at,
    })
    .eq("user_id", userId)
    .in("vocabulary_id", uniqueIds);

  if (error) {
    throw new Error(`Failed to reset vocabulary SRS: ${error.message}`);
  }
}

export async function getReviewWord(userId: number, language: string = "es"): Promise<Vocabulary | null> {
  const lang = parseTargetLanguage(language);
  const { data: learned, error } = await supabase
    .from("user_vocabulary")
    .select("vocabulary_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch learned vocabulary: ${error.message}`);
  }

  const ids = (learned ?? []).map((r) => r.vocabulary_id);
  if (ids.length === 0) {
    return null;
  }

  const { data: words, error: wError } = await supabase
    .from("vocabulary")
    .select(VOCAB_SELECT)
    .in("id", ids)
    .eq("language", lang);

  if (wError || !words || words.length === 0) {
    return null;
  }

  const pick = words[Math.floor(Math.random() * words.length)];
  return pick as Vocabulary;
}

export async function checkTierCompletion(
  userId: number,
  tier: number,
  language: string = "es"
): Promise<boolean> {
  const lang = parseTargetLanguage(language);
  const { data: tierWords, error: twError } = await supabase
    .from("vocabulary")
    .select("id")
    .eq("tier", tier)
    .eq("language", lang);

  if (twError) {
    throw new Error(`Failed to fetch tier words: ${twError.message}`);
  }

  const tierIds = (tierWords ?? []).map((w) => w.id);
  if (tierIds.length === 0) {
    return false;
  }

  const { data: learnedRows, error: learnedError } = await supabase
    .from("user_vocabulary")
    .select("vocabulary_id")
    .eq("user_id", userId)
    .in("vocabulary_id", tierIds);

  if (learnedError) {
    throw new Error(`Failed to fetch user vocabulary for tier: ${learnedError.message}`);
  }

  const learnedInTier = new Set((learnedRows ?? []).map((r) => r.vocabulary_id));
  const allLearned = tierIds.every((id) => learnedInTier.has(id));

  if (allLearned) {
    const { data: user } = await supabase.from("users").select("current_tier").eq("id", userId).single();
    const current = user?.current_tier ?? 1;
    if (current === tier && tier < 5) {
      await supabase.from("users").update({ current_tier: tier + 1 }).eq("id", userId);
    }
    return true;
  }

  return false;
}
