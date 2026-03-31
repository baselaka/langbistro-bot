import { InlineKeyboard, type Context } from "grammy";
import { env } from "../../config/env";

export async function handleSubscribe(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const encodedTelegramId = encodeURIComponent(String(telegramId));
  const monthlyUrl = `https://buy.paddle.com/product/${env.PADDLE_MONTHLY_PRICE_ID}?customData[telegram_id]=${encodedTelegramId}`;
  const annualUrl = `https://buy.paddle.com/product/${env.PADDLE_YEARLY_PRICE_ID}?customData[telegram_id]=${encodedTelegramId}`;

  const keyboard = new InlineKeyboard()
    .url("📅 Monthly — $11.99/mo", monthlyUrl)
    .row()
    .url("📆 Annual — $79.99/yr (44% off)", annualUrl);

  await ctx.reply("Choose your plan:\n\nTaxes calculated at checkout.", {
    reply_markup: keyboard,
  });
}
