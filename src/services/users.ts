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
    .select("id, is_banned, language_code, is_subscribed, last_active_at, inactivity_stage")
    .eq("telegram_id", input.telegramId)
    .single();

  if (userError || !user) {
    throw new Error(`Failed to load user after upsert: ${userError?.message ?? "unknown"}`);
  }

  if (user.inactivity_stage > 0) {
    await supabase.from("users").update({ inactivity_stage: 0 }).eq("telegram_id", input.telegramId);
    return { ...user, inactivity_stage: 0 } as AppUser;
  }

  return user as AppUser;
}
