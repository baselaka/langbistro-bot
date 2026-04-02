import { InlineKeyboard, type Context } from "grammy";
import { supabase } from "../../db/client";

export async function handleSettings(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }

  const { data: user } = await supabase.from("users").select("level").eq("telegram_id", telegramId).single();

  const keyboard = new InlineKeyboard();
  const lines: string[] = ["⚙️ Settings"];

  const normalizedLevel = (user?.level ?? "beginner").toLowerCase();
  const formattedLevel = normalizedLevel.charAt(0).toUpperCase() + normalizedLevel.slice(1);
  lines.push(`📊 Level: ${formattedLevel}`);
  lines.push("", "What is your Spanish level?");

  keyboard
    .text("🌱 Beginner", "settings_level:beginner")
    .text("📈 Intermediate", "settings_level:intermediate")
    .text("🎓 Advanced", "settings_level:advanced")
    .row();

  lines.push(
    "",
    "What time would you like to receive your daily words? Times are in Eastern Time (ET)."
  );

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
