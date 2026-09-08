import { describe, expect, it } from "vitest";
import { isDailyWordDelivered, nextUserTurnFields } from "../dailySessionMetrics";

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
