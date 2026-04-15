import type { Context } from "grammy";
import type { AssistantResponse } from "../../ai/openai";
import { generateVoice, transcribeVoice } from "../../ai/openai";
import { env } from "../../config/env";
import { supabase } from "../../db/client";
import { checkViolation, handleViolation } from "../../services/moderation";
import { getMilestoneMessage } from "../../services/vocabulary";
import { runAssistantTurn } from "../../services/conversation";
import { checkAndIncrementUsage } from "../../services/usage";
import { getOrCreateUserByTelegram } from "../../services/users";
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

  if (user.is_banned) {
    await ctx.reply(
      "Your account is currently suspended. Please contact @langbistro_support if you believe this is a mistake."
    );
    return;
  }

  if (isInOnboarding(from.id)) {
    await ctx.reply("Please use the buttons above to complete your setup first.");
    return;
  }

  if (isInQuiz(from.id)) {
    const file = await ctx.api.getFile(voice.file_id);
    if (!file.file_path) {
      await ctx.reply("I couldn't process that voice message. Please try again.");
      return;
    }

    const telegramFileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const fileResponse = await fetch(telegramFileUrl);
    if (!fileResponse.ok) {
      await ctx.reply("I couldn't download your voice message. Please try again.");
      return;
    }

    const audioBuffer = Buffer.from(await fileResponse.arrayBuffer());
    const transcript = await transcribeVoice(
      audioBuffer,
      voice.mime_type ?? "audio/ogg",
      user.target_language ?? "es"
    );
    await handleQuizResponse(ctx, from.id, user.id, transcript, user.is_subscribed, "voice");
    return;
  }

  const file = await ctx.api.getFile(voice.file_id);
  if (!file.file_path) {
    await ctx.reply("I couldn't process that voice message. Please try again.");
    return;
  }

  const telegramFileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const fileResponse = await fetch(telegramFileUrl);
  if (!fileResponse.ok) {
    await ctx.reply("I couldn't download your voice message. Please try again.");
    return;
  }

  const audioBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const transcript = await transcribeVoice(
    audioBuffer,
    voice.mime_type ?? "audio/ogg",
    user.target_language ?? "es"
  );

  const moderation = await checkViolation(transcript);
  if (moderation.flagged) {
    const violationReply = await handleViolation(user.id, moderation.violationType ?? "restricted_content");
    await ctx.reply(violationReply);
    return;
  }

  const targetLang = (user.target_language ?? "es") as "es" | "fr";
  const isCorrectLang = await isTargetLanguage(transcript, targetLang);
  if (!isCorrectLang) {
    const nudgeText = (user.target_language ?? "es") === "fr"
      ? "Essaie en français ! 😊 Ce n'est pas grave si tu fais des erreurs."
      : "¡Inténtalo en español! 😊 No importa si cometes errores.";
    const structured: AssistantResponse = {
      correction: null,
      reply: nudgeText,
      replyExplanation: "I encouraged you to try replying in Spanish.",
    };
    const responseVoice = await generateVoice(nudgeText);
    await sendStructuredUxResponse(ctx, structured, responseVoice, true, undefined, user.target_language ?? "es");
    return;
  }

  const usage = await checkAndIncrementUsage(user.id, "voice");
  if (!usage.allowed) {
    await ctx.reply(
      "You reached today's free voice limit (3/day). Upgrade to continue unlimited voice practice."
    );
    return;
  }

  const { structured, responseVoice } = await runAssistantTurn(
    user.id,
    user.target_language ?? "es",
    transcript,
    "voice",
    user.is_subscribed
  );

  await sendStructuredUxResponse(ctx, structured, responseVoice, false, undefined, user.target_language ?? "es");

  const { data: updatedUser } = await supabase
    .from("users")
    .select("words_learned_count")
    .eq("id", user.id)
    .single();
  const wordsCount = updatedUser?.words_learned_count ?? 0;
  const milestoneMessage = getMilestoneMessage(wordsCount);
  if (milestoneMessage) {
    await ctx.reply(milestoneMessage);
  }
}
