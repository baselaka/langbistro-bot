import cron from "node-cron";
import { GrammyError, type Bot } from "grammy";
import { parseTargetLanguage } from "../config/languages";
import { supabase } from "../db/client";
import { parseInterfaceLanguage } from "../i18n";
import {
  buildFillBlank,
  buildWordMessage,
  getOrCreateDailySession,
  isDailyWordDelivered,
  markDailyWordDelivered,
} from "../services/dailySession";
import { saveChecklistMessageId } from "../services/dailyLoop";
import { buildChecklistMessage } from "../services/sessionWrapUp";
import { replaceQuizAfterWordSet } from "../services/quizState";
import { attachGlosses } from "../services/vocabGloss";
import { getDailyWords } from "../services/vocabulary";

export type DeliveryUser = {
  id: number;
  telegram_id: number;
  preferred_word_timezone: string;
  words_learned_count: number;
  current_tier: number;
  target_language: string | null;
  interface_language: string | null;
};

/** Users currently mid-delivery in this process (guards overlapping cron ticks). */
const deliveringUserIds = new Set<number>();

export function isTelegramBotBlockedError(err: unknown): boolean {
  if (!(err instanceof GrammyError)) {
    return false;
  }
  if (err.error_code !== 403) {
    return false;
  }
  const description = (err.description ?? err.message).toLowerCase();
  return description.includes("blocked by the user") || description.includes("bot was blocked");
}

async function suppressBlockedUser(userId: number): Promise<void> {
  const { error } = await supabase.from("users").update({ inactivity_stage: 4 }).eq("id", userId);
  if (error) {
    throw new Error(`Failed to suppress blocked user ${userId}: ${error.message}`);
  }
}

/**
 * Deliver today's word set for one user. Writes `delivered_at` only after all
 * Telegram sends succeed. On 403 blocked-by-user, suppresses the user and
 * leaves `delivered_at` null. Transient failures leave `delivered_at` null for
 * same-day catch-up on the next cron tick.
 */
export async function deliverDailyWordsForUser(bot: Bot, user: DeliveryUser): Promise<void> {
  if (deliveringUserIds.has(user.id)) {
    return;
  }
  deliveringUserIds.add(user.id);

  try {
    const session = await getOrCreateDailySession(user.id, user.preferred_word_timezone);
    console.log(`[WordDelivery] Session for user ${user.id}:`, session.delivered_at, user.words_learned_count);
    if (isDailyWordDelivered(session)) {
      return;
    }

    const targetLanguage = parseTargetLanguage(user.target_language);
    const locale = parseInterfaceLanguage(user.interface_language);
    const rawWords = await getDailyWords(user.id, user.current_tier, targetLanguage);
    const words = await attachGlosses(rawWords, locale);
    const fillBlankWord = words[Math.floor(Math.random() * words.length)];
    if (!fillBlankWord) {
      return;
    }

    const wordsSent = words.map((w) => ({ id: w.id, word: w.word, kind: w.kind }));
    const { text: wordListText, keyboard: wordListKeyboard } = buildWordMessage(words, locale);
    const checklistText = buildChecklistMessage(locale, wordsSent, []);
    const fillBlankState = {
      type: "fill_blank" as const,
      word: fillBlankWord.word,
      sentence: fillBlankWord.example_sentence ?? undefined,
      vocabularyId: fillBlankWord.id,
      targetLanguage,
    };

    try {
      await replaceQuizAfterWordSet(
        user.telegram_id,
        async () => {
          await bot.api.sendMessage(user.telegram_id, wordListText, {
            parse_mode: "MarkdownV2",
            reply_markup: wordListKeyboard,
          });
          const checklistMsg = await bot.api.sendMessage(user.telegram_id, checklistText);
          await saveChecklistMessageId(session.id, checklistMsg.message_id);
        },
        async () => {
          const fillBlank = await buildFillBlank(fillBlankWord, targetLanguage, locale);
          fillBlankState.sentence = fillBlank.sentence;
          await bot.api.sendMessage(user.telegram_id, fillBlank.message);
        },
        fillBlankState
      );
    } catch (sendError) {
      if (isTelegramBotBlockedError(sendError)) {
        await suppressBlockedUser(user.id);
        console.warn(`[WordDelivery] User ${user.id} blocked the bot — suppressed (inactivity_stage=4)`);
        return;
      }
      throw sendError;
    }

    const claimed = await markDailyWordDelivered(session.id, {
      wordsSent,
      fillBlankWordId: fillBlankWord.id,
    });
    if (!claimed) {
      console.warn(`[WordDelivery] Session ${session.id} already marked delivered after send (user ${user.id})`);
    }
  } finally {
    deliveringUserIds.delete(user.id);
  }
}

/** Test helper — clears the in-process delivery overlap set. */
export function resetDeliveringUserIdsForTests(): void {
  deliveringUserIds.clear();
}

function getUtcHHMM(date: Date = new Date()): string {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function startWordDeliveryJob(bot: Bot): void {
  cron.schedule("* * * * *", async () => {
    const hhmm = getUtcHHMM();
    const dbTime = `${hhmm}:00`;
    console.log(`[WordDelivery] Cron tick at UTC ${dbTime}`);

    const { data: users, error } = await supabase
      .from("users")
      .select("id, telegram_id, preferred_word_timezone, words_learned_count, current_tier, target_language, interface_language")
      .lte("preferred_word_time", dbTime)
      .eq("onboarding_complete", true)
      .eq("inactivity_stage", 0);

    if (error) {
      console.error("Word delivery query failed:", error);
      return;
    }

    console.log(`[WordDelivery] Found ${(users ?? []).length} users to notify`);

    console.log(`[WordDelivery] Processing ${(users ?? []).length} users`);

    for (const user of (users ?? []) as DeliveryUser[]) {
      console.log(`[WordDelivery] Processing user ${user.id}`);
      try {
        await deliverDailyWordsForUser(bot, user);
      } catch (userError) {
        console.error(`Word delivery failed for user ${user.id}:`, userError instanceof Error ? userError.stack : userError);
      }
    }
  });
}
