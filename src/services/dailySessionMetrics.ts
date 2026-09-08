/** Consecutive unengaged deliveries that soft-pause daily words. */
export const UNENGAGED_SUPPRESS_DAYS = 7;

/** Reset stage + win-back timestamps when the user re-engages. */
export const WINBACK_REARM_FIELDS = {
  inactivity_stage: 0,
  winback_hook_sent_at: null,
  winback_settings_sent_at: null,
  winback_final_sent_at: null,
} as const;

export type WinbackAction = "hook" | "settings" | "final";

type DeliveredSession = {
  date: string;
  delivered_at?: string | null;
  engaged_at?: string | null;
};

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

/** Previous calendar day as YYYY-MM-DD (UTC date arithmetic). */
export function previousCalendarDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

/**
 * Count trailing consecutive unengaged deliveries, newest-first.
 * Only delivered rows count; stops on engaged_at or a calendar gap between deliveries.
 */
export function trailingUnengagedDeliveryCount(sessions: DeliveredSession[]): number {
  const delivered = sessions
    .filter((s) => Boolean(s.delivered_at))
    .sort((a, b) => b.date.localeCompare(a.date));

  let count = 0;
  let expectedDate: string | null = null;

  for (const session of delivered) {
    if (expectedDate !== null && session.date !== expectedDate) {
      break;
    }
    if (session.engaged_at) {
      break;
    }
    count += 1;
    expectedDate = previousCalendarDay(session.date);
  }

  return count;
}

/** Whole days of silence since last activity (or account creation if never active). */
export function silenceDaysSince(
  lastActiveAt: string | null,
  createdAt: string,
  now: Date
): number {
  const anchor = lastActiveAt ?? createdAt;
  const last = new Date(anchor).getTime();
  return Math.floor((now.getTime() - last) / (1000 * 60 * 60 * 24));
}

/** Next win-back ladder step for the current stage and silence duration. */
export function nextWinbackAction(stage: number, silenceDays: number): WinbackAction | null {
  if (stage === 0 && silenceDays >= 3) {
    return "hook";
  }
  if (stage === 1 && silenceDays >= 10) {
    return "settings";
  }
  if (stage === 2 && silenceDays >= 21) {
    return "final";
  }
  return null;
}
