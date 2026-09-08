import { describe, expect, it } from "vitest";
import {
  isDailyWordDelivered,
  nextUserTurnFields,
  nextWinbackAction,
  previousCalendarDay,
  silenceDaysSince,
  trailingUnengagedDeliveryCount,
  UNENGAGED_SUPPRESS_DAYS,
} from "../dailySessionMetrics";

describe("isDailyWordDelivered", () => {
  it("is false until words have been sent", () => {
    expect(isDailyWordDelivered({ delivered_at: null })).toBe(false);
    expect(isDailyWordDelivered({})).toBe(false);
  });

  it("is true once delivered_at is set, even if the user never replied", () => {
    expect(isDailyWordDelivered({ delivered_at: "2026-09-07T08:00:00.000Z" })).toBe(true);
  });
});

describe("nextUserTurnFields", () => {
  it("counts the first reply as engagement without requiring a prior delivery", () => {
    expect(
      nextUserTurnFields({ user_turns: 0, engaged_at: null }, "2026-09-07T12:00:00.000Z")
    ).toEqual({ user_turns: 1, engaged_at: "2026-09-07T12:00:00.000Z" });
  });

  it("increments later turns and keeps the original engaged_at", () => {
    expect(
      nextUserTurnFields(
        { user_turns: 1, engaged_at: "2026-09-07T12:00:00.000Z" },
        "2026-09-07T12:05:00.000Z"
      )
    ).toEqual({ user_turns: 2, engaged_at: "2026-09-07T12:00:00.000Z" });
  });
});

describe("previousCalendarDay", () => {
  it("returns the prior UTC calendar day", () => {
    expect(previousCalendarDay("2026-09-08")).toBe("2026-09-07");
    expect(previousCalendarDay("2026-03-01")).toBe("2026-02-28");
  });
});

describe("trailingUnengagedDeliveryCount", () => {
  it("counts consecutive newest unengaged deliveries", () => {
    expect(
      trailingUnengagedDeliveryCount([
        { date: "2026-09-08", delivered_at: "t", engaged_at: null },
        { date: "2026-09-07", delivered_at: "t", engaged_at: null },
        { date: "2026-09-06", delivered_at: "t", engaged_at: null },
      ])
    ).toBe(3);
  });

  it("stops at an engaged delivery", () => {
    expect(
      trailingUnengagedDeliveryCount([
        { date: "2026-09-08", delivered_at: "t", engaged_at: null },
        { date: "2026-09-07", delivered_at: "t", engaged_at: "e" },
        { date: "2026-09-06", delivered_at: "t", engaged_at: null },
      ])
    ).toBe(1);
  });

  it("stops on a calendar gap between delivered days", () => {
    expect(
      trailingUnengagedDeliveryCount([
        { date: "2026-09-08", delivered_at: "t", engaged_at: null },
        { date: "2026-09-06", delivered_at: "t", engaged_at: null },
      ])
    ).toBe(1);
  });

  it("ignores undelivered rows when counting", () => {
    expect(
      trailingUnengagedDeliveryCount([
        { date: "2026-09-08", delivered_at: "t", engaged_at: null },
        { date: "2026-09-07", delivered_at: null, engaged_at: null },
        { date: "2026-09-06", delivered_at: "t", engaged_at: null },
      ])
    ).toBe(1);
  });

  it("reaches the suppress threshold at exactly 7", () => {
    const sessions = Array.from({ length: 7 }, (_, i) => {
      const day = 8 - i;
      return {
        date: `2026-09-0${day}`,
        delivered_at: "t",
        engaged_at: null as string | null,
      };
    });
    expect(trailingUnengagedDeliveryCount(sessions)).toBe(UNENGAGED_SUPPRESS_DAYS);
  });
});

describe("silenceDaysSince", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  it("uses last_active_at when present", () => {
    expect(silenceDaysSince("2026-09-05T12:00:00.000Z", "2026-01-01T00:00:00.000Z", now)).toBe(3);
  });

  it("falls back to created_at when never active", () => {
    expect(silenceDaysSince(null, "2026-09-01T12:00:00.000Z", now)).toBe(7);
  });
});

describe("nextWinbackAction", () => {
  it("returns hook at stage 0 after 3 days", () => {
    expect(nextWinbackAction(0, 2)).toBeNull();
    expect(nextWinbackAction(0, 3)).toBe("hook");
  });

  it("returns settings at stage 1 after 10 days", () => {
    expect(nextWinbackAction(1, 9)).toBeNull();
    expect(nextWinbackAction(1, 10)).toBe("settings");
  });

  it("returns final at stage 2 after 21 days", () => {
    expect(nextWinbackAction(2, 20)).toBeNull();
    expect(nextWinbackAction(2, 21)).toBe("final");
  });

  it("returns null for permanent stage", () => {
    expect(nextWinbackAction(4, 100)).toBeNull();
  });
});
