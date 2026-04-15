import { InlineKeyboard, type Context } from "grammy";
import { supabase } from "../../db/client";

export async function handleLanguageCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const { data: user } = await supabase
    .from("users")
    .select("target_language")
    .eq("telegram_id", telegramId)
    .single();

  const current = user?.target_language ?? "es";

  await ctx.reply(
    "Which language would you like to learn?",
    {
      reply_markup: new InlineKeyboard()
        .text(
          current === "es" ? "🇪🇸 Spanish ✓" : "🇪🇸 Spanish",
          "settings_language:es"
        )
        .text(
          current === "fr" ? "🇫🇷 French ✓" : "🇫🇷 French",
          "settings_language:fr"
        ),
    }
  );
}
