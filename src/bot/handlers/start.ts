import type { Context } from "grammy";
import { supabase } from "../../db/client";

export async function handleStart(ctx: Context): Promise<void> {
  const from = ctx.from;

  if (!from) {
    await ctx.reply("Hello from LangBistro!");
    return;
  }

  const { error } = await supabase.from("users").upsert(
    {
      telegram_id: from.id,
      username: from.username ?? null,
      language_code: from.language_code ?? null,
    },
    { onConflict: "telegram_id" }
  );

  if (error) {
    console.error("Failed to upsert user on /start:", error);
    await ctx.reply("Welcome to LangBistro! We hit a setup hiccup, please try again.");
    return;
  }

  await ctx.reply(
    "Welcome to LangBistro! I am your language practice buddy. Send me a message and we can start learning together."
  );
}
