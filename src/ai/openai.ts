import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { env } from "../config/env";
import { CHAT_MODEL_PRO, TRANSCRIBE_MODEL, TTS_MODEL, chatParams } from "../config/models";
import { parseInterfaceLanguage, type InterfaceLanguage } from "../i18n";
import { normalizeCorrection, shouldKeepCorrection } from "../utils/correction";
import { buildTutorSystemPrompt, normalizeLevel } from "./tutorPrompts";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AssistantResponse = {
  correction: {
    hasMistake: boolean;
    original: string;
    corrected: string;
    explanation: string;
  } | null;
  reply: string;
  replyExplanation: string;
};

export function getVoiceSpeedForLevel(level: string): number {
  const normalized = normalizeLevel(level);
  if (normalized === "beginner") {
    return 0.75;
  }
  return 1.0;
}

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export async function transcribeVoice(fileBuffer: Buffer, mimeType: string, language: string = "es"): Promise<string> {
  const file = await toFile(fileBuffer, "voice-input", { type: mimeType });
  const result = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    language,
  });

  return result.text;
}

export async function generateResponse(
  convo: ChatMessage[],
  targetLang: string,
  model: string = CHAT_MODEL_PRO,
  level: string = "beginner",
  interfaceLanguage: InterfaceLanguage = "en"
): Promise<AssistantResponse> {
  const locale = parseInterfaceLanguage(interfaceLanguage);
  const systemPrompt = buildTutorSystemPrompt(targetLang, level, locale);
  const injectedSystem = convo.filter((m) => m.role === "system").map((m) => m.content);
  const convoMessages = convo.filter((m) => m.role !== "system");
  const combinedSystem =
    injectedSystem.length > 0
      ? `${injectedSystem.join("\n\n")}\n\n---\n\n${systemPrompt}`
      : systemPrompt;

  const completion = await openai.chat.completions.create({
    ...chatParams(model, 0.7),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: combinedSystem },
      ...convoMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  const parsed = JSON.parse(raw);
  if (parsed.correction && (
    typeof parsed.correction.explanation !== "string" ||
    typeof parsed.correction.original !== "string" ||
    typeof parsed.correction.corrected !== "string"
  )) {
    parsed.correction = null;
  }
  const responseSchema = z.object({
    correction: z
      .object({
        hasMistake: z.boolean(),
        original: z.string(),
        corrected: z.string(),
        explanation: z.string(),
      })
      .nullable(),
    reply: z.string().min(1),
    replyExplanation: z.string().min(1),
  });

  const response = responseSchema.parse(parsed);
  const lastUserText = [...convoMessages].reverse().find((message) => message.role === "user")?.content ?? "";
  if (response.correction && !response.correction.hasMistake) {
    console.log("[correction] model-null");
    response.correction = null;
  } else if (response.correction) {
    const keep = shouldKeepCorrection(
      response.correction.original,
      response.correction.corrected,
      lastUserText
    );
    if (!keep) {
      console.log("[correction] dropped by filter");
      response.correction = null;
    } else {
      console.log("[correction] kept");
      const display = normalizeCorrection(
        response.correction.original,
        response.correction.corrected,
        lastUserText
      );
      if (display.mistake) {
        response.correction.original = display.mistake;
      } else if (lastUserText.trim()) {
        response.correction.original = lastUserText.trim();
      }
      response.correction.corrected = display.correctedSentence;
    }
  } else {
    console.log("[correction] model-null");
  }

  return response;
}

export async function generateVoice(
  text: string,
  options?: { voice?: string; speed?: number }
): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: (options?.voice ?? "alloy") as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
    input: text,
    speed: options?.speed ?? 1.0,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
