import type { Context } from "grammy";
import { startOnboarding } from "../../services/onboarding";
import { getOrCreateUserByTelegram, interfaceLocaleOf } from "../../services/users";
import { localeFromTelegramCode, t } from "../../i18n";

export async function handleStart(ctx: Context): Promise<void> {
  const from = ctx.from;

  if (!from) {
    await ctx.reply(t("en", "start.hello"));
    return;
  }

  try {
    const user = await getOrCreateUserByTelegram(
      {
        telegramId: from.id,
        username: from.username ?? null,
        languageCode: from.language_code ?? null,
      },
      { touchLastActive: true }
    );
    const locale = interfaceLocaleOf(user);

    if (!user.onboarding_complete) {
      await startOnboarding(ctx, from.id, locale);
      return;
    }

    await ctx.reply(t(locale, "start.welcomeBack"));
  } catch (error) {
    console.error("Failed to upsert user on /start:", error);
    const locale = localeFromTelegramCode(from.language_code);
    await ctx.reply(t(locale, "start.setupHiccup"));
  }
}
