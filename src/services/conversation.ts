import { AssistantResponse, ChatMessage, generateResponse, generateVoice, getVoiceSpeedForLevel } from "../ai/openai";
import { supabase } from "../db/client";

type MessageType = "text" | "voice";

type AssistantTurnResult = {
  structured: AssistantResponse;
  responseVoice: Buffer;
};

export async function runAssistantTurn(
  userId: number,
  targetLanguage: string,
  userContent: string,
  userMessageType: MessageType,
  isSubscribed: boolean,
  level: string = "beginner"
): Promise<AssistantTurnResult> {
  const { data: userRow, error: userError } = await supabase.from("users").select("level").eq("id", userId).single();
  if (userError) {
    throw new Error(`Failed to fetch user level: ${userError.message}`);
  }
  const effectiveLevel = userRow?.level ?? level ?? "beginner";

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

  const model = isSubscribed ? "gpt-4o" : "gpt-4o-mini";
  const structured = await generateResponse(
    [...history, { role: "user", content: userContent }],
    targetLanguage,
    model,
    effectiveLevel
  );
  console.log(`[Conv] GPT correction:`, JSON.stringify(structured.correction));

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

  const responseVoice = await generateVoice(structured.reply, {
    speed: getVoiceSpeedForLevel(effectiveLevel),
  });
  return { structured, responseVoice };
}
