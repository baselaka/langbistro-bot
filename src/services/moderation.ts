import { openai } from "../ai/openai";
import { parseTargetLanguage } from "../config/languages";
import { supabase } from "../db/client";
import { moderationRedirect, moderationSafeTopic, t, type InterfaceLanguage } from "../i18n";

type ViolationResult = {
  flagged: boolean;
  violationType: string | null;
};

export async function checkViolation(text: string): Promise<ViolationResult> {
  const moderation = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: text,
  });

  const result = moderation.results[0];
  if (!result?.flagged) {
    return { flagged: false, violationType: null };
  }

  const categories = result.categories;
  const firstFlaggedCategory =
    Object.entries(categories).find(([, value]) => Boolean(value))?.[0] ?? "restricted_content";

  return {
    flagged: true,
    violationType: firstFlaggedCategory,
  };
}

export async function handleViolation(
  userId: number,
  violationType: string,
  targetLanguage: string = "es",
  locale: InterfaceLanguage = "en"
): Promise<string> {
  const targetLang = parseTargetLanguage(targetLanguage);

  const { error: insertViolationError } = await supabase.from("violations").insert({
    user_id: userId,
    violation_type: violationType,
  });
  if (insertViolationError) {
    console.error("Failed to insert violation:", insertViolationError);
  }

  const { data: user, error: userFetchError } = await supabase
    .from("users")
    .select("violation_count")
    .eq("id", userId)
    .single();

  if (userFetchError || !user) {
    console.error("Failed to fetch user violation count:", userFetchError);
    return moderationRedirect(locale, targetLang);
  }

  const nextViolationCount = (user.violation_count ?? 0) + 1;
  const shouldBan = nextViolationCount >= 5;

  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      violation_count: nextViolationCount,
      ...(shouldBan ? { is_banned: true } : {}),
    })
    .eq("id", userId);

  if (userUpdateError) {
    console.error("Failed to update user violation count:", userUpdateError);
  }

  if (nextViolationCount >= 5) {
    return t(locale, "moderation.banned");
  }

  if (nextViolationCount >= 3) {
    return t(locale, "moderation.warning");
  }

  return moderationSafeTopic(locale, targetLang);
}
