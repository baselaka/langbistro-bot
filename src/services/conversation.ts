import type { Api } from "grammy";
import { AssistantResponse, ChatMessage, generateResponse, generateVoice, getVoiceSpeedForLevel } from "../ai/openai";
import { CHAT_MODEL_FREE, CHAT_MODEL_PRO } from "../config/models";
import { supabase } from "../db/client";
import { parseInterfaceLanguage, type InterfaceLanguage } from "../i18n";
import { processDailyUtterance } from "./dailyLoop";
import { recordDailySessionUserTurn } from "./dailySession";
import { CLOSING_TURN_HINT, unusedWords, unusedWordsPromptInjection } from "./sessionWrapUp";

type MessageType = "text" | "voice";

type AssistantTurnResult = {
  structured: AssistantResponse;
  responseVoice: Buffer;
  wrapUpText: string | null;
};

export async function runAssistantTurn(
  userId: number,
  targetLanguage: string,
  userContent: string,
  userMessageType: MessageType,
  isSubscribed: boolean,
  interfaceLanguage: InterfaceLanguage = "en",
  level: string = "beginner",
  options?: {
    api?: Api;
    chatId?: number;
  }
): Promise<AssistantTurnResult> {
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("level, interface_language, preferred_word_timezone")
    .eq("id", userId)
    .single();
  if (userError) {
    throw new Error(`Failed to fetch user level: ${userError.message}`);
  }
  const effectiveLevel = userRow?.level ?? level ?? "beginner";
  const locale = parseInterfaceLanguage(userRow?.interface_language, interfaceLanguage);
  const timezone = userRow?.preferred_word_timezone ?? "America/New_York";

  const loop = await processDailyUtterance({
    userId,
    timezone,
    locale,
    text: userContent,
    api: options?.api,
    chatId: options?.chatId,
  });

  const { data: historyRows, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (historyError) {
    throw new Error(`Failed to fetch conversation history: ${historyError.message}`);
  }

  const history: ChatMessage[] = (historyRows ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    }));

  const systemExtras: ChatMessage[] = [];
  if (loop.closingTurn) {
    systemExtras.push({ role: "system", content: CLOSING_TURN_HINT });
  } else if (!loop.session.completed_at) {
    const leftover = unusedWords(loop.wordsSent, loop.wordsUsed);
    const injection = unusedWordsPromptInjection(leftover);
    if (injection) {
      systemExtras.push({ role: "system", content: injection });
    }
  }

  const model = isSubscribed ? CHAT_MODEL_PRO : CHAT_MODEL_FREE;
  const structured = await generateResponse(
    [...systemExtras, ...history, { role: "user", content: userContent }],
    targetLanguage,
    model,
    effectiveLevel,
    locale
  );

  const { error: saveMessagesError } = await supabase.from("messages").insert([
    {
      user_id: userId,
      role: "user",
      content: userContent,
      message_type: userMessageType,
    },
    {
      user_id: userId,
      role: "assistant",
      content: structured.reply,
      message_type: "text",
    },
  ]);

  if (saveMessagesError) {
    throw new Error(`Failed to save conversation messages: ${saveMessagesError.message}`);
  }

  await recordDailySessionUserTurn(userId);

  const responseVoice = await generateVoice(structured.reply, {
    speed: getVoiceSpeedForLevel(effectiveLevel),
  });
  return { structured, responseVoice, wrapUpText: loop.wrapUpText };
}
