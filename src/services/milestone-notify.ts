import type { Context } from "grammy";
import { getMilestoneMessage } from "../services/vocabulary";

const sentMilestones = new Set<string>();

export async function maybeSendMilestoneAfterConversation(ctx: Context, userId: number, wordsLearnedCount: number): Promise<void> {
  const message = getMilestoneMessage(wordsLearnedCount);
  if (!message) {
    return;
  }

  const key = `${userId}:${wordsLearnedCount}`;
  if (sentMilestones.has(key)) {
    return;
  }

  sentMilestones.add(key);
  await ctx.reply(message);
}

export function recordMilestoneSent(userId: number, wordsLearnedCount: number): void {
  sentMilestones.add(`${userId}:${wordsLearnedCount}`);
}
