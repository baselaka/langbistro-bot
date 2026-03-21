import type { Context } from "grammy";

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;

  if (!text) {
    return;
  }

  await ctx.reply(`[ECHO]: ${text}`);
}
