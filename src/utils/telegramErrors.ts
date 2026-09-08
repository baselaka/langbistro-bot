import { GrammyError } from "grammy";

/** True when Telegram reports the user blocked the bot (permanent; do not retry). */
export function isTelegramBotBlockedError(err: unknown): boolean {
  if (!(err instanceof GrammyError)) {
    return false;
  }
  if (err.error_code !== 403) {
    return false;
  }
  const description = (err.description ?? err.message).toLowerCase();
  return description.includes("blocked by the user") || description.includes("bot was blocked");
}
