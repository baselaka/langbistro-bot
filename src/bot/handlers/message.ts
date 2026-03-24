import type { Context } from "grammy";
import { checkViolation, handleViolation } from "../../services/moderation";
import { getMilestoneMessage } from "../../services/vocabulary";
import { checkAndIncrementUsage } from "../../services/usage";
import { getOrCreateUserByTelegram } from "../../services/users";
import { runAssistantTurn } from "../../services/conversation";
import { handleOnboardingResponse, isInOnboarding } from "../../services/onboarding";
import { supabase } from "../../db/client";
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

  if (isInOnboarding(from.id)) {
    const onboardingDone = await handleOnboardingResponse(ctx, from.id, user.id, text);
    if (onboardingDone) {
      return;
    }
    return;
  }

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

  const { data: updatedUser } = await supabase
    .from("users")
    .select("words_learned_count")
    .eq("id", user.id)
    .single();
  const wordsCount = updatedUser?.words_learned_count ?? 0;
  const milestoneMessage = getMilestoneMessage(wordsCount);
  if (milestoneMessage) {
    await ctx.reply(milestoneMessage);
  }
}
