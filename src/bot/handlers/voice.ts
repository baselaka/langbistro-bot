import type { Context } from "grammy";

export async function handleVoice(ctx: Context): Promise<void> {
  await ctx.reply("Voice messages coming soon!");
}
