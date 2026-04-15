import type { Context } from "grammy";
import { generateResponse, generateVoice } from "../ai/openai";
import { supabase } from "../db/client";
import { sendUxFlow } from "../bot/handlers/ux-flow";
import { evaluateFillBlank, evaluateReviewAnswer } from "./dailySession";
import { getMilestoneMessage, markWordsLearned } from "./vocabulary";
import { clearQuizState, getQuizState } from "./quizState";

const QUIZ_MESSAGES = {
  es: {
    correct: [
      "¡Correcto! 🎉",
      "¡Muy bien! ✨",
      "¡Exacto! 🌟",
      "¡Perfecto! 💪",
      "¡Excelente! 🎯",
    ],
    encouragement: [
      "¡Sigue así! 💪",
      "¡Tú puedes! 🌟",
      "¡Casi! Inténtalo de nuevo 😊",
    ],
  },
  fr: {
    correct: [
      "Correct ! 🎉",
      "Très bien ! ✨",
      "Exactement ! 🌟",
      "Parfait ! 💪",
      "Excellent ! 🎯",
    ],
    encouragement: [
      "Continue comme ça ! 💪",
      "Tu y arrives ! 🌟",
      "Presque ! Réessaie 😊",
    ],
  },
};

function getQuizMessages(lang: string) {
  return QUIZ_MESSAGES[lang as keyof typeof QUIZ_MESSAGES]
    ?? QUIZ_MESSAGES.es;
}

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export async function handleQuizResponse(
  ctx: Context,
  telegramId: number,
  userId: number,
  text: string,
  isSubscribed: boolean,
  messageType: "text" | "voice" = "text"
): Promise<void> {
  const state = getQuizState(telegramId);
  if (!state) {
    return;
  }
  const targetLanguage = state.targetLanguage ?? "es";
  const quizMessages = getQuizMessages(targetLanguage);
  const randomCorrect = pickRandom(quizMessages.correct);
  const randomEncouragement = pickRandom(quizMessages.encouragement);

  const isCorrect =
    state.type === "fill_blank"
      ? await evaluateFillBlank(text, state.word)
      : await evaluateReviewAnswer(text, state.word);

  const { data: vocabRow } = await supabase
    .from("vocabulary")
    .select("translation")
    .eq("id", state.vocabularyId)
    .single();
  const translation = vocabRow?.translation ?? "";

  const contextInjection = isCorrect
    ? `[QUIZ CONTEXT: The user answered a ${targetLanguage === "fr" ? "French" : "Spanish"} quiz correctly.
Quiz type: ${state.type}
Target word: ${state.word}
User answer: ${text}

Instructions:
- Start with "${randomCorrect}" and include "${randomEncouragement}"
- Give brief genuine encouragement in ${targetLanguage === "fr" ? "French" : "Spanish"} (1 sentence max)
- Naturally transition into a conversational question related to the word topic
- End with "${targetLanguage === "fr" ? "Ou tu préfères parler d'autre chose ?" : "¿O prefieres hablar de otra cosa?"}" to give them an out
- Keep it warm and natural, not robotic
- Do NOT show any correction — there is none needed
- Always return "correction": null in your JSON response
- Do NOT set correction — set it to null]`
    : `[QUIZ CONTEXT: The user answered a ${targetLanguage === "fr" ? "French" : "Spanish"} quiz incorrectly.
Quiz type: ${state.type}
Target word: ${state.word}
User answer: ${text}

Instructions:
- Do NOT correct grammar — only address the quiz answer
- Do NOT say anything encouraging — the user got it wrong
- Start your response with "${randomEncouragement}" and acknowledge they got it wrong, warmly but clearly
- Naturally transition into a conversational question related to the word topic
- End with "${targetLanguage === "fr" ? "Ou tu préfères parler d'autre chose ?" : "¿O prefieres hablar de otra cosa?"}" to give them an out
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
  const messagesForGpt = [
    { role: "system" as const, content: contextInjection },
    ...dbMessages.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: text },
  ];

  const model = isSubscribed ? "gpt-4o" : "gpt-4o-mini";
  const structuredResponse = await generateResponse(messagesForGpt, targetLanguage, model);

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

  clearQuizState(telegramId);

  if (isCorrect) {
    await markWordsLearned(userId, [state.vocabularyId]);
  }

  const { data: userRow } = await supabase.from("users").select("words_learned_count").eq("id", userId).single();
  const wordsLearnedCount = userRow?.words_learned_count ?? 0;
  const milestoneMessage = getMilestoneMessage(wordsLearnedCount);
  if (milestoneMessage) {
    await ctx.reply(milestoneMessage);
  }

  structuredResponse.correction = null;
  if (!isCorrect) {
    const wrongText = `~${escapeMarkdownV2(text)}~ → *${escapeMarkdownV2(state.word)}*`;
    await ctx.reply(wrongText, { parse_mode: "MarkdownV2" });
  }

  const explanationOverride = isCorrect
    ? `${randomCorrect} "${state.word}" means "${translation}". ${randomEncouragement}`
    : `${randomEncouragement} The correct answer was "${state.word}" — it means "${translation}".`;

  const responseVoice = await generateVoice(structuredResponse.reply);
  await sendUxFlow(ctx, structuredResponse, responseVoice, true, explanationOverride, targetLanguage);
}
