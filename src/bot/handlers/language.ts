import { InlineKeyboard, type Context } from "grammy";
import { SUPPORTED_LANGUAGES, parseTargetLanguage } from "../../config/languages";
import { supabase } from "../../db/client";
import { pickerLabel, t } from "../../i18n";
import { getInterfaceLocaleByTelegramId } from "../../services/users";

export async function handleLanguageCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const locale = await getInterfaceLocaleByTelegramId(telegramId);
  const { data: user } = await supabase
    .from("users")
    .select("target_language")
    .eq("telegram_id", telegramId)
    .single();

  const current = parseTargetLanguage(user?.target_language);

  const keyboard = new InlineKeyboard();
  for (const code of SUPPORTED_LANGUAGES) {
    keyboard.text(pickerLabel(code, current, locale), `settings_language:${code}`);
  }

  await ctx.reply(t(locale, "language.ask"), {
    reply_markup: keyboard,
  });
}
