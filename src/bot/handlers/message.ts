import type { Context } from "grammy";
import { checkViolation, handleViolation } from "../../services/moderation";
import { checkAndIncrementUsage } from "../../services/usage";
import { getOrCreateUserByTelegram } from "../../services/users";
import { runAssistantTurn } from "../../services/conversation";
import { sendStructuredUxResponse } from "./ux-flow";

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  const from = ctx.from;

  if (!text || !from) {
    return;
  }

  const user = await getOrCreateUserByTelegram({
    telegramId: from.id,
    username: from.username ?? null,
    languageCode: from.language_code ?? null,
  });

  if (user.is_banned) {
    await ctx.reply(
      "Your account is currently suspended. Please contact @langbistro_support if you believe this is a mistake."
    );
    return;
  }

  const usage = await checkAndIncrementUsage(user.id, "text");
  if (!usage.allowed) {
    await ctx.reply(
      "You reached today's free text limit (10/day). Upgrade to continue unlimited practice."
    );
    return;
  }

  const moderation = await checkViolation(text);
  if (moderation.flagged) {
    const violationReply = await handleViolation(user.id, moderation.violationType ?? "restricted_content");
    await ctx.reply(violationReply);
    return;
  }

  const { structured, responseVoice } = await runAssistantTurn(
    user.id,
    user.language_code ?? "es",
    text,
    "text"
  );

  await sendStructuredUxResponse(ctx, structured, responseVoice);
}
