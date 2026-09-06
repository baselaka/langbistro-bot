import { InputFile, type Context } from "grammy";
import { generateVoice } from "../../ai/openai";
import { isSupportedLanguage, parseTargetLanguage } from "../../config/languages";
import { supabase } from "../../db/client";
import {
  INTERFACE_LANGUAGE_LABELS,
  isInterfaceLanguage,
  languageDisplayLabel,
  localizedLevelName,
  t,
  type InterfaceLanguage,
} from "../../i18n";
import {
  handleOnboardingLanguageCallback,
  handleOnboardingLevelCallback,
  handleOnboardingTimeCallback,
  resolveOnboardingReadCallbackData,
} from "../../services/onboarding";
import { clearQuizState } from "../../services/quizState";
import { getInterfaceLocaleByTelegramId } from "../../services/users";
import { etToUtc } from "../../utils/timeConvert";
import { getCallbackMeta } from "../ux-memory";

async function localeOf(ctx: Context): Promise<InterfaceLanguage> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return "en";
  }
  return getInterfaceLocaleByTelegramId(telegramId);
}

export async function handleCallbackQuery(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith("read_onboarding:")) {
    const locale = await localeOf(ctx);
    const openingText = resolveOnboardingReadCallbackData(data);
    if (!openingText) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.textUnavailable") });
      return;
    }
    await ctx.reply(openingText);
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith("listen_word:")) {
    const locale = await localeOf(ctx);
    const rawId = data.slice("listen_word:".length);
    const vocabularyId = Number(rawId);

    if (!Number.isFinite(vocabularyId)) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.invalidWord") });
      return;
    }

    const { data: row, error } = await supabase.from("vocabulary").select("word").eq("id", vocabularyId).single();

    if (error || !row?.word) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.wordNotFound") });
      return;
    }

    try {
      const audio = await generateVoice(row.word, { voice: "onyx", speed: 0.8 });
      await ctx.replyWithVoice(new InputFile(audio, "word.mp3"));
    } catch {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.audioFailed") });
      return;
    }

    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith("onboarding_language:")) {
    const locale = await localeOf(ctx);
    const lang = data.slice("onboarding_language:".length);
    if (!isSupportedLanguage(lang)) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.unsupportedLanguage") });
      return;
    }
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.userNotFound") });
      return;
    }

    const { data: user, error } = await supabase.from("users").select("id").eq("telegram_id", telegramId).single();
    if (error || !user) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.profileNotFound") });
      return;
    }
    await ctx.answerCallbackQuery();
    await handleOnboardingLanguageCallback(ctx, telegramId, user.id, lang);
    return;
  }

  if (data.startsWith("onboarding_level:")) {
    const locale = await localeOf(ctx);
    const level = data.slice("onboarding_level:".length);
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.userNotFound") });
      return;
    }
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramId)
      .single();
    if (error || !user) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.profileNotFound") });
      return;
    }

    await ctx.answerCallbackQuery();
    await handleOnboardingLevelCallback(ctx, telegramId, user.id, level);
    return;
  }

  if (data.startsWith("onboarding_time:")) {
    const locale = await localeOf(ctx);
    const time = data.slice("onboarding_time:".length);
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.userNotFound") });
      return;
    }

    const { data: user, error } = await supabase.from("users").select("id").eq("telegram_id", telegramId).single();
    if (error || !user) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.profileNotFound") });
      return;
    }

    await ctx.answerCallbackQuery();
    await handleOnboardingTimeCallback(ctx, telegramId, user.id, time);
    return;
  }

  if (data.startsWith("settings_language:")) {
    const locale = await localeOf(ctx);
    const newLang = data.slice("settings_language:".length);
    if (!isSupportedLanguage(newLang)) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.unsupportedLanguage") });
      return;
    }
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.userNotFound") });
      return;
    }

    const langLabel = languageDisplayLabel(newLang, locale);

    const { data: currentUser } = await supabase
      .from("users")
      .select("target_language, level, current_tier, language_progress")
      .eq("telegram_id", telegramId)
      .single();

    const currentLang = parseTargetLanguage(currentUser?.target_language);
    const existingProgress =
      (currentUser?.language_progress as Record<string, { level: string; current_tier: number }>) ?? {};
    const updatedProgress: Record<string, { level: string; current_tier: number }> = {
      ...existingProgress,
      [currentLang]: {
        level: currentUser?.level ?? "beginner",
        current_tier: currentUser?.current_tier ?? 1,
      },
    };

    const newLangProgress = updatedProgress[newLang];
    const restoredLevel = newLangProgress?.level ?? "beginner";
    const restoredTier = newLangProgress?.current_tier ?? 1;

    const { error } = await supabase
      .from("users")
      .update({
        target_language: newLang,
        level: restoredLevel,
        current_tier: restoredTier,
        language_progress: updatedProgress,
      })
      .eq("telegram_id", telegramId);

    if (error) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.switchFailed") });
      return;
    }

    await supabase
      .from("users")
      .update({ inactivity_stage: 0, last_active_at: new Date().toISOString() })
      .eq("telegram_id", ctx.from.id);

    const isRestored = !!newLangProgress;
    const switched = isRestored
      ? t(locale, "language.switchedRestored", {
          language: langLabel,
          level: localizedLevelName(locale, restoredLevel),
          tier: restoredTier,
        })
      : t(locale, "language.switchedFresh", { language: langLabel });

    await ctx.answerCallbackQuery();
    clearQuizState(telegramId);
    await ctx.reply(switched);
    return;
  }

  if (data.startsWith("settings_interface:")) {
    const requested = data.slice("settings_interface:".length);
    const currentLocale = await localeOf(ctx);
    if (!isInterfaceLanguage(requested)) {
      await ctx.answerCallbackQuery({ text: t(currentLocale, "callback.unsupportedLanguage") });
      return;
    }
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: t(currentLocale, "callback.userNotFound") });
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({ interface_language: requested })
      .eq("telegram_id", telegramId);

    if (error) {
      await ctx.answerCallbackQuery({ text: t(currentLocale, "callback.interfaceUpdateFailed") });
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.reply(
      t(requested, "settings.interfaceUpdated", { language: INTERFACE_LANGUAGE_LABELS[requested] })
    );
    return;
  }

  if (data.startsWith("settings_time:")) {
    const locale = await localeOf(ctx);
    const parts = data.split(":");
    const hh = parts[1];
    const mm = parts[2];

    if (!ctx.from || !hh || !mm) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.invalidTime") });
      return;
    }

    const utcHHMM = etToUtc(`${hh}:${mm}`);
    const timeValue = `${utcHHMM}:00`;
    const { error } = await supabase
      .from("users")
      .update({ preferred_word_time: timeValue })
      .eq("telegram_id", ctx.from.id);

    await ctx.answerCallbackQuery();

    if (error) {
      await ctx.reply(t(locale, "callback.settingsUpdateFailed"));
      return;
    }

    await supabase
      .from("users")
      .update({ inactivity_stage: 0, last_active_at: new Date().toISOString() })
      .eq("telegram_id", ctx.from.id);

    await ctx.reply(t(locale, "callback.timeUpdated", { time: `${hh}:${mm}` }));
    return;
  }

  if (data.startsWith("settings_level:")) {
    const locale = await localeOf(ctx);
    const level = data.slice("settings_level:".length);
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.userNotFound") });
      return;
    }

    const { error } = await supabase.from("users").update({ level }).eq("telegram_id", telegramId);
    if (error) {
      await ctx.answerCallbackQuery({ text: t(locale, "callback.levelUpdateFailed") });
      return;
    }

    await supabase
      .from("users")
      .update({ inactivity_stage: 0, last_active_at: new Date().toISOString() })
      .eq("telegram_id", ctx.from.id);

    await ctx.answerCallbackQuery(t(locale, "callback.levelUpdated", { level: localizedLevelName(locale, level) }));
    return;
  }

  const locale = await localeOf(ctx);
  const [action, rawMessageId] = data.split(":");
  const messageId = Number(rawMessageId);
  const chatId = ctx.chat?.id;

  if (!Number.isFinite(messageId) || !chatId) {
    await ctx.answerCallbackQuery({ text: t(locale, "callback.actionUnavailable") });
    return;
  }

  const meta = getCallbackMeta(chatId, messageId);
  await ctx.answerCallbackQuery();

  if (!meta) {
    await ctx.reply(t(locale, "callback.buttonExpired"));
    return;
  }

  if (action === "explain_correction" && meta.kind === "correction") {
    await ctx.reply(meta.explanation);
    return;
  }

  if (action === "read_reply" && meta.kind === "reply") {
    await ctx.reply(meta.reply);
    return;
  }

  if (action === "explain_reply" && meta.kind === "reply") {
    await ctx.reply(meta.replyExplanation);
    return;
  }

  await ctx.reply(t(locale, "callback.actionNotAvailable"));
}
