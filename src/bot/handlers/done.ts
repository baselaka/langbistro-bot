import type { Context } from "grammy";
import { t } from "../../i18n";
import { supabase } from "../../db/client";
import { handleDoneCommand } from "../../services/dailyLoop";
import { getOrCreateUserByTelegram, interfaceLocaleOf } from "../../services/users";

export async function handleDone(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) {
    return;
  }

  const user = await getOrCreateUserByTelegram({
    telegramId: from.id,
    username: from.username ?? null,
    languageCode: from.language_code ?? null,
  });
  const locale = interfaceLocaleOf(user);

  if (user.is_banned) {
    await ctx.reply(t(locale, "account.suspended"));
    return;
  }

  const { data: row } = await supabase
    .from("users")
    .select("preferred_word_timezone")
    .eq("id", user.id)
    .single();
  const timezone = row?.preferred_word_timezone ?? "America/New_York";

  const result = await handleDoneCommand({
    userId: user.id,
    timezone,
    locale,
  });
  await ctx.reply(result.text);
}
