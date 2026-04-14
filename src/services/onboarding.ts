import { randomBytes } from "node:crypto";
import { InlineKeyboard, InputFile, type Context } from "grammy";
import { generateVoice, getVoiceSpeedForLevel } from "../ai/openai";
import { supabase } from "../db/client";
import { etToUtc } from "../utils/timeConvert";

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

async function sendVoiceWithRead(ctx: Context, text: string, level: string = "intermediate"): Promise<void> {
  const audio = await generateVoice(text, {
    speed: getVoiceSpeedForLevel(level),
  });
  const callbackData = buildOnboardingReadCallbackData(text);
  const keyboard = new InlineKeyboard().text("📖 Read", callbackData);
  await ctx.replyWithVoice(new InputFile(audio, "onboarding.mp3"), { reply_markup: keyboard });
}

const onboardingInProgress = new Set<number>();

export function isInOnboarding(telegramId: number): boolean {
  return onboardingInProgress.has(telegramId);
}

export function addToOnboarding(telegramId: number): void {
  onboardingInProgress.add(telegramId);
}

export function removeFromOnboarding(telegramId: number): void {
  onboardingInProgress.delete(telegramId);
}

export async function isOnboardingComplete(userId: number): Promise<boolean> {
  const { data, error } = await supabase.from("users").select("onboarding_complete").eq("id", userId).single();

  if (error) {
    throw new Error(`Failed to read onboarding status: ${error.message}`);
  }

  return Boolean(data?.onboarding_complete);
}

export async function startOnboarding(ctx: Context, telegramId: number): Promise<void> {
  addToOnboarding(telegramId);

  await ctx.reply(
    `Hi! I'm Bistro, your AI language tutor 🍽️

I'll help you build real conversational skills through:
- Daily chats in your target language
- Instant corrections and explanations
- Daily vocabulary words
- Voice practice 🎙️

Which language would you like to learn?`,
    {
      reply_markup: new InlineKeyboard()
        .text("🇪🇸 Spanish", "onboarding_language:es")
        .text("🇫🇷 French", "onboarding_language:fr"),
    }
  );
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

export async function handleOnboardingLevelCallback(
  ctx: Context,
  telegramId: number,
  userId: number,
  level: string
): Promise<void> {
  const { error } = await supabase.from("users").update({ level }).eq("id", userId);

  if (error) {
    throw new Error(`Failed to save onboarding level: ${error.message}`);
  }

  await ctx.reply(
    "Great! When would you like to receive your daily Spanish words?",
    {
      reply_markup: new InlineKeyboard()
        .text("🌅 8:00 AM (ET)", "onboarding_time:08:00")
        .text("☀️ 11:00 AM (ET)", "onboarding_time:11:00")
        .row()
        .text("🌇 2:00 PM (ET)", "onboarding_time:14:00")
        .text("🌆 5:00 PM (ET)", "onboarding_time:17:00")
        .row()
        .text("🌙 8:00 PM (ET)", "onboarding_time:20:00")
        .text("🌃 11:00 PM (ET)", "onboarding_time:23:00"),
    }
  );
  addToOnboarding(telegramId);
}

export async function handleOnboardingLanguageCallback(
  ctx: Context,
  telegramId: number,
  userId: number,
  lang: string
): Promise<void> {
  const { error } = await supabase.from("users").update({ target_language: lang }).eq("id", userId);

  if (error) {
    throw new Error(`Failed to save onboarding language: ${error.message}`);
  }

  addToOnboarding(telegramId);

  await ctx.reply(lang === "es" ? "Great! What's your Spanish level?" : "Super ! Quel est ton niveau de français ?", {
    reply_markup: new InlineKeyboard()
      .text("🌱 Beginner", "onboarding_level:beginner")
      .text("📈 Intermediate", "onboarding_level:intermediate")
      .row()
      .text("🎓 Advanced", "onboarding_level:advanced"),
  });
}

export async function handleOnboardingTimeCallback(
  ctx: Context,
  telegramId: number,
  userId: number,
  time: string
): Promise<void> {
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("level, target_language")
    .eq("id", userId)
    .single();
  if (userError) {
    throw new Error(`Failed to read onboarding level: ${userError.message}`);
  }

  const utcHHMM = etToUtc(time);
  const timeValue = `${utcHHMM}:00`;
  const { error } = await supabase
    .from("users")
    .update({
      preferred_word_time: timeValue,
      onboarding_complete: true,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to complete onboarding time setup: ${error.message}`);
  }

  removeFromOnboarding(telegramId);

  const level = (userRow?.level ?? "beginner").toLowerCase();
  const openingByLang: Record<string, Record<string, string>> = {
    es: {
      beginner: "¡Hola! Soy Bistro. ¿Cómo te llamas?",
      intermediate: "¡Hola! Soy Bistro. ¿Cómo te llamas y de dónde eres?",
      advanced: "¡Buenas! Soy Bistro. Cuéntame — ¿cómo te llamas y qué te trae aquí?",
    },
    fr: {
      beginner: "Bonjour ! Je suis Bistro. Comment tu t'appelles ?",
      intermediate: "Bonjour ! Je suis Bistro. Comment tu t'appelles et d'où viens-tu ?",
      advanced: "Bonjour ! Je suis Bistro. Raconte-moi — comment tu t'appelles et qu'est-ce qui t'amène ici ?",
    },
  };
  const targetLang = (userRow?.target_language ?? "es") as string;
  const openingText = openingByLang[targetLang]?.[level] ?? openingByLang["es"]["beginner"];
  await ctx.reply(openingText);
  await sendVoiceWithRead(ctx, openingText, level);
}
