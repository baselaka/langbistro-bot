/** Escape a value for Telegram MarkdownV2. Markup in templates must not be passed through this. */
export function escapeMarkdownV2(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
