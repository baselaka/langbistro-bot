import type { Context } from "grammy";
import { transcribeVoice } from "../../ai/openai";
import { env } from "../../config/env";
import { checkViolation, handleViolation } from "../../services/moderation";
import { runAssistantTurn } from "../../services/conversation";
import { checkAndIncrementUsage } from "../../services/usage";
import { getOrCreateUserByTelegram } from "../../services/users";
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

  const usage = await checkAndIncrementUsage(user.id, "voice");
  if (!usage.allowed) {
    await ctx.reply(
      "You reached today's free voice limit (3/day). Upgrade to continue unlimited voice practice."
    );
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
  const transcript = await transcribeVoice(audioBuffer, voice.mime_type ?? "audio/ogg");

  const moderation = await checkViolation(transcript);
  if (moderation.flagged) {
    const violationReply = await handleViolation(user.id, moderation.violationType ?? "restricted_content");
    await ctx.reply(violationReply);
    return;
  }

  const { structured, responseVoice } = await runAssistantTurn(
    user.id,
    user.language_code ?? "es",
    transcript,
    "voice"
  );

  await sendStructuredUxResponse(ctx, structured, responseVoice);
}
