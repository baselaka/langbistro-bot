import { InlineKeyboard, type Context } from "grammy";
import { Paddle } from "@paddle/paddle-node-sdk";
import { env } from "../../config/env";
import { supabase } from "../../db/client";

const paddle = new Paddle(env.PADDLE_API_KEY);

export async function handleSettings(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, is_subscribed, level")
    .eq("telegram_id", telegramId)
    .single();

  const { data: subscription } = user
    ? await supabase
        .from("subscriptions")
        .select("status, current_period_end, paddle_customer_id, paddle_subscription_id")
        .eq("user_id", user.id)
        .single()
    : { data: null };

  const keyboard = new InlineKeyboard();
  const lines: string[] = ["⚙️ Settings"];
  const normalizedLevel = (user?.level ?? "beginner").toLowerCase();
  const formattedLevel = normalizedLevel.charAt(0).toUpperCase() + normalizedLevel.slice(1);
  lines.push(`📊 Level: ${formattedLevel}`);

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
    if (subscription?.paddle_customer_id && subscription?.paddle_subscription_id) {
      try {
        const portalSession = await paddle.customerPortalSessions.create(
          subscription.paddle_customer_id,
          [subscription.paddle_subscription_id]
        );
        const portalUrl = portalSession.urls.general.overview;
        keyboard.url("Manage subscription", portalUrl);
        keyboard.row();
      } catch (error) {
        console.error("Failed to create Paddle portal session:", error);
        lines.push("To manage your subscription, contact us at support@langbistro.com");
      }
    }
  } else {
    lines.push("🆓 Free plan");
    keyboard.url("⚡ Upgrade to Pro", "https://t.me/langbistro_bot?start=subscribe");
    keyboard.row();
  }

  keyboard
    .text("🌱 Beginner", "settings_level:beginner")
    .text("📈 Intermediate", "settings_level:intermediate")
    .text("🎓 Advanced", "settings_level:advanced")
    .row();

  lines.push("", "What time would you like to receive your daily words?");

  keyboard
    .text("🌅 8:00 AM (ET)", "settings_time:08:00")
    .text("☀️ 11:00 AM (ET)", "settings_time:11:00")
    .row()
    .text("🌇 2:00 PM (ET)", "settings_time:14:00")
    .text("🌆 5:00 PM (ET)", "settings_time:17:00")
    .row()
    .text("🌙 8:00 PM (ET)", "settings_time:20:00")
    .text("🌃 11:00 PM (ET)", "settings_time:23:00");

  await ctx.reply(lines.join("\n"), {
    reply_markup: keyboard,
  });
}
