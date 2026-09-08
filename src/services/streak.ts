import { daysBetweenLocalDates, previousLocalDateString } from "../utils/dateTz";

export type StreakState = {
  streak_current: number;
  streak_best: number;
  last_completed_date: string | null;
  sessions_completed: number;
  last_freeze_week: string | null;
};

export type StreakUpdate = StreakState & {
  /** False when already completed today — caller must not increment session metrics. */
  applied: boolean;
  /** True when this completion consumed the weekly freeze. */
  freezeConsumed: boolean;
};

/**
 * Pure streak math for a session completion on `today` (YYYY-MM-DD in user TZ).
 * `thisWeek` is an ISO week key like `2026-W37`.
 */
export function nextStreakState(
  current: StreakState,
  today: string,
  thisWeek: string
): StreakUpdate {
  if (current.last_completed_date === today) {
    return { ...current, applied: false, freezeConsumed: false };
  }

  let streakCurrent: number;
  let freezeConsumed = false;
  let lastFreezeWeek = current.last_freeze_week;

  if (!current.last_completed_date) {
    streakCurrent = 1;
  } else {
    const gap = daysBetweenLocalDates(current.last_completed_date, today);
    if (gap === 1) {
      streakCurrent = current.streak_current + 1;
    } else if (gap === 2 && current.last_freeze_week !== thisWeek) {
      streakCurrent = current.streak_current + 1;
      freezeConsumed = true;
      lastFreezeWeek = thisWeek;
    } else {
      streakCurrent = 1;
    }
  }

  return {
    streak_current: streakCurrent,
    streak_best: Math.max(current.streak_best, streakCurrent),
    last_completed_date: today,
    sessions_completed: current.sessions_completed + 1,
    last_freeze_week: lastFreezeWeek,
    applied: true,
    freezeConsumed,
  };
}

export { previousLocalDateString };
