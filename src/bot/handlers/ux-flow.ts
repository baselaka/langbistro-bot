import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { AssistantResponse } from "../../ai/openai";
import { storeCorrectionExplanation, storeReplyMeta } from "../ux-memory";

function escapeMarkdownV2(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export async function sendStructuredUxResponse(
  ctx: Context,
  structured: AssistantResponse,
  responseVoice: Buffer
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  if (structured.correction) {
    const original = escapeMarkdownV2(structured.correction.original);
    const corrected = escapeMarkdownV2(structured.correction.corrected);
    const correctionText = `~${original}~ \\-\\> *${corrected}*`;
    const correctionKeyboard = new InlineKeyboard().text(
      "💡 Explain",
      "explain_correction:pending"
    );

    const correctionMessage = await ctx.reply(correctionText, {
      parse_mode: "MarkdownV2",
      reply_markup: correctionKeyboard,
    });

    const correctionMessageId = correctionMessage.message_id;
    storeCorrectionExplanation(correctionMessageId, structured.correction.explanation);

    await ctx.api.editMessageReplyMarkup(chatId, correctionMessageId, {
      reply_markup: new InlineKeyboard().text(
        "💡 Explain",
        `explain_correction:${correctionMessageId}`
      ),
    });
  } else {
    await ctx.reply("¡Muy bien! ¡Sigue asi!");
  }

  const voiceMessage = await ctx.replyWithVoice(new InputFile(responseVoice, "bistro-response.mp3"), {
    reply_markup: new InlineKeyboard()
      .text("📖 Read", "read_reply:pending")
      .text("💡 Explain", "explain_reply:pending"),
  });

  const voiceMessageId = voiceMessage.message_id;
  storeReplyMeta(voiceMessageId, structured.reply, structured.replyExplanation);
  await ctx.api.editMessageReplyMarkup(chatId, voiceMessageId, {
    reply_markup: new InlineKeyboard()
      .text("📖 Read", `read_reply:${voiceMessageId}`)
      .text("💡 Explain", `explain_reply:${voiceMessageId}`),
  });
}
