import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { AssistantResponse } from "../../ai/openai";
import { getLanguageConfig, parseTargetLanguage } from "../../config/languages";
import { t, tMd2, type InterfaceLanguage } from "../../i18n";
import { invitePhraseFromCorrection } from "../../utils/correction";
import { storeCorrectionExplanation, storePendingCorrection, storeReplyMeta } from "../ux-memory";

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export async function sendUxFlow(
  ctx: Context,
  structured: AssistantResponse,
  voiceBuffer: Buffer,
  skipEncouragement = false,
  explanationOverride?: string,
  targetLang = "es",
  interfaceLang: InterfaceLanguage = "en",
  telegramId?: number
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  if (structured.correction) {
    const phrase = invitePhraseFromCorrection(
      structured.correction.original,
      structured.correction.corrected
    );
    const correctionText = tMd2(interfaceLang, "correction.invite", { phrase });
    const correctionKeyboard = new InlineKeyboard().text(
      t(interfaceLang, "button.explain"),
      "explain_correction:pending"
    );

    const correctionMessage = await ctx.reply(correctionText, {
      parse_mode: "MarkdownV2",
      reply_markup: correctionKeyboard,
    });

    const correctionMessageId = correctionMessage.message_id;
    storeCorrectionExplanation(chatId, correctionMessageId, structured.correction.explanation);

    if (telegramId != null) {
      storePendingCorrection(telegramId, {
        correctedPhrase: phrase,
        correctedSentence: structured.correction.corrected,
      });
    }

    await ctx.api.editMessageReplyMarkup(chatId, correctionMessageId, {
      reply_markup: new InlineKeyboard().text(
        t(interfaceLang, "button.explain"),
        `explain_correction:${correctionMessageId}`
      ),
    });
  } else if (!skipEncouragement) {
    const cfg = getLanguageConfig(parseTargetLanguage(targetLang));
    const encouragement = pickRandom(cfg.conversationEncouragement);
    await ctx.reply(encouragement);
  }

  const voiceMessage = await ctx.replyWithVoice(new InputFile(voiceBuffer, "bistro-response.mp3"), {
    reply_markup: new InlineKeyboard()
      .text(t(interfaceLang, "button.read"), "read_reply:pending")
      .text(t(interfaceLang, "button.explain"), "explain_reply:pending"),
  });

  const voiceMessageId = voiceMessage.message_id;
  const explanationToStore = explanationOverride ?? structured.replyExplanation;
  storeReplyMeta(chatId, voiceMessageId, structured.reply, explanationToStore);
  await ctx.api.editMessageReplyMarkup(chatId, voiceMessageId, {
    reply_markup: new InlineKeyboard()
      .text(t(interfaceLang, "button.read"), `read_reply:${voiceMessageId}`)
      .text(t(interfaceLang, "button.explain"), `explain_reply:${voiceMessageId}`),
  });
}

export const sendStructuredUxResponse = sendUxFlow;
