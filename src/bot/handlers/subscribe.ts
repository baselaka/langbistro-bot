import { InlineKeyboard, type Context } from "grammy";
import { supabase } from "../../db/client";
import { t } from "../../i18n";
import { getInterfaceLocaleByTelegramId } from "../../services/users";

export async function handleSubscribe(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const locale = await getInterfaceLocaleByTelegramId(telegramId);
  const { data: user } = await supabase
    .from("users")
    .select("is_subscribed")
    .eq("telegram_id", telegramId)
    .single();

  if (user?.is_subscribed) {
    await ctx.reply(t(locale, "subscribe.alreadyPro"));
    return;
  }

  const subscribeUrl = `https://langbistro.com/subscribe?telegram_id=${telegramId.toString()}`;
  const keyboard = new InlineKeyboard().url(t(locale, "button.subscribePro"), subscribeUrl);

  await ctx.reply(t(locale, "subscribe.cta"), {
    reply_markup: keyboard,
  });
}
