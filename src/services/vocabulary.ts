import { supabase } from "../db/client";
import { normalizeText } from "../utils/text";

export type Vocabulary = {
  id: number;
  word: string;
  translation: string | null;
  example_sentence: string | null;
  tier: number;
  frequency_rank: number;
};

const MILESTONES = [50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000] as const;

const MILESTONE_MESSAGES: Record<number, string> = {
  50: "¡Muy bien! You've learned your first 50 words — you can already understand basic greetings and everyday phrases!",
  100: "¡Felicidades! 100 words down — you can introduce yourself and understand simple conversations!",
  250: "¡Genial! 250 words learned. You can now handle basic shopping, directions, and small talk!",
  500: "¡Increíble! 500 words — you're building real conversational ability. Keep going!",
  750: "¡Excelente! 750 words learned. You can now express opinions and understand most everyday Spanish!",
  1000: "¡Fantástico! 1,000 words — you've crossed a major milestone. Most conversations are within reach!",
  1500: "¡Impresionante! 1,500 words. You're approaching intermediate fluency — ¡sigue así!",
  2000: "¡Asombroso! 2,000 words learned. You can read simple Spanish texts and hold extended conversations!",
  3000: "¡Sobresaliente! 3,000 words — you're in advanced territory now. Most native content is accessible!",
  4000: "¡Eres increíble! 4,000 words mastered. You're fluent in the most essential Spanish vocabulary — ¡enhorabuena!",
};

export function getMilestoneMessage(wordsCount: number): string | null {
  if (MILESTONES.includes(wordsCount as (typeof MILESTONES)[number])) {
    return MILESTONE_MESSAGES[wordsCount as (typeof MILESTONES)[number]] ?? null;
  }
  return null;
}

export function checkAnswerMatch(userAnswer: string, expectedWord: string): boolean {
  return normalizeText(userAnswer) === normalizeText(expectedWord);
}

export async function getDailyWords(userId: number, tier: number, language: string = "es"): Promise<Vocabulary[]> {
  const { data: learnedRows, error: learnedError } = await supabase
    .from("user_vocabulary")
    .select("vocabulary_id")
    .eq("user_id", userId);

  if (learnedError) {
    throw new Error(`Failed to fetch learned words: ${learnedError.message}`);
  }

  const learnedIds = new Set((learnedRows ?? []).map((r) => r.vocabulary_id));

  const { data: candidates, error: vocabError } = await supabase
    .from("vocabulary")
    .select("id, word, translation, example_sentence, tier, frequency_rank")
    .eq("tier", tier)
    .eq("language", language);

  if (vocabError) {
    throw new Error(`Failed to fetch vocabulary: ${vocabError.message}`);
  }

  const pool = (candidates ?? []).filter((row) => !learnedIds.has(row.id));
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10) as Vocabulary[];
}

export async function markWordsLearned(userId: number, vocabularyIds: number[]): Promise<void> {
  if (vocabularyIds.length === 0) {
    return;
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("user_vocabulary")
    .select("vocabulary_id")
    .eq("user_id", userId)
    .in("vocabulary_id", vocabularyIds);

  if (existingError) {
    throw new Error(`Failed to check existing vocabulary: ${existingError.message}`);
  }

  const existing = new Set((existingRows ?? []).map((r) => r.vocabulary_id));
  const newIds = vocabularyIds.filter((id) => !existing.has(id));

  if (newIds.length > 0) {
    const rows = newIds.map((vocabulary_id) => ({ user_id: userId, vocabulary_id }));
    const { error: insertError } = await supabase.from("user_vocabulary").insert(rows);
    if (insertError) {
      throw new Error(`Failed to mark words learned: ${insertError.message}`);
    }
  }

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("words_learned_count")
    .eq("id", userId)
    .single();

  if (userError) {
    throw new Error(`Failed to read words_learned_count: ${userError.message}`);
  }

  const next = (userRow?.words_learned_count ?? 0) + newIds.length;

  const { error: updateError } = await supabase.from("users").update({ words_learned_count: next }).eq("id", userId);

  if (updateError) {
    throw new Error(`Failed to update words_learned_count: ${updateError.message}`);
  }
}

export async function getReviewWord(userId: number): Promise<Vocabulary | null> {
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

  const pick = ids[Math.floor(Math.random() * ids.length)];

  const { data: word, error: wError } = await supabase
    .from("vocabulary")
    .select("id, word, translation, example_sentence, tier, frequency_rank")
    .eq("id", pick)
    .single();

  if (wError || !word) {
    return null;
  }

  return word as Vocabulary;
}

export async function checkTierCompletion(userId: number, tier: number): Promise<boolean> {
  const { data: tierWords, error: twError } = await supabase.from("vocabulary").select("id").eq("tier", tier);

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
