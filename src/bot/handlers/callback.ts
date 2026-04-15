import { InputFile, type Context } from "grammy";
import { generateVoice } from "../../ai/openai";
import { supabase } from "../../db/client";
import {
  handleOnboardingLanguageCallback,
  handleOnboardingLevelCallback,
  handleOnboardingTimeCallback,
  resolveOnboardingReadCallbackData,
} from "../../services/onboarding";
import { clearQuizState } from "../../services/quizState";
import { etToUtc } from "../../utils/timeConvert";
import { getCallbackMeta } from "../ux-memory";

export async function handleCallbackQuery(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith("read_onboarding:")) {
    const spanish = resolveOnboardingReadCallbackData(data);
    if (!spanish) {
      await ctx.answerCallbackQuery({ text: "This text is no longer available." });
      return;
    }
    await ctx.reply(spanish);
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith("listen_word:")) {
    const rawId = data.slice("listen_word:".length);
    const vocabularyId = Number(rawId);

    if (!Number.isFinite(vocabularyId)) {
      await ctx.answerCallbackQuery({ text: "Invalid word selection." });
      return;
    }

    const { data: row, error } = await supabase.from("vocabulary").select("word").eq("id", vocabularyId).single();

    if (error || !row?.word) {
      await ctx.answerCallbackQuery({ text: "Word not found." });
      return;
    }

    try {
      const audio = await generateVoice(row.word, { voice: "onyx", speed: 0.8 });
      await ctx.replyWithVoice(new InputFile(audio, "word.mp3"));
    } catch {
      await ctx.answerCallbackQuery({ text: "Could not generate audio." });
      return;
    }

    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith("onboarding_language:")) {
    const lang = data.slice("onboarding_language:".length);
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: "User not found." });
      return;
    }

    const { data: user, error } = await supabase.from("users").select("id").eq("telegram_id", telegramId).single();
    if (error || !user) {
      await ctx.answerCallbackQuery({ text: "Could not find your profile." });
      return;
    }
    await ctx.answerCallbackQuery();
    await handleOnboardingLanguageCallback(ctx, telegramId, user.id, lang);
    return;
  }

  if (data.startsWith("onboarding_level:")) {
    const level = data.slice("onboarding_level:".length);
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: "User not found." });
      return;
    }
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramId)
      .single();
    if (error || !user) {
      await ctx.answerCallbackQuery({ text: "Could not find your profile." });
      return;
    }

    await ctx.answerCallbackQuery();
    await handleOnboardingLevelCallback(ctx, telegramId, user.id, level);
    return;
  }

  if (data.startsWith("onboarding_time:")) {
    const time = data.slice("onboarding_time:".length);
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: "User not found." });
      return;
    }

    const { data: user, error } = await supabase.from("users").select("id").eq("telegram_id", telegramId).single();
    if (error || !user) {
      await ctx.answerCallbackQuery({ text: "Could not find your profile." });
      return;
    }

    await ctx.answerCallbackQuery();
    await handleOnboardingTimeCallback(ctx, telegramId, user.id, time);
    return;
  }

  if (data.startsWith("settings_language:")) {
    const newLang = data.slice("settings_language:".length);
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: "User not found." });
      return;
    }

    const langLabel = newLang === "fr" ? "French 🇫🇷" : "Spanish 🇪🇸";

    const { error } = await supabase.from("users").update({
      target_language: newLang,
      level: "beginner",
      current_tier: 1,
    }).eq("telegram_id", telegramId);

    if (error) {
      await ctx.answerCallbackQuery({ text: "Could not switch language." });
      return;
    }

    await ctx.answerCallbackQuery();
    clearQuizState(telegramId);
    await ctx.reply(
      `✅ Switched to ${langLabel}!\n\nYour level has been reset to Beginner and you'll start from Tier 1 vocabulary. Your progress in the previous language is saved.`
    );
    return;
  }

  if (data.startsWith("settings_time:")) {
    const parts = data.split(":");
    const hh = parts[1];
    const mm = parts[2];

    if (!ctx.from || !hh || !mm) {
      await ctx.answerCallbackQuery({ text: "Invalid time selection." });
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
      await ctx.reply("I couldn't update your settings right now. Please try again.");
      return;
    }

    await ctx.reply(`✅ Got it! You'll receive your daily words at ${hh}:${mm} Eastern Time.`);
    return;
  }

  if (data.startsWith("settings_level:")) {
    const level = data.slice("settings_level:".length);
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCallbackQuery({ text: "User not found." });
      return;
    }

    const { error } = await supabase.from("users").update({ level }).eq("telegram_id", telegramId);
    if (error) {
      await ctx.answerCallbackQuery({ text: "Could not update level." });
      return;
    }

    await ctx.answerCallbackQuery(`Level updated to ${level}!`);
    return;
  }

  const [action, rawMessageId] = data.split(":");
  const messageId = Number(rawMessageId);
  const chatId = ctx.chat?.id;

  if (!Number.isFinite(messageId) || !chatId) {
    await ctx.answerCallbackQuery({ text: "This action is no longer available." });
    return;
  }

  const meta = getCallbackMeta(chatId, messageId);
  await ctx.answerCallbackQuery();

  if (!meta) {
    await ctx.reply("That button action expired. Send a new message to continue.");
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

  await ctx.reply("That action is not available for this message.");
}
