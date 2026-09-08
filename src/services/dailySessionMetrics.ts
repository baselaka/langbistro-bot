/** True when today's word set has already been sent (same-day cron dedup). */
export function isDailyWordDelivered(session: { delivered_at?: string | null }): boolean {
  return Boolean(session.delivered_at);
}

/** Next engagement fields after one user message. Does not touch delivered_at. */
export function nextUserTurnFields(
  session: { user_turns: number; engaged_at: string | null },
  nowIso: string
): { user_turns: number; engaged_at: string } {
  return {
    user_turns: session.user_turns + 1,
    engaged_at: session.engaged_at ?? nowIso,
  };
}
