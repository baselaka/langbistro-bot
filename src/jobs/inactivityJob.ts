import cron from "node-cron";
import type { Bot } from "grammy";
import { getLanguageConfig, parseTargetLanguage } from "../config/languages";
import { supabase } from "../db/client";
import {
  inactivityFinalPause,
  inactivityMonthProgress,
  inactivityNeverStarted24h,
  inactivityNeverStarted72h,
  inactivityRecall,
  inactivityWeekPause,
  parseInterfaceLanguage,
} from "../i18n";
import { sendAndClearQuiz } from "../services/quizState";
import { resolveGloss } from "../services/vocabGloss";

type InactivityUser = {
  id: number;
  telegram_id: number;
  last_active_at: string | null;
  created_at: string;
  inactivity_stage: number;
  words_learned_count: number;
  target_language: string | null;
  interface_language: string | null;
};

function daysSinceActive(lastActiveAt: string, now: Date): number {
  const last = new Date(lastActiveAt).getTime();
  return Math.floor((now.getTime() - last) / (1000 * 60 * 60 * 24));
}

function hoursSinceCreated(createdAt: string, now: Date): number {
  const created = new Date(createdAt).getTime();
  return Math.floor((now.getTime() - created) / (1000 * 60 * 60));
}

async function sendInactivityNudge(bot: Bot, telegramId: number, text: string): Promise<void> {
  await sendAndClearQuiz(telegramId, async () => {
    await bot.api.sendMessage(telegramId, text);
  });
}

export function startInactivityJob(bot: Bot): void {
  cron.schedule(
    "0 10 * * *",
    async () => {
      const now = new Date();

      const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, last_active_at, created_at, inactivity_stage, words_learned_count, target_language, interface_language")
        .eq("onboarding_complete", true)
        .eq("is_banned", false);

      if (error) {
        console.error("[InactivityJob] Query failed:", error);
        return;
      }

      for (const row of (users ?? []) as InactivityUser[]) {
        const stage = row.inactivity_stage;
        const cfg = getLanguageConfig(parseTargetLanguage(row.target_language));
        const locale = parseInterfaceLanguage(row.interface_language);
        const targetLang = cfg.code;

        try {
          // Users who finished onboarding but never sent a message.
          if (row.last_active_at === null) {
            const hours = hoursSinceCreated(row.created_at, now);

            if (stage === 0 && hours >= 24) {
              await sendInactivityNudge(bot, row.telegram_id, inactivityNeverStarted24h(locale, targetLang));
              await supabase.from("users").update({ inactivity_stage: 1 }).eq("id", row.id);
            } else if (stage === 1 && hours >= 72) {
              await sendInactivityNudge(bot, row.telegram_id, inactivityNeverStarted72h(locale, targetLang));
              await supabase.from("users").update({ inactivity_stage: 2 }).eq("id", row.id);
            }
            continue;
          }

          const days = daysSinceActive(row.last_active_at, now);

          if (stage === 0 && days >= 7) {
            await sendInactivityNudge(bot, row.telegram_id, inactivityWeekPause(locale, targetLang));
            await supabase.from("users").update({ inactivity_stage: 1 }).eq("id", row.id);
            continue;
          }

          if (stage === 1 && days >= 15) {
            let word = cfg.code === "es" ? "te amo" : cfg.code === "fr" ? "je t'aime" : "hello";
            let translation = cfg.code === "en" ? "a greeting" : "I love you";

            const { data: uvRows } = await supabase.from("user_vocabulary").select("vocabulary_id").eq("user_id", row.id);

            if (uvRows && uvRows.length > 0) {
              const pick = uvRows[Math.floor(Math.random() * uvRows.length)]!;
              const { data: vocabRow } = await supabase
                .from("vocabulary")
                .select("id, word, translation, language")
                .eq("id", pick.vocabulary_id)
                .eq("language", cfg.code)
                .single();
              if (vocabRow?.word) {
                word = vocabRow.word;
                translation = await resolveGloss(
                  {
                    id: vocabRow.id,
                    translation: vocabRow.translation ?? null,
                    language: vocabRow.language ?? cfg.code,
                  },
                  locale
                );
              }
            }

            await sendInactivityNudge(
              bot,
              row.telegram_id,
              inactivityRecall(locale, word, translation)
            );
            await supabase.from("users").update({ inactivity_stage: 2 }).eq("id", row.id);
            continue;
          }

          if (stage === 2 && days >= 30) {
            await sendInactivityNudge(
              bot,
              row.telegram_id,
              inactivityMonthProgress(locale, targetLang, row.words_learned_count)
            );
            await supabase.from("users").update({ inactivity_stage: 3 }).eq("id", row.id);
            continue;
          }

          if (stage === 3 && days >= 45) {
            await sendInactivityNudge(bot, row.telegram_id, inactivityFinalPause(locale, targetLang));
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
