import { supabase } from "../db/client";

type TelegramUserInput = {
  telegramId: number;
  username: string | null;
  languageCode: string | null;
};

export type AppUser = {
  id: number;
  is_banned: boolean;
  language_code: string | null;
  target_language: string | null;
  is_subscribed: boolean;
  last_active_at: string | null;
  inactivity_stage: number;
};

export async function getOrCreateUserByTelegram(input: TelegramUserInput): Promise<AppUser> {
  const { error: upsertError } = await supabase.from("users").upsert(
    {
      telegram_id: input.telegramId,
      username: input.username,
      language_code: input.languageCode,
    },
    { onConflict: "telegram_id" }
  );

  if (upsertError) {
    throw new Error(`Failed to upsert user: ${upsertError.message}`);
  }

  await supabase
    .from("users")
    .update({ last_active_at: new Date().toISOString() })
    .eq("telegram_id", input.telegramId);

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, is_banned, language_code, is_subscribed, last_active_at, inactivity_stage, target_language")
    .eq("telegram_id", input.telegramId)
    .single();

  if (userError || !user) {
    throw new Error(`Failed to load user after upsert: ${userError?.message ?? "unknown"}`);
  }

  let normalizedUser = user as AppUser;
  if (normalizedUser.is_subscribed) {
    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", normalizedUser.id)
      .single();

    if (subscriptionError && subscriptionError.code !== "PGRST116") {
      throw new Error(`Failed to read subscription for user: ${subscriptionError.message}`);
    }

    const isCanceled = subscriptionRow?.status === "canceled";
    const periodEnd = subscriptionRow?.current_period_end;
    const periodEndMs = periodEnd ? Date.parse(periodEnd) : Number.NaN;
    const isExpired = Number.isFinite(periodEndMs) && periodEndMs < Date.now();

    if (isCanceled && isExpired) {
      const { error: revokeError } = await supabase
        .from("users")
        .update({ is_subscribed: false })
        .eq("id", normalizedUser.id);
      if (revokeError) {
        throw new Error(`Failed to revoke expired canceled subscription: ${revokeError.message}`);
      }
      normalizedUser = { ...normalizedUser, is_subscribed: false };
    }
  }

  if (normalizedUser.inactivity_stage > 0) {
    await supabase.from("users").update({ inactivity_stage: 0 }).eq("telegram_id", input.telegramId);
    return { ...normalizedUser, inactivity_stage: 0 } as AppUser;
  }

  return normalizedUser;
}
