import { supabase } from "../db/client";
import { defaultInterfaceLanguage, parseInterfaceLanguage, type InterfaceLanguage } from "../i18n";

type TelegramUserInput = {
  telegramId: number;
  username: string | null;
  languageCode: string | null;
};

const USER_COLUMNS =
  "id, is_banned, language_code, interface_language, is_subscribed, last_active_at, inactivity_stage, target_language, language_progress, onboarding_complete";

export type AppUser = {
  id: number;
  is_banned: boolean;
  language_code: string | null;
  interface_language: string | null;
  target_language: string | null;
  language_progress: Record<string, { level: string; current_tier: number }> | null;
  is_subscribed: boolean;
  last_active_at: string | null;
  inactivity_stage: number;
  onboarding_complete: boolean;
};

export function interfaceLocaleOf(user: { interface_language?: string | null }): InterfaceLanguage {
  return parseInterfaceLanguage(user.interface_language);
}

export async function getInterfaceLocaleByTelegramId(telegramId: number): Promise<InterfaceLanguage> {
  const { data } = await supabase
    .from("users")
    .select("interface_language")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return parseInterfaceLanguage(data?.interface_language);
}

async function loadUserByTelegramId(telegramId: number): Promise<AppUser | null> {
  const { data, error } = await supabase.from("users").select(USER_COLUMNS).eq("telegram_id", telegramId).maybeSingle();
  if (error) {
    throw new Error(`Failed to load user: ${error.message}`);
  }
  return (data as AppUser | null) ?? null;
}

async function applySubscriptionExpiry(user: AppUser): Promise<AppUser> {
  if (!user.is_subscribed) {
    return user;
  }

  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", user.id)
    .single();

  if (subscriptionError && subscriptionError.code !== "PGRST116") {
    throw new Error(`Failed to read subscription for user: ${subscriptionError.message}`);
  }

  const isCanceled = subscriptionRow?.status === "canceled";
  const periodEnd = subscriptionRow?.current_period_end;
  const periodEndMs = periodEnd ? Date.parse(periodEnd) : Number.NaN;
  const isExpired = Number.isFinite(periodEndMs) && periodEndMs < Date.now();

  if (isCanceled && isExpired) {
    const { error: revokeError } = await supabase.from("users").update({ is_subscribed: false }).eq("id", user.id);
    if (revokeError) {
      throw new Error(`Failed to revoke expired canceled subscription: ${revokeError.message}`);
    }
    return { ...user, is_subscribed: false };
  }

  return user;
}

export async function getOrCreateUserByTelegram(
  input: TelegramUserInput,
  options?: { touchLastActive?: boolean }
): Promise<AppUser> {
  const touchLastActive = options?.touchLastActive !== false;
  const existing = await loadUserByTelegramId(input.telegramId);

  let user: AppUser;
  if (!existing) {
    const { data: created, error: insertError } = await supabase
      .from("users")
      .insert({
        telegram_id: input.telegramId,
        username: input.username,
        language_code: input.languageCode,
        interface_language: defaultInterfaceLanguage(input.languageCode),
      })
      .select(USER_COLUMNS)
      .single();

    if (insertError || !created) {
      const raced = await loadUserByTelegramId(input.telegramId);
      if (!raced) {
        throw new Error(`Failed to create user: ${insertError?.message ?? "unknown"}`);
      }
      user = raced;
    } else {
      user = created as AppUser;
    }
  } else {
    user = existing;
  }

  const profileUpdate: {
    username: string | null;
    language_code: string | null;
    last_active_at?: string;
  } = {
    username: input.username,
    language_code: input.languageCode,
  };
  if (touchLastActive) {
    profileUpdate.last_active_at = new Date().toISOString();
  }

  await supabase.from("users").update(profileUpdate).eq("telegram_id", input.telegramId);

  const withSub = await applySubscriptionExpiry(user);

  if (touchLastActive && withSub.inactivity_stage > 0) {
    await supabase.from("users").update({ inactivity_stage: 0 }).eq("telegram_id", input.telegramId);
    return { ...withSub, inactivity_stage: 0 };
  }

  return withSub;
}
