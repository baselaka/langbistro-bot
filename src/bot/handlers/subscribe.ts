import { InlineKeyboard, type Context } from "grammy";

export async function handleSubscribe(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const encodedTelegramId = encodeURIComponent(String(telegramId));
  const monthlyUrl = `https://langbistro.com/subscribe?telegram_id=${encodedTelegramId}&plan=monthly`;
  const annualUrl = `https://langbistro.com/subscribe?telegram_id=${encodedTelegramId}&plan=annual`;

  const keyboard = new InlineKeyboard()
    .url("📅 Monthly — $11.99/mo", monthlyUrl)
    .url("📆 Annual — $79.99/yr", annualUrl);

  await ctx.reply(
    "⚡ Ready to go Pro?\n\nUnlock unlimited conversations, all vocabulary tiers, and more capable AI models.\n\nTaxes calculated at checkout.",
    {
    reply_markup: keyboard,
    }
  );
}
