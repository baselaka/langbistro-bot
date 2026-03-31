import { InlineKeyboard, type Context } from "grammy";
import { supabase } from "../../db/client";

export async function handleSettings(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, is_subscribed")
    .eq("telegram_id", telegramId)
    .single();

  const { data: subscription } = user
    ? await supabase
        .from("subscriptions")
        .select("status, current_period_end, paddle_customer_id")
        .eq("user_id", user.id)
        .single()
    : { data: null };

  const keyboard = new InlineKeyboard();
  const lines: string[] = ["⚙️ Settings"];

  if (user?.is_subscribed) {
    lines.push("✅ Pro subscriber");
    if (subscription?.current_period_end) {
      const renewal = new Date(subscription.current_period_end).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
      lines.push(`Renews on ${renewal}`);
    }
    if (subscription?.paddle_customer_id) {
      keyboard.url(
        "Manage subscription",
        `https://subscriptions.paddle.com/customer/portal/${subscription.paddle_customer_id}`
      );
      keyboard.row();
    }
  } else {
    lines.push("🆓 Free plan");
    keyboard.url("⚡ Upgrade to Pro", "https://t.me/langbistro_bot?start=subscribe");
    keyboard.row();
  }

  lines.push("", "What time would you like to receive your daily words?");

  keyboard
    .text("🌅 8:00 AM", "settings_time:08:00")
    .text("☀️ 12:00 PM", "settings_time:12:00")
    .row()
    .text("🌆 6:00 PM", "settings_time:18:00")
    .text("🌙 9:00 PM", "settings_time:21:00");

  await ctx.reply(lines.join("\n"), {
    reply_markup: keyboard,
  });
}
