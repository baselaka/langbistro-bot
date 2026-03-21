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

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, is_banned, language_code")
    .eq("telegram_id", input.telegramId)
    .single();

  if (userError || !user) {
    throw new Error(`Failed to load user after upsert: ${userError?.message ?? "unknown"}`);
  }

  return user as AppUser;
}
