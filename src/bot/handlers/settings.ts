import { InlineKeyboard, type Context } from "grammy";

export async function handleSettings(ctx: Context): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text("🌅 8:00 AM", "settings_time:08:00")
    .text("☀️ 12:00 PM", "settings_time:12:00")
    .row()
    .text("🌆 6:00 PM", "settings_time:18:00")
    .text("🌙 9:00 PM", "settings_time:21:00");

  await ctx.reply("⚙️ Settings — What time would you like to receive your daily words?", {
    reply_markup: keyboard,
  });
}
