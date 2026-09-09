import type { Context } from "grammy";
import type { AssistantResponse } from "../../ai/openai";
import { generateVoice, transcribeVoice } from "../../ai/openai";
import { env } from "../../config/env";
import { getLanguageConfig, parseTargetLanguage } from "../../config/languages";
import { supabase } from "../../db/client";
import { conversationNudgeExplanation, getMilestoneMessage, t } from "../../i18n";
import { runModerationGate } from "../../services/moderation";
import { runAssistantTurn } from "../../services/conversation";
import { checkAndIncrementUsage } from "../../services/usage";
import { getOrCreateUserByTelegram, interfaceLocaleOf } from "../../services/users";
import { isInOnboarding } from "../../services/onboarding";
import { handleQuizResponse } from "../../services/quizHandler";
import { isInQuiz } from "../../services/quizState";
import { isTargetLanguage } from "../../utils/languageDetect";
import { sendStructuredUxResponse } from "./ux-flow";

export async function handleVoice(ctx: Context): Promise<void> {
  const voice = ctx.message?.voice;
  const from = ctx.from;

  if (!voice || !from) {
    return;
  }

  const user = await getOrCreateUserByTelegram({
    telegramId: from.id,
    username: from.username ?? null,
    languageCode: from.language_code ?? null,
  });
  const locale = interfaceLocaleOf(user);

  if (user.is_banned) {
    await ctx.reply(t(locale, "account.suspended"));
    return;
  }

  if (isInOnboarding(from.id)) {
    await ctx.reply(t(locale, "onboarding.useButtons"));
    return;
  }

  const targetLang = parseTargetLanguage(user.target_language);
  const whisperLanguage = getLanguageConfig(targetLang).whisperLanguage;

  if (isInQuiz(from.id)) {
    const file = await ctx.api.getFile(voice.file_id);
    if (!file.file_path) {
      await ctx.reply(t(locale, "voice.processFailed"));
      return;
    }

    const telegramFileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const fileResponse = await fetch(telegramFileUrl);
    if (!fileResponse.ok) {
      await ctx.reply(t(locale, "voice.downloadFailed"));
      return;
    }

    const audioBuffer = Buffer.from(await fileResponse.arrayBuffer());
    const transcript = await transcribeVoice(
      audioBuffer,
      voice.mime_type ?? "audio/ogg",
      whisperLanguage
    );
    console.log(`[Voice] Whisper transcript (${targetLang}):`, transcript);
    await handleQuizResponse(ctx, from.id, user.id, transcript, user.is_subscribed, "voice", locale);
    return;
  }

  const file = await ctx.api.getFile(voice.file_id);
  if (!file.file_path) {
    await ctx.reply(t(locale, "voice.processFailed"));
    return;
  }

  const telegramFileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const fileResponse = await fetch(telegramFileUrl);
  if (!fileResponse.ok) {
    await ctx.reply(t(locale, "voice.downloadFailed"));
    return;
  }

  const audioBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const transcript = await transcribeVoice(
    audioBuffer,
    voice.mime_type ?? "audio/ogg",
    whisperLanguage
  );
  console.log(`[Voice] Whisper transcript (${targetLang}):`, transcript);

  const moderation = await runModerationGate({
    userId: user.id,
    text: transcript,
    locale,
    targetLanguage: targetLang,
    api: ctx.api,
  });
  if (moderation.action === "block") {
    await ctx.reply(moderation.reply);
    return;
  }

  const isCorrectLang = await isTargetLanguage(transcript, targetLang);
  if (!isCorrectLang) {
    const nudge = getLanguageConfig(targetLang).conversationNudge;
    const structured: AssistantResponse = {
      correction: null,
      reply: nudge.reply,
      replyExplanation: conversationNudgeExplanation(targetLang, locale),
      followUpQuestion: "",
    };
    const responseVoice = await generateVoice(nudge.reply);
    await sendStructuredUxResponse(ctx, structured, responseVoice, true, undefined, targetLang, locale);
    return;
  }

  const usage = await checkAndIncrementUsage(user.id, "voice");
  if (!usage.allowed) {
    await ctx.reply(t(locale, "quota.voice"));
    return;
  }

  const chatId = ctx.chat?.id;
  const { structured, responseVoice, wrapUpText, reattemptMatched } = await runAssistantTurn(
    user.id,
    targetLang,
    transcript,
    "voice",
    user.is_subscribed,
    locale,
    "beginner",
    { api: ctx.api, chatId, telegramId: from.id }
  );

  if (reattemptMatched) {
    await ctx.reply(t(locale, "correction.reattemptAck"));
  }

  await sendStructuredUxResponse(
    ctx,
    structured,
    responseVoice,
    reattemptMatched,
    undefined,
    targetLang,
    locale,
    from.id
  );

  if (wrapUpText) {
    await ctx.reply(wrapUpText);
  }

  const { data: updatedUser } = await supabase
    .from("users")
    .select("words_learned_count")
    .eq("id", user.id)
    .single();
  const wordsCount = updatedUser?.words_learned_count ?? 0;
  const milestoneMessage = getMilestoneMessage(wordsCount, targetLang, locale);
  if (milestoneMessage) {
    await ctx.reply(milestoneMessage);
  }
}
