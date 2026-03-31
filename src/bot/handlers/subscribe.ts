import { InlineKeyboard, type Context } from "grammy";

export async function handleSubscribe(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const subscribeUrl = `https://langbistro.com/subscribe?telegram_id=${telegramId.toString()}`;

  const keyboard = new InlineKeyboard().url("⚡ Subscribe to Pro", subscribeUrl);

  await ctx.reply(
    "Choose your plan and unlock:\n\n✓ Unlimited text & voice messages\n✓ All vocabulary tiers\n✓ More capable AI models\n\nTaxes calculated at checkout.",
    {
      reply_markup: keyboard,
    }
  );
}
