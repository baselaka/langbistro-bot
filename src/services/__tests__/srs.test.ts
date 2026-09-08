import { describe, expect, it } from "vitest";
import {
  SRS_INTERVALS,
  buildDailyWordSet,
  dueAtFrom,
  nextIntervalDays,
  productionFailurePatch,
  productionSuccessPatch,
  resetIntervalDays,
  type VocabRow,
} from "../srs";

const NOW = new Date("2026-09-08T12:00:00.000Z");

function vocab(id: number, word: string): VocabRow {
  return {
    id,
    word,
    translation: word,
    example_sentence: null,
    tier: 1,
    frequency_rank: id,
    language: "es",
  };
}

describe("nextIntervalDays", () => {
  it("advances along the fixed ladder", () => {
    expect(nextIntervalDays(1)).toBe(3);
    expect(nextIntervalDays(3)).toBe(7);
    expect(nextIntervalDays(7)).toBe(14);
    expect(nextIntervalDays(14)).toBe(30);
  });

  it("clamps at 30", () => {
    expect(nextIntervalDays(30)).toBe(30);
  });

  it("falls back to 1 for unknown current values", () => {
    expect(nextIntervalDays(2)).toBe(1);
    expect(nextIntervalDays(0)).toBe(1);
  });
});

describe("resetIntervalDays", () => {
  it("always returns the first ladder step", () => {
    expect(resetIntervalDays()).toBe(SRS_INTERVALS[0]);
  });
});

describe("dueAtFrom", () => {
  it("adds interval days in UTC", () => {
    expect(dueAtFrom(NOW, 1).toISOString()).toBe("2026-09-09T12:00:00.000Z");
    expect(dueAtFrom(NOW, 3).toISOString()).toBe("2026-09-11T12:00:00.000Z");
    expect(dueAtFrom(NOW, 30).toISOString()).toBe("2026-10-08T12:00:00.000Z");
  });
});

describe("productionSuccessPatch", () => {
  it("enrolls at interval 1 on first production", () => {
    expect(productionSuccessPatch(null, NOW)).toEqual({
      interval_days: 1,
      last_produced_at: NOW.toISOString(),
      due_at: "2026-09-09T12:00:00.000Z",
    });
  });

  it("advances an existing interval", () => {
    expect(productionSuccessPatch(1, NOW)).toMatchObject({
      interval_days: 3,
      due_at: "2026-09-11T12:00:00.000Z",
    });
  });
});

describe("productionFailurePatch", () => {
  it("resets to interval 1 and due tomorrow", () => {
    expect(productionFailurePatch(NOW)).toEqual({
      interval_days: 1,
      due_at: "2026-09-09T12:00:00.000Z",
    });
  });
});

describe("buildDailyWordSet", () => {
  it("returns 7 new + 3 due when enough of each exist", () => {
    const due = [1, 2, 3, 4].map((id) => vocab(id, `due${id}`));
    const neu = Array.from({ length: 12 }, (_, i) => vocab(100 + i, `new${i}`));
    const set = buildDailyWordSet(due, neu);
    expect(set).toHaveLength(10);
    expect(set.filter((w) => w.kind === "due")).toHaveLength(3);
    expect(set.filter((w) => w.kind === "new")).toHaveLength(7);
    expect(set.slice(0, 3).map((w) => w.id)).toEqual([1, 2, 3]);
  });

  it("falls back to 10 new when nothing is due", () => {
    const neu = Array.from({ length: 15 }, (_, i) => vocab(100 + i, `new${i}`));
    const set = buildDailyWordSet([], neu);
    expect(set).toHaveLength(10);
    expect(set.every((w) => w.kind === "new")).toBe(true);
  });

  it("fills remaining slots when fewer than 3 due", () => {
    const due = [vocab(1, "a"), vocab(2, "b")];
    const neu = Array.from({ length: 10 }, (_, i) => vocab(100 + i, `new${i}`));
    const set = buildDailyWordSet(due, neu);
    expect(set.filter((w) => w.kind === "due")).toHaveLength(2);
    expect(set.filter((w) => w.kind === "new")).toHaveLength(8);
  });
});
