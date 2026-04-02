import { InlineKeyboard, type Context } from "grammy";
import { supabase } from "../../db/client";

export async function handleSubscribe(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const { data: user } = await supabase
    .from("users")
    .select("is_subscribed")
    .eq("telegram_id", telegramId)
    .single();

  if (user?.is_subscribed) {
    await ctx.reply(
      "✅ You're a Pro subscriber!\n\nTo manage or cancel your subscription, email us at:\n📧 support@langbistro.com\n\nWe'll help you within 1 business day."
    );
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
