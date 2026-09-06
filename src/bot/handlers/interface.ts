import type { Context } from "grammy";
import { t } from "../../i18n";
import { getInterfaceLocaleByTelegramId } from "../../services/users";
import { interfaceLanguageKeyboard } from "../keyboards";

export async function handleInterfaceCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const locale = await getInterfaceLocaleByTelegramId(telegramId);
  await ctx.reply(t(locale, "interface.ask"), {
    reply_markup: interfaceLanguageKeyboard(locale),
  });
}
