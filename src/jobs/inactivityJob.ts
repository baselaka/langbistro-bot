import cron from "node-cron";
import type { Bot } from "grammy";
import { supabase } from "../db/client";

type InactivityUser = {
  id: number;
  telegram_id: number;
  last_active_at: string;
  inactivity_stage: number;
  words_learned_count: number;
};

function daysSinceActive(lastActiveAt: string, now: Date): number {
  const last = new Date(lastActiveAt).getTime();
  return Math.floor((now.getTime() - last) / (1000 * 60 * 60 * 24));
}

export function startInactivityJob(bot: Bot): void {
  cron.schedule(
    "0 10 * * *",
    async () => {
      const now = new Date();

      const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, last_active_at, inactivity_stage, words_learned_count")
        .eq("onboarding_complete", true)
        .eq("is_banned", false)
        .not("last_active_at", "is", null);

      if (error) {
        console.error("[InactivityJob] Query failed:", error);
        return;
      }

      for (const row of (users ?? []) as InactivityUser[]) {
        const days = daysSinceActive(row.last_active_at, now);
        const stage = row.inactivity_stage;

        try {
          if (stage === 0 && days >= 7) {
            const text =
              "Hola! 👋 You haven't practiced in a week, so I'm pausing your daily words for now. When you're ready to continue, just send me any message and we'll pick up right where you left off. ¡Hasta pronto!";
            await bot.api.sendMessage(row.telegram_id, text);
            await supabase.from("users").update({ inactivity_stage: 1 }).eq("id", row.id);
            continue;
          }

          if (stage === 1 && days >= 15) {
            let word = "te amo";
            let translation = "I love you";

            const { data: uvRows } = await supabase.from("user_vocabulary").select("vocabulary_id").eq("user_id", row.id);

            if (uvRows && uvRows.length > 0) {
              const pick = uvRows[Math.floor(Math.random() * uvRows.length)]!;
              const { data: vocabRow } = await supabase
                .from("vocabulary")
                .select("word, translation")
                .eq("id", pick.vocabulary_id)
                .single();
              if (vocabRow?.word) {
                word = vocabRow.word;
                translation = vocabRow.translation ?? translation;
              }
            }

            const text = `¿Todavía recuerdas qué significa «${word}»? It means "${translation}" — and you learned it! Come back and keep going. 💪`;
            await bot.api.sendMessage(row.telegram_id, text);
            await supabase.from("users").update({ inactivity_stage: 2 }).eq("id", row.id);
            continue;
          }

          if (stage === 2 && days >= 30) {
            const text = `You've already learned ${row.words_learned_count} Spanish words. That's real progress — don't let it go to waste. The next word is waiting for you. 👀`;
            await bot.api.sendMessage(row.telegram_id, text);
            await supabase.from("users").update({ inactivity_stage: 3 }).eq("id", row.id);
            continue;
          }

          if (stage === 3 && days >= 45) {
            const text =
              "We gave it our best shot! 😄 I'm pausing all messages for now so I don't bother you. Whenever you want to pick up Spanish again, just send me a message — I'll be here. ¡Buena suerte!";
            await bot.api.sendMessage(row.telegram_id, text);
            await supabase.from("users").update({ inactivity_stage: 4 }).eq("id", row.id);
          }
        } catch (e) {
          console.error(`[InactivityJob] Failed for user ${row.id}:`, e);
        }
      }
    },
    { timezone: "UTC" }
  );
}
