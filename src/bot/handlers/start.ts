import type { Context } from "grammy";
import { supabase } from "../../db/client";
import { startOnboarding } from "../../services/onboarding";

export async function handleStart(ctx: Context): Promise<void> {
  const from = ctx.from;

  if (!from) {
    await ctx.reply("Hello from LangBistro!");
    return;
  }

  const { data: user, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: from.id,
        username: from.username ?? null,
        language_code: from.language_code ?? null,
      },
      { onConflict: "telegram_id" }
    )
    .select("onboarding_complete")
    .single();

  if (error) {
    console.error("Failed to upsert user on /start:", error);
    await ctx.reply("Welcome to LangBistro! We hit a setup hiccup, please try again.");
    return;
  }

  if (!user?.onboarding_complete) {
    await startOnboarding(ctx, from.id);
    return;
  }

  await ctx.reply(
    "¡Bienvenido de nuevo! Ready to practice your Spanish? Send me a message or a voice note to get started! 🎙️"
  );
}
