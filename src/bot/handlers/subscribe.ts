import { InlineKeyboard, type Context } from "grammy";
import { Paddle } from "@paddle/paddle-node-sdk";
import { env } from "../../config/env";

const paddle = new Paddle(env.PADDLE_API_KEY);

function getCheckoutUrl(transaction: unknown): string | null {
  const maybe = transaction as { checkout?: { url?: string } | null };
  return maybe.checkout?.url ?? null;
}

export async function handleSubscribe(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  try {
    const [monthly, annual] = await Promise.all([
      paddle.transactions.create({
        items: [{ priceId: env.PADDLE_MONTHLY_PRICE_ID, quantity: 1 }],
        customData: { telegram_id: String(telegramId) },
      }),
      paddle.transactions.create({
        items: [{ priceId: env.PADDLE_YEARLY_PRICE_ID, quantity: 1 }],
        customData: { telegram_id: String(telegramId) },
      }),
    ]);

    const monthlyUrl = getCheckoutUrl(monthly);
    const annualUrl = getCheckoutUrl(annual);
    if (!monthlyUrl || !annualUrl) {
      throw new Error("Paddle checkout URL missing from transaction response");
    }

    const keyboard = new InlineKeyboard()
      .url("📅 Monthly — $11.99/mo", monthlyUrl)
      .row()
      .url("📆 Annual — $79.99/yr (44% off)", annualUrl);

    await ctx.reply("Choose your plan:\n\nTaxes calculated at checkout.", {
      reply_markup: keyboard,
    });
  } catch (error) {
    console.error("Failed to create Paddle checkout links:", error);
    await ctx.reply("Sorry, something went wrong. Please try again later.");
  }
}
