import { supabase } from "../db/client";

const TEXT_LIMIT = 10;
const VOICE_LIMIT = 3;

type UsageType = "text" | "voice";

type UsageCheckResult = {
  allowed: boolean;
  remaining: number;
};

export async function checkAndIncrementUsage(
  userId: number,
  type: UsageType
): Promise<UsageCheckResult> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("is_subscribed")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    throw new Error(`Failed to fetch user subscription status: ${userError?.message ?? "unknown"}`);
  }

  if (user.is_subscribed) {
    return { allowed: true, remaining: -1 };
  }

  const { error: upsertError } = await supabase.from("usage_daily").upsert(
    {
      user_id: userId,
      date: today,
    },
    { onConflict: "user_id,date" }
  );
  if (upsertError) {
    throw new Error(`Failed to upsert daily usage row: ${upsertError.message}`);
  }

  const { data: usage, error: usageError } = await supabase
    .from("usage_daily")
    .select("text_count, voice_count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  if (usageError || !usage) {
    throw new Error(`Failed to fetch daily usage row: ${usageError?.message ?? "unknown"}`);
  }

  const currentCount = type === "text" ? usage.text_count : usage.voice_count;
  const limit = type === "text" ? TEXT_LIMIT : VOICE_LIMIT;

  if (currentCount >= limit) {
    return { allowed: false, remaining: 0 };
  }

  const nextCount = currentCount + 1;
  const updatePayload = type === "text" ? { text_count: nextCount } : { voice_count: nextCount };

  const { error: updateError } = await supabase
    .from("usage_daily")
    .update(updatePayload)
    .eq("user_id", userId)
    .eq("date", today);

  if (updateError) {
    throw new Error(`Failed to update usage counters: ${updateError.message}`);
  }

  return { allowed: true, remaining: Math.max(limit - nextCount, 0) };
}
