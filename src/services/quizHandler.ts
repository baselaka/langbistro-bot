import type { Context } from "grammy";
import { generateResponse, generateVoice } from "../ai/openai";
import { getLanguageConfig, parseTargetLanguage } from "../config/languages";
import { getMilestoneMessage, t, type InterfaceLanguage } from "../i18n";
import { CHAT_MODEL_FREE, CHAT_MODEL_PRO } from "../config/models";
import { supabase } from "../db/client";
import { sendUxFlow } from "../bot/handlers/ux-flow";
import { formatCorrectionMarkdownV2 } from "../utils/correction";
import { escapeMarkdownV2 } from "../utils/markdown";
import { maxReplyCharsForLevel, composeSpokenReply, resolveFollowUpQuestion } from "../utils/replyLength";
import { evaluateFillBlank, evaluateReviewAnswer, recordDailySessionUserTurn } from "./dailySession";
import { processDailyUtterance } from "./dailyLoop";
import { CLOSING_TURN_HINT, unusedWords, unusedWordsPromptInjection } from "./sessionWrapUp";
import { markWordsLearned, recordProductionFailure } from "./vocabulary";
import { clearQuizState, getQuizState } from "./quizState";
import { resolveGloss } from "./vocabGloss";

/** Exported for unit tests. */
export function getQuizMessages(lang: string) {
  return getLanguageConfig(lang).quizMessages;
}

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export async function handleQuizResponse(
  ctx: Context,
  telegramId: number,
  userId: number,
  text: string,
  isSubscribed: boolean,
  messageType: "text" | "voice" = "text",
  locale: InterfaceLanguage = "en"
): Promise<void> {
  const state = getQuizState(telegramId);
  if (!state) {
    return;
  }
  const targetLanguage = parseTargetLanguage(state.targetLanguage);
  const cfg = getLanguageConfig(targetLanguage);
  const quizMessages = cfg.quizMessages;
  const randomCorrect = pickRandom(quizMessages.correct);
  const randomEncouragement = pickRandom(quizMessages.encouragement);
  const randomRetry = pickRandom(quizMessages.retry);

  const isCorrect =
    state.type === "fill_blank"
      ? await evaluateFillBlank(text, state.word, state.sentence, targetLanguage)
      : await evaluateReviewAnswer(text, state.word, targetLanguage);

  const { data: vocabRow } = await supabase
    .from("vocabulary")
    .select("id, translation, language")
    .eq("id", state.vocabularyId)
    .single();
  const translation = vocabRow
    ? await resolveGloss(
        {
          id: vocabRow.id,
          translation: vocabRow.translation ?? null,
          language: vocabRow.language ?? targetLanguage,
        },
        locale
      )
    : "";

  const { data: userRowForTz } = await supabase
    .from("users")
    .select("preferred_word_timezone")
    .eq("id", userId)
    .single();
  const timezone = userRowForTz?.preferred_word_timezone ?? "America/New_York";
  const chatId = ctx.chat?.id;
  const loop = await processDailyUtterance({
    userId,
    timezone,
    locale,
    text,
    api: ctx.api,
    chatId,
  });

  const contextInjection = isCorrect
    ? `[QUIZ CONTEXT: The user answered a ${cfg.name} quiz correctly.
Quiz type: ${state.type}
Target word: ${state.word}
User answer: ${text}

Instructions:
- Start with "${randomCorrect}" and include "${randomEncouragement}"
- Give brief genuine encouragement in ${cfg.name} (1 sentence max)
- Naturally transition into a conversational question related to the word topic
- End with "${cfg.quizOutro}" to give them an out
- Keep it warm and natural, not robotic
- Do NOT say the answer was wrong or tell them to try again
- Do NOT show any correction — there is none needed
- Always return "correction": null in your JSON response
- Do NOT set correction — set it to null]`
    : `[QUIZ CONTEXT: The user answered a ${cfg.name} quiz incorrectly.
Quiz type: ${state.type}
Target word: ${state.word}
User answer: ${text}

Instructions:
- Do NOT correct grammar — only address the quiz answer
- Do NOT say anything encouraging — the user got it wrong
- Start your response with "${randomRetry}" and acknowledge they got it wrong, warmly but clearly
- Naturally transition into a conversational question related to the word topic
- End with "${cfg.quizOutro}" to give them an out
- Keep it warm and natural, not robotic
- Always return "correction": null in your JSON response
- Do NOT set correction — set it to null]`;

  const { data: historyRows, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (historyError) {
    throw new Error(`Failed to fetch conversation history: ${historyError.message}`);
  }

  const dbMessages = historyRows ?? [];
  const systemExtras: Array<{ role: "system"; content: string }> = [
    { role: "system", content: contextInjection },
  ];
  if (loop.closingTurn) {
    systemExtras.push({ role: "system", content: CLOSING_TURN_HINT });
  } else if (!loop.session.completed_at) {
    const leftover = unusedWords(loop.wordsSent, loop.wordsUsed);
    const injection = unusedWordsPromptInjection(leftover);
    if (injection) {
      systemExtras.push({ role: "system", content: injection });
    }
  }

  const messagesForGpt = [
    ...systemExtras,
    ...dbMessages.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: text },
  ];

  const model = isSubscribed ? CHAT_MODEL_PRO : CHAT_MODEL_FREE;
  const structuredResponse = await generateResponse(messagesForGpt, targetLanguage, model, "beginner", locale);

  const maxChars = maxReplyCharsForLevel("beginner");
  const followUp = resolveFollowUpQuestion(structuredResponse.followUpQuestion, targetLanguage, {
    closingTurn: loop.closingTurn,
  });
  structuredResponse.followUpQuestion = followUp;
  structuredResponse.reply = composeSpokenReply(structuredResponse.reply, followUp, maxChars);

  const { error: saveError } = await supabase.from("messages").insert([
    {
      user_id: userId,
      role: "user",
      content: text,
      message_type: messageType,
    },
    {
      user_id: userId,
      role: "assistant",
      content: structuredResponse.reply,
      message_type: "text",
    },
  ]);

  if (saveError) {
    throw new Error(`Failed to save quiz messages: ${saveError.message}`);
  }

  await recordDailySessionUserTurn(userId);

  clearQuizState(telegramId);

  if (isCorrect) {
    const alreadyGraded = loop.newlyMatched.some((w) => w.id === state.vocabularyId);
    if (!alreadyGraded) {
      await markWordsLearned(userId, [state.vocabularyId]);
    }
  } else {
    const wasDue = loop.wordsSent.some((w) => w.id === state.vocabularyId && w.kind === "due");
    if (wasDue) {
      await recordProductionFailure(userId, [state.vocabularyId]);
    }
  }

  const { data: userRow } = await supabase.from("users").select("words_learned_count").eq("id", userId).single();
  const wordsLearnedCount = userRow?.words_learned_count ?? 0;
  const milestoneMessage = getMilestoneMessage(wordsLearnedCount, targetLanguage, locale);
  if (milestoneMessage) {
    await ctx.reply(milestoneMessage);
  }

  structuredResponse.correction = null;
  if (!isCorrect) {
    const corrected = state.sentence?.trim() || state.word;
    const wrongText = formatCorrectionMarkdownV2(text, corrected, escapeMarkdownV2);
    await ctx.reply(wrongText, { parse_mode: "MarkdownV2" });
  }

  const explanationOverride = isCorrect
    ? t(locale, "quiz.correctExplain", {
        praise: randomCorrect,
        word: state.word,
        translation,
        encouragement: randomEncouragement,
      })
    : t(locale, "quiz.wrongExplain", {
        encouragement: randomRetry,
        word: state.word,
        translation,
      });

  const responseVoice = await generateVoice(structuredResponse.reply);
  await sendUxFlow(ctx, structuredResponse, responseVoice, true, explanationOverride, targetLanguage, locale);

  if (loop.wrapUpText) {
    await ctx.reply(loop.wrapUpText);
  }
}
