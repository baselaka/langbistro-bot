import { describe, expect, it } from "vitest";
import {
  parseGrantDuration,
  periodEndFromGrantDuration,
  shouldRevokeEntitlement,
} from "../subscriptionRules";

const NOW = Date.parse("2026-09-08T12:00:00.000Z");
const PAST = "2026-09-01T00:00:00.000Z";
const FUTURE = "2026-10-01T00:00:00.000Z";

describe("shouldRevokeEntitlement", () => {
  it("revokes when there is no entitlement row", () => {
    expect(shouldRevokeEntitlement(null, NOW)).toBe(true);
  });

  it("keeps a forever comp (NULL period end)", () => {
    expect(
      shouldRevokeEntitlement(
        { source: "comp", status: "active", current_period_end: null },
        NOW
      )
    ).toBe(false);
  });

  it("revokes a timed-out comp", () => {
    expect(
      shouldRevokeEntitlement(
        { source: "comp", status: "active", current_period_end: PAST },
        NOW
      )
    ).toBe(true);
  });

  it("keeps a future-dated comp", () => {
    expect(
      shouldRevokeEntitlement(
        { source: "comp", status: "active", current_period_end: FUTURE },
        NOW
      )
    ).toBe(false);
  });

  it("keeps an active paddle subscription", () => {
    expect(
      shouldRevokeEntitlement(
        { source: "paddle", status: "active", current_period_end: null },
        NOW
      )
    ).toBe(false);
  });

  it("revokes canceled paddle with NULL period end", () => {
    expect(
      shouldRevokeEntitlement(
        { source: "paddle", status: "canceled", current_period_end: null },
        NOW
      )
    ).toBe(true);
  });

  it("keeps canceled paddle during mid-period grace", () => {
    expect(
      shouldRevokeEntitlement(
        { source: "paddle", status: "canceled", current_period_end: FUTURE },
        NOW
      )
    ).toBe(false);
  });

  it("revokes canceled paddle after period end", () => {
    expect(
      shouldRevokeEntitlement(
        { source: "paddle", status: "canceled", current_period_end: PAST },
        NOW
      )
    ).toBe(true);
  });

  it("treats active trial like comp for NULL / past end", () => {
    expect(
      shouldRevokeEntitlement(
        { source: "trial", status: "active", current_period_end: null },
        NOW
      )
    ).toBe(false);
    expect(
      shouldRevokeEntitlement(
        { source: "trial", status: "active", current_period_end: PAST },
        NOW
      )
    ).toBe(true);
  });
});

describe("parseGrantDuration", () => {
  it("parses forever", () => {
    expect(parseGrantDuration("forever")).toEqual({ kind: "forever" });
    expect(parseGrantDuration("Forever")).toEqual({ kind: "forever" });
  });

  it("parses day durations", () => {
    expect(parseGrantDuration("30d")).toEqual({ kind: "days", days: 30 });
    expect(parseGrantDuration("7D")).toEqual({ kind: "days", days: 7 });
  });

  it("rejects invalid input", () => {
    expect(parseGrantDuration("30")).toBeNull();
    expect(parseGrantDuration("0d")).toBeNull();
    expect(parseGrantDuration("abc")).toBeNull();
  });
});

describe("periodEndFromGrantDuration", () => {
  it("returns null for forever", () => {
    expect(periodEndFromGrantDuration({ kind: "forever" })).toBeNull();
  });

  it("adds days in UTC", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    expect(periodEndFromGrantDuration({ kind: "days", days: 30 }, now)).toBe(
      "2026-10-08T12:00:00.000Z"
    );
  });
});
