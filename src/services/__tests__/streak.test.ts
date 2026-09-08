import { describe, expect, it } from "vitest";
import { nextStreakState, previousLocalDateString } from "../streak";

const base = {
  streak_current: 3,
  streak_best: 5,
  last_completed_date: "2026-09-07",
  sessions_completed: 10,
  last_freeze_week: null as string | null,
};

describe("previousLocalDateString", () => {
  it("steps back one calendar day", () => {
    expect(previousLocalDateString("2026-09-08")).toBe("2026-09-07");
    expect(previousLocalDateString("2026-03-01")).toBe("2026-02-28");
  });
});

describe("nextStreakState", () => {
  it("is a no-op when already completed today", () => {
    const result = nextStreakState(
      { ...base, last_completed_date: "2026-09-08" },
      "2026-09-08",
      "2026-W37"
    );
    expect(result.applied).toBe(false);
    expect(result.sessions_completed).toBe(10);
    expect(result.streak_current).toBe(3);
  });

  it("increments on consecutive days", () => {
    const result = nextStreakState(base, "2026-09-08", "2026-W37");
    expect(result).toMatchObject({
      applied: true,
      freezeConsumed: false,
      streak_current: 4,
      streak_best: 5,
      last_completed_date: "2026-09-08",
      sessions_completed: 11,
    });
  });

  it("consumes one freeze for a one-day gap", () => {
    const result = nextStreakState(base, "2026-09-09", "2026-W37");
    expect(result).toMatchObject({
      applied: true,
      freezeConsumed: true,
      streak_current: 4,
      last_freeze_week: "2026-W37",
      sessions_completed: 11,
    });
  });

  it("resets when freeze was already used this week", () => {
    const result = nextStreakState(
      { ...base, last_freeze_week: "2026-W37" },
      "2026-09-09",
      "2026-W37"
    );
    expect(result).toMatchObject({
      applied: true,
      freezeConsumed: false,
      streak_current: 1,
      last_freeze_week: "2026-W37",
      sessions_completed: 11,
    });
  });

  it("resets on a multi-day gap", () => {
    const result = nextStreakState(base, "2026-09-12", "2026-W37");
    expect(result).toMatchObject({
      applied: true,
      streak_current: 1,
      sessions_completed: 11,
    });
  });

  it("starts at 1 on first-ever complete and updates best", () => {
    const result = nextStreakState(
      {
        streak_current: 0,
        streak_best: 0,
        last_completed_date: null,
        sessions_completed: 0,
        last_freeze_week: null,
      },
      "2026-09-08",
      "2026-W37"
    );
    expect(result).toMatchObject({
      applied: true,
      streak_current: 1,
      streak_best: 1,
      sessions_completed: 1,
    });
  });

  it("raises streak_best when current exceeds it", () => {
    const result = nextStreakState(
      { ...base, streak_current: 5, streak_best: 5 },
      "2026-09-08",
      "2026-W37"
    );
    expect(result.streak_current).toBe(6);
    expect(result.streak_best).toBe(6);
  });
});
