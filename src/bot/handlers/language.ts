import { InlineKeyboard, type Context } from "grammy";
import {
  SUPPORTED_LANGUAGES,
  parseTargetLanguage,
  pickerLabel,
} from "../../config/languages";
import { supabase } from "../../db/client";

export async function handleLanguageCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const { data: user } = await supabase
    .from("users")
    .select("target_language")
    .eq("telegram_id", telegramId)
    .single();

  const current = parseTargetLanguage(user?.target_language);

  const keyboard = new InlineKeyboard();
  for (const code of SUPPORTED_LANGUAGES) {
    keyboard.text(pickerLabel(code, current), `settings_language:${code}`);
  }

  await ctx.reply("Which language would you like to learn?", {
    reply_markup: keyboard,
  });
}
