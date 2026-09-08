/** Fixed production-graded SRS ladder (PRS-89). Expanding schedules intentionally omitted. */
export const SRS_INTERVALS = [1, 3, 7, 14, 30] as const;

export type SrsIntervalDays = (typeof SRS_INTERVALS)[number];

/** Next ladder step after a successful production; clamps at 30. */
export function nextIntervalDays(current: number): SrsIntervalDays {
  const idx = SRS_INTERVALS.indexOf(current as SrsIntervalDays);
  if (idx < 0) {
    return SRS_INTERVALS[0];
  }
  return SRS_INTERVALS[Math.min(idx + 1, SRS_INTERVALS.length - 1)]!;
}

/** Interval after a missed / wrong production. */
export function resetIntervalDays(): SrsIntervalDays {
  return SRS_INTERVALS[0];
}

/** due_at = now + intervalDays (UTC). */
export function dueAtFrom(now: Date, intervalDays: number): Date {
  const due = new Date(now.getTime());
  due.setUTCDate(due.getUTCDate() + intervalDays);
  return due;
}

export type ProductionSuccessPatch = {
  interval_days: SrsIntervalDays;
  last_produced_at: string;
  due_at: string;
};

/** First production enrolls at interval 1; later successes advance the ladder. */
export function productionSuccessPatch(
  existingIntervalDays: number | null,
  now: Date = new Date()
): ProductionSuccessPatch {
  const interval_days =
    existingIntervalDays == null ? SRS_INTERVALS[0] : nextIntervalDays(existingIntervalDays);
  return {
    interval_days,
    last_produced_at: now.toISOString(),
    due_at: dueAtFrom(now, interval_days).toISOString(),
  };
}

export type ProductionFailurePatch = {
  interval_days: SrsIntervalDays;
  due_at: string;
};

/** Missed or wrong production resets to interval 1 and schedules +1 day. */
export function productionFailurePatch(now: Date = new Date()): ProductionFailurePatch {
  const interval_days = resetIntervalDays();
  return {
    interval_days,
    due_at: dueAtFrom(now, interval_days).toISOString(),
  };
}

export type WordKind = "new" | "due";

export type VocabRow = {
  id: number;
  word: string;
  translation: string | null;
  example_sentence: string | null;
  tier: number;
  frequency_rank: number;
  language: string;
};

export type DailyWord = VocabRow & { kind: WordKind };

const DUE_LIMIT = 3;
const DAILY_TOTAL = 10;

/**
 * Mix up to 3 due + fill to 10 with new.
 * Zero due → 10 new. Fewer than 3 due → fill remaining slots with new.
 */
export function buildDailyWordSet(due: VocabRow[], newPool: VocabRow[]): DailyWord[] {
  const dueTaken = due.slice(0, DUE_LIMIT).map((w) => ({ ...w, kind: "due" as const }));
  const newSlots = DAILY_TOTAL - dueTaken.length;
  const newTaken = newPool.slice(0, newSlots).map((w) => ({ ...w, kind: "new" as const }));
  return [...dueTaken, ...newTaken];
}
