/** Free-tier daily caps. Voice is sized to one completed daily session. */
export const TEXT_LIMIT = 10;
export const VOICE_LIMIT = 15;

export type UsageType = "text" | "voice";

export type UsageDenialReason = "limit" | "session_complete";

export type UsageDecision =
  | { allowed: true }
  | { allowed: false; reason: UsageDenialReason };

/**
 * Free-tier gate. Voice prefers "today's session is done" over a raw counter;
 * VOICE_LIMIT remains a cost ceiling when the loop never completes.
 */
export function decideFreeUsageAllowance(input: {
  type: UsageType;
  currentCount: number;
  sessionCompleted: boolean;
}): UsageDecision {
  if (input.type === "voice" && input.sessionCompleted) {
    return { allowed: false, reason: "session_complete" };
  }

  const limit = input.type === "text" ? TEXT_LIMIT : VOICE_LIMIT;
  if (input.currentCount >= limit) {
    return { allowed: false, reason: "limit" };
  }

  return { allowed: true };
}
