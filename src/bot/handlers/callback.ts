import type { Context } from "grammy";
import { getCallbackMeta } from "../ux-memory";

export async function handleCallbackQuery(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    await ctx.answerCallbackQuery();
    return;
  }

  const [action, rawMessageId] = data.split(":");
  const messageId = Number(rawMessageId);

  if (!Number.isFinite(messageId)) {
    await ctx.answerCallbackQuery({ text: "This action is no longer available." });
    return;
  }

  const meta = getCallbackMeta(messageId);
  await ctx.answerCallbackQuery();

  if (!meta) {
    await ctx.reply("That button action expired. Send a new message to continue.");
    return;
  }

  if (action === "explain_correction" && meta.kind === "correction") {
    await ctx.reply(meta.explanation);
    return;
  }

  if (action === "read_reply" && meta.kind === "reply") {
    await ctx.reply(meta.reply);
    return;
  }

  if (action === "explain_reply" && meta.kind === "reply") {
    await ctx.reply(meta.replyExplanation);
    return;
  }

  await ctx.reply("That action is not available for this message.");
}
