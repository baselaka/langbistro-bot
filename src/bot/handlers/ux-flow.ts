import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { AssistantResponse } from "../../ai/openai";
import { formatCorrectionMarkdownV2 } from "../../utils/correction";
import { storeCorrectionExplanation, storeReplyMeta } from "../ux-memory";

const CONVERSATION_ENCOURAGEMENT: Record<string, string[]> = {
  es: [
    "¡Muy bien! 🌟",
    "¡Excelente! ✨",
    "¡Perfecto! 💪",
    "¡Sigue así! 🎯",
    "¡Genial! 🎉",
  ],
  fr: [
    "Très bien ! 🌟",
    "Excellent ! ✨",
    "Parfait ! 💪",
    "Continue ! 🎯",
    "Génial ! 🎉",
  ],
};

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeMarkdownV2(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export async function sendUxFlow(
  ctx: Context,
  structured: AssistantResponse,
  voiceBuffer: Buffer,
  skipEncouragement = false,
  explanationOverride?: string,
  targetLang = "es"
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  if (structured.correction) {
    const correctionText = formatCorrectionMarkdownV2(
      structured.correction.original,
      structured.correction.corrected,
      escapeMarkdownV2
    );
    const correctionKeyboard = new InlineKeyboard().text(
      "💡 Explain",
      "explain_correction:pending"
    );

    const correctionMessage = await ctx.reply(correctionText, {
      parse_mode: "MarkdownV2",
      reply_markup: correctionKeyboard,
    });

    const correctionMessageId = correctionMessage.message_id;
    storeCorrectionExplanation(chatId, correctionMessageId, structured.correction.explanation);

    await ctx.api.editMessageReplyMarkup(chatId, correctionMessageId, {
      reply_markup: new InlineKeyboard().text(
        "💡 Explain",
        `explain_correction:${correctionMessageId}`
      ),
    });
  } else if (!skipEncouragement) {
    const lang = CONVERSATION_ENCOURAGEMENT[targetLang] ? targetLang : "es";
    const encouragement = pickRandom(CONVERSATION_ENCOURAGEMENT[lang]);
    await ctx.reply(encouragement);
  }

  const voiceMessage = await ctx.replyWithVoice(new InputFile(voiceBuffer, "bistro-response.mp3"), {
    reply_markup: new InlineKeyboard()
      .text("📖 Read", "read_reply:pending")
      .text("💡 Explain", "explain_reply:pending"),
  });

  const voiceMessageId = voiceMessage.message_id;
  const explanationToStore = explanationOverride ?? structured.replyExplanation;
  storeReplyMeta(chatId, voiceMessageId, structured.reply, explanationToStore);
  await ctx.api.editMessageReplyMarkup(chatId, voiceMessageId, {
    reply_markup: new InlineKeyboard()
      .text("📖 Read", `read_reply:${voiceMessageId}`)
      .text("💡 Explain", `explain_reply:${voiceMessageId}`),
  });
}

export const sendStructuredUxResponse = sendUxFlow;
