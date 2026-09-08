import cron from "node-cron";
import type { Bot } from "grammy";
import { getLanguageConfig, parseTargetLanguage } from "../config/languages";
import { supabase } from "../db/client";
import {
  parseInterfaceLanguage,
  winbackFinal,
  winbackHook,
  winbackSettings,
} from "../i18n";
import { nextWinbackAction, silenceDaysSince } from "../services/dailySessionMetrics";
import { sendAndClearQuiz } from "../services/quizState";
import { resolveGloss } from "../services/vocabGloss";
import { isTelegramBotBlockedError } from "../utils/telegramErrors";

export type WinbackUser = {
  id: number;
  telegram_id: number;
  last_active_at: string | null;
  created_at: string;
  inactivity_stage: number;
  target_language: string | null;
  interface_language: string | null;
};

const FALLBACK_HOOK: Record<"es" | "fr" | "en", { word: string; translation: string }> = {
  es: { word: "hola", translation: "hello" },
  fr: { word: "bonjour", translation: "hello" },
  en: { word: "hello", translation: "a greeting" },
};

async function sendWinbackMessage(bot: Bot, telegramId: number, text: string): Promise<void> {
  await sendAndClearQuiz(telegramId, async () => {
    await bot.api.sendMessage(telegramId, text);
  });
}

async function pickHookWord(
  userId: number,
  targetLang: "es" | "fr" | "en",
  locale: ReturnType<typeof parseInterfaceLanguage>
): Promise<{ word: string; translation: string }> {
  const fallback = FALLBACK_HOOK[targetLang];
  const { data: uvRows } = await supabase.from("user_vocabulary").select("vocabulary_id").eq("user_id", userId);

  if (!uvRows || uvRows.length === 0) {
    return fallback;
  }

  const pick = uvRows[Math.floor(Math.random() * uvRows.length)]!;
  const { data: vocabRow } = await supabase
    .from("vocabulary")
    .select("id, word, translation, language")
    .eq("id", pick.vocabulary_id)
    .eq("language", targetLang)
    .single();

  if (!vocabRow?.word) {
    return fallback;
  }

  const translation = await resolveGloss(
    {
      id: vocabRow.id,
      translation: vocabRow.translation ?? null,
      language: vocabRow.language ?? targetLang,
    },
    locale
  );

  return { word: vocabRow.word, translation };
}

/**
 * Process one user through the Day 3 / 10 / 21 win-back ladder.
 * No-ops when stage is already permanent (4) or silence is below the next threshold.
 */
export async function processWinbackUser(bot: Bot, row: WinbackUser, now: Date = new Date()): Promise<void> {
  if (row.inactivity_stage >= 4) {
    return;
  }

  const silenceDays = silenceDaysSince(row.last_active_at, row.created_at, now);
  const action = nextWinbackAction(row.inactivity_stage, silenceDays);
  if (!action) {
    return;
  }

  const cfg = getLanguageConfig(parseTargetLanguage(row.target_language));
  const locale = parseInterfaceLanguage(row.interface_language);
  const nowIso = now.toISOString();

  let text: string;
  let update: Record<string, unknown>;

  if (action === "hook") {
    const { word, translation } = await pickHookWord(row.id, cfg.code, locale);
    text = winbackHook(locale, word, translation);
    update = { inactivity_stage: 1, winback_hook_sent_at: nowIso };
  } else if (action === "settings") {
    text = winbackSettings(locale);
    update = { inactivity_stage: 2, winback_settings_sent_at: nowIso };
  } else {
    text = winbackFinal(locale, cfg.code);
    update = { inactivity_stage: 4, winback_final_sent_at: nowIso };
  }

  try {
    await sendWinbackMessage(bot, row.telegram_id, text);
  } catch (sendError) {
    if (isTelegramBotBlockedError(sendError)) {
      await supabase.from("users").update({ inactivity_stage: 4 }).eq("id", row.id);
      console.warn(`[InactivityJob] User ${row.id} blocked the bot — suppressed (inactivity_stage=4)`);
      return;
    }
    throw sendError;
  }

  const { error } = await supabase.from("users").update(update).eq("id", row.id);
  if (error) {
    throw new Error(`Failed to update win-back stage for user ${row.id}: ${error.message}`);
  }
}

export function startInactivityJob(bot: Bot): void {
  cron.schedule(
    "0 10 * * *",
    async () => {
      const now = new Date();

      const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, last_active_at, created_at, inactivity_stage, target_language, interface_language")
        .eq("onboarding_complete", true)
        .eq("is_banned", false)
        .lt("inactivity_stage", 4);

      if (error) {
        console.error("[InactivityJob] Query failed:", error);
        return;
      }

      for (const row of (users ?? []) as WinbackUser[]) {
        try {
          await processWinbackUser(bot, row, now);
        } catch (e) {
          console.error(`[InactivityJob] Failed for user ${row.id}:`, e);
        }
      }
    },
    { timezone: "UTC" }
  );
}
