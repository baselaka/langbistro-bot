import cron from "node-cron";
import type { Bot } from "grammy";
import { supabase } from "../db/client";
import {
  buildFillBlankMessage,
  buildWordMessage,
  getOrCreateDailySession,
} from "../services/dailySession";
import { setQuizState } from "../services/quizState";
import { getDailyWords } from "../services/vocabulary";

type DeliveryUser = {
  id: number;
  telegram_id: number;
  preferred_word_timezone: string;
  words_learned_count: number;
  current_tier: number;
  target_language: string | null;
};

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
      .select("id, telegram_id, preferred_word_timezone, words_learned_count, current_tier, target_language")
      .eq("preferred_word_time", dbTime)
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
        const session = await getOrCreateDailySession(user.id, user.preferred_word_timezone);
        console.log(`[WordDelivery] Session for user ${user.id}:`, session.engaged, user.words_learned_count);
        if (session.engaged) {
          continue;
        }

        const words = await getDailyWords(user.id, user.current_tier, user.target_language ?? "es");
        if (words.length === 0) {
          continue;
        }

        await supabase
          .from("daily_sessions")
          .update({ engaged: true })
          .eq("id", session.id);

        const { text: wordListText, keyboard: wordListKeyboard } = buildWordMessage(words);
        await bot.api.sendMessage(user.telegram_id, wordListText, {
          parse_mode: "MarkdownV2",
          reply_markup: wordListKeyboard,
        });

        const fillBlankWord = words[Math.floor(Math.random() * words.length)];
        await bot.api.sendMessage(user.telegram_id, await buildFillBlankMessage(fillBlankWord, user.target_language ?? "es"));

        const fillBlankState = {
          type: "fill_blank" as const,
          word: fillBlankWord.word,
          sentence: fillBlankWord.example_sentence ?? undefined,
          vocabularyId: fillBlankWord.id,
          targetLanguage: user.target_language ?? "es",
        };

        setQuizState(user.telegram_id, fillBlankState);
      } catch (userError) {
        console.error(`Word delivery failed for user ${user.id}:`, userError instanceof Error ? userError.stack : userError);
      }
    }
  });
}
