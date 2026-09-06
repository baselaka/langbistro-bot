import { InlineKeyboard, type Context } from "grammy";
import { parseTargetLanguage } from "../../config/languages";
import { supabase } from "../../db/client";
import {
  INTERFACE_LANGUAGE_LABELS,
  localizedLevelName,
  parseInterfaceLanguage,
  settingsLevelAsk,
  t,
} from "../../i18n";
import { getInterfaceLocaleByTelegramId } from "../../services/users";
import { interfaceLanguageKeyboard, levelPickerKeyboard, timePickerKeyboard } from "../keyboards";

function appendKeyboard(target: InlineKeyboard, source: InlineKeyboard): void {
  for (const row of source.inline_keyboard) {
    target.inline_keyboard.push(row);
  }
}

export async function handleSettings(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const locale = await getInterfaceLocaleByTelegramId(telegramId);
  const { data: user } = await supabase
    .from("users")
    .select("level, target_language, interface_language")
    .eq("telegram_id", telegramId)
    .single();

  const lang = parseTargetLanguage(user?.target_language);
  const formattedLevel = localizedLevelName(locale, user?.level ?? "beginner");
  const currentInterface = parseInterfaceLanguage(user?.interface_language);
  const interfaceLabel = INTERFACE_LANGUAGE_LABELS[currentInterface];

  const lines = [
    t(locale, "settings.title"),
    t(locale, "settings.levelLine", { level: formattedLevel }),
    "",
    settingsLevelAsk(lang, locale),
    "",
    t(locale, "settings.timeAsk"),
    "",
    t(locale, "settings.interfaceAsk"),
    `→ ${interfaceLabel}`,
  ];

  const keyboard = new InlineKeyboard();
  appendKeyboard(keyboard, levelPickerKeyboard(locale, "settings_level"));
  keyboard.row();
  appendKeyboard(keyboard, timePickerKeyboard(locale, "settings_time"));
  keyboard.row();
  appendKeyboard(keyboard, interfaceLanguageKeyboard());

  await ctx.reply(lines.join("\n"), {
    reply_markup: keyboard,
  });
}
