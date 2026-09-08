import type { Context } from "grammy";
import type { AssistantResponse } from "../../ai/openai";
import { generateVoice } from "../../ai/openai";
import { getLanguageConfig, parseTargetLanguage } from "../../config/languages";
import { checkViolation, handleViolation } from "../../services/moderation";
import { conversationNudgeExplanation, getMilestoneMessage, t } from "../../i18n";
import { checkAndIncrementUsage } from "../../services/usage";
import { getOrCreateUserByTelegram, interfaceLocaleOf } from "../../services/users";
import { runAssistantTurn } from "../../services/conversation";
import { isInOnboarding } from "../../services/onboarding";
import { handleQuizResponse } from "../../services/quizHandler";
import { isInQuiz } from "../../services/quizState";
import { supabase } from "../../db/client";
import { isTargetLanguage } from "../../utils/languageDetect";
import { sendStructuredUxResponse } from "./ux-flow";

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  const from = ctx.from;

  if (!text || !from) {
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

  if (isInQuiz(from.id)) {
    await handleQuizResponse(ctx, from.id, user.id, text, user.is_subscribed, "text", locale);
    return;
  }

  const targetLang = parseTargetLanguage(user.target_language);
  const moderation = await checkViolation(text);
  if (moderation.flagged) {
    const violationReply = await handleViolation(
      user.id,
      moderation.violationType ?? "restricted_content",
      targetLang,
      locale
    );
    await ctx.reply(violationReply);
    return;
  }

  const isCorrectLang = await isTargetLanguage(text, targetLang);
  if (!isCorrectLang) {
    const nudge = getLanguageConfig(targetLang).conversationNudge;
    const structured: AssistantResponse = {
      correction: null,
      reply: nudge.reply,
      replyExplanation: conversationNudgeExplanation(targetLang, locale),
    };
    const responseVoice = await generateVoice(nudge.reply);
    await sendStructuredUxResponse(ctx, structured, responseVoice, true, undefined, targetLang, locale);
    return;
  }

  const usage = await checkAndIncrementUsage(user.id, "text");
  if (!usage.allowed) {
    await ctx.reply(t(locale, "quota.text"));
    return;
  }

  const chatId = ctx.chat?.id;
  const { structured, responseVoice, wrapUpText, reattemptMatched } = await runAssistantTurn(
    user.id,
    targetLang,
    text,
    "text",
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
    false,
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
