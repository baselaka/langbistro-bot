import { supabase } from "../db/client";
import { getLocalDateString } from "../utils/dateTz";
import {
  decideFreeUsageAllowance,
  TEXT_LIMIT,
  VOICE_LIMIT,
  type UsageType,
} from "./usageRules";

export { TEXT_LIMIT, VOICE_LIMIT } from "./usageRules";

type UsageCheckResult = {
  allowed: boolean;
  remaining: number;
};

async function isTodaysSessionCompleted(userId: number, timezone: string): Promise<boolean> {
  const today = getLocalDateString(timezone);
  const { data, error } = await supabase
    .from("daily_sessions")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch today's session completion: ${error.message}`);
  }

  return Boolean(data?.completed_at);
}

export async function checkAndIncrementUsage(
  userId: number,
  type: UsageType
): Promise<UsageCheckResult> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("is_subscribed, preferred_word_timezone")
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
  const sessionCompleted =
    type === "voice"
      ? await isTodaysSessionCompleted(userId, user.preferred_word_timezone ?? "UTC")
      : false;

  const decision = decideFreeUsageAllowance({
    type,
    currentCount,
    sessionCompleted,
  });

  if (!decision.allowed) {
    return { allowed: false, remaining: 0 };
  }

  const limit = type === "text" ? TEXT_LIMIT : VOICE_LIMIT;
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
