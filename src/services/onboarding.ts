import type { Context } from "grammy";
import { openai } from "../ai/openai";
import { supabase } from "../db/client";

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

Sentence 1: "Me llamo [your name] y tengo [your age] años."
Try to respond to this in Spanish 👆`
  );
}

export async function evaluateOnboarding(
  responses: string[]
): Promise<"beginner" | "intermediate" | "advanced"> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
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
  text: string
): Promise<boolean> {
  const state = onboardingByTelegramId.get(telegramId);
  if (!state) {
    return false;
  }

  const nextResponses = [...state.responses, text];

  if (state.step === 0) {
    setOnboardingState(telegramId, { step: 1, responses: nextResponses });
    await ctx.reply(
      `Sentence 2: "Ayer fui al mercado y compré frutas frescas. ¿Qué compraste tú?"`
    );
    return false;
  }

  if (state.step === 1) {
    setOnboardingState(telegramId, { step: 2, responses: nextResponses });
    await ctx.reply(
      `Sentence 3: "Si pudieras vivir en cualquier país del mundo, ¿dónde vivirías y por qué?"`
    );
    return false;
  }

  // step === 2: this message is the third response
  const allResponses = [...state.responses, text];
  const level = await evaluateOnboarding(allResponses);
  await completeOnboarding(userId, level);

  await ctx.reply(
    `Thanks for your answers! Based on what you wrote, I'm placing you at the ${level} level for now. We can always adjust as you improve — let's start practicing!`
  );

  onboardingByTelegramId.delete(telegramId);
  return true;
}
