import { randomBytes } from "node:crypto";
import { InlineKeyboard, InputFile, type Context } from "grammy";
import { generateVoice, openai } from "../ai/openai";
import { supabase } from "../db/client";

const ONBOARDING_SENTENCE_1 = "¿Cómo te llamas y cuántos años tienes?";
const ONBOARDING_SENTENCE_2 = "Ayer fui al mercado y compré frutas frescas. ¿Qué compraste tú?";
const ONBOARDING_SENTENCE_3 =
  "Si pudieras vivir en cualquier país del mundo, ¿dónde vivirías y por qué?";

const readPayloadByToken = new Map<string, string>();
const MAX_READ_PAYLOAD_ENTRIES = 2000;

function buildOnboardingReadCallbackData(text: string): string {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  const inline = `read_onboarding:${b64}`;
  if (Buffer.byteLength(inline, "utf8") <= 64) {
    return inline;
  }
  if (readPayloadByToken.size >= MAX_READ_PAYLOAD_ENTRIES) {
    const first = readPayloadByToken.keys().next().value;
    if (first !== undefined) {
      readPayloadByToken.delete(first);
    }
  }
  let token: string;
  do {
    token = randomBytes(5).toString("base64url");
  } while (readPayloadByToken.has(token));
  readPayloadByToken.set(token, text);
  return `read_onboarding:t.${token}`;
}

/** Resolves read_onboarding callback payload (inline base64 text or t. token map). */
export function resolveOnboardingReadCallbackData(data: string): string | null {
  if (!data.startsWith("read_onboarding:")) {
    return null;
  }
  const rest = data.slice("read_onboarding:".length);
  if (rest.startsWith("t.")) {
    return readPayloadByToken.get(rest.slice(2)) ?? null;
  }
  try {
    const decoded = Buffer.from(rest, "base64").toString("utf8");
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

async function sendVoiceWithRead(ctx: Context, text: string): Promise<void> {
  const audio = await generateVoice(text);
  const callbackData = buildOnboardingReadCallbackData(text);
  const keyboard = new InlineKeyboard().text("📖 Read", callbackData);
  await ctx.replyWithVoice(new InputFile(audio, "onboarding.mp3"), { reply_markup: keyboard });
}

export type OnboardingState = {
  step: 0 | 1 | 2;
  responses: string[];
};

const MAX_ENTRIES = 1000;
const onboardingByTelegramId = new Map<number, OnboardingState>();

function setOnboardingState(telegramId: number, state: OnboardingState): void {
  if (!onboardingByTelegramId.has(telegramId) && onboardingByTelegramId.size >= MAX_ENTRIES) {
    const oldest = onboardingByTelegramId.keys().next().value as number | undefined;
    if (oldest !== undefined) {
      onboardingByTelegramId.delete(oldest);
    }
  }
  onboardingByTelegramId.set(telegramId, state);
}

export function isInOnboarding(telegramId: number): boolean {
  return onboardingByTelegramId.has(telegramId);
}

export async function isOnboardingComplete(userId: number): Promise<boolean> {
  const { data, error } = await supabase.from("users").select("onboarding_complete").eq("id", userId).single();

  if (error) {
    throw new Error(`Failed to read onboarding status: ${error.message}`);
  }

  return Boolean(data?.onboarding_complete);
}

export async function startOnboarding(ctx: Context, telegramId: number): Promise<void> {
  const initial: OnboardingState = { step: 0, responses: [] };
  setOnboardingState(telegramId, initial);

  await ctx.reply(
    `¡Hola! I'm Bistro, your Spanish tutor. Before we start, I'd like to get a sense of your Spanish level.

I'll send you 3 short sentences. Just respond naturally — there are no wrong answers!

You'll hear each prompt in Spanish (tap 📖 Read under any voice note to see the text). Reply in Spanish after each one!`
  );

  await sendVoiceWithRead(ctx, ONBOARDING_SENTENCE_1);
}

export async function evaluateOnboarding(
  responses: string[],
  isSubscribed: boolean
): Promise<"beginner" | "intermediate" | "advanced"> {
  const model = isSubscribed ? "gpt-4o" : "gpt-4o-mini";
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are evaluating a Spanish learner's level based on 3 responses.
Respond with exactly one word: beginner, intermediate, or advanced.
beginner: little to no Spanish, mostly English responses or very basic words.
intermediate: can form sentences, some errors, understands basic structure.
advanced: confident sentences, good grammar, complex structures attempted.`,
      },
      {
        role: "user",
        content: `Here are the learner's 3 responses (in order):\n\n1. ${responses[0] ?? ""}\n\n2. ${responses[1] ?? ""}\n\n3. ${responses[2] ?? ""}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? "beginner";
  if (raw.includes("advanced")) {
    return "advanced";
  }
  if (raw.includes("intermediate")) {
    return "intermediate";
  }
  return "beginner";
}

export async function completeOnboarding(userId: number, level: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({
      level,
      onboarding_complete: true,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to complete onboarding: ${error.message}`);
  }
}

export async function handleOnboardingResponse(
  ctx: Context,
  telegramId: number,
  userId: number,
  text: string,
  isSubscribed: boolean
): Promise<boolean> {
  const state = onboardingByTelegramId.get(telegramId);
  if (!state) {
    return false;
  }

  const nextResponses = [...state.responses, text];

  if (state.step === 0) {
    setOnboardingState(telegramId, { step: 1, responses: nextResponses });
    await sendVoiceWithRead(ctx, ONBOARDING_SENTENCE_2);
    return false;
  }

  if (state.step === 1) {
    setOnboardingState(telegramId, { step: 2, responses: nextResponses });
    await sendVoiceWithRead(ctx, ONBOARDING_SENTENCE_3);
    return false;
  }

  // step === 2: this message is the third response
  const allResponses = [...state.responses, text];
  const level = await evaluateOnboarding(allResponses, isSubscribed);
  await completeOnboarding(userId, level);

  await ctx.reply(
    `Thanks for your answers! Based on what you wrote, I'm placing you at the ${level} level for now. We can always adjust as you improve — let's start practicing!`
  );

  const closingVoiceScripts: Record<"beginner" | "intermediate" | "advanced", string> = {
    beginner: "¡Hola! Soy Bistro, tu tutor de español. ¡Empecemos! ¿Cómo te llamas?",
    intermediate: "¡Hola! Soy Bistro. ¡Vamos a practicar! ¿De dónde eres?",
    advanced: "¡Hola! Soy Bistro. ¡Comencemos! ¿Qué te motivó a aprender español?",
  };
  const closingScript = closingVoiceScripts[level] ?? closingVoiceScripts.beginner;
  await sendVoiceWithRead(ctx, closingScript);

  onboardingByTelegramId.delete(telegramId);
  return true;
}
