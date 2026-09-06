import type { Context } from "grammy";
import { getMilestoneMessage } from "../i18n";
import type { InterfaceLanguage } from "../i18n";

const sentMilestones = new Set<string>();

export async function maybeSendMilestoneAfterConversation(
  ctx: Context,
  userId: number,
  wordsLearnedCount: number,
  language: string = "es",
  locale: InterfaceLanguage = "en"
): Promise<void> {
  const message = getMilestoneMessage(wordsLearnedCount, language, locale);
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
