import { openai } from "../ai/openai";
import { supabase } from "../db/client";

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

export async function handleViolation(userId: number, violationType: string): Promise<string> {
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
    return "Let's keep things focused on safe Spanish practice. Try a friendly topic and we can continue.";
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
    return "Your account has been suspended for repeated policy violations. If you believe this is a mistake, contact @langbistro_support.";
  }

  if (nextViolationCount >= 3) {
    return "Warning: this topic is restricted. Please keep the chat safe and learning-focused, or your account may be suspended.";
  }

  return "Let's switch to a safer topic and keep practicing Spanish together. Try asking about travel, food, or daily conversation.";
}
