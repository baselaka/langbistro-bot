import { describe, expect, it } from "vitest";
import { decideFreeUsageAllowance, TEXT_LIMIT, VOICE_LIMIT } from "../usageRules";

describe("usage limits", () => {
  it("sizes free voice to one completed daily session", () => {
    expect(VOICE_LIMIT).toBe(15);
    expect(TEXT_LIMIT).toBe(10);
  });
});

describe("decideFreeUsageAllowance", () => {
  it("allows free voice under the ceiling when the session is open", () => {
    expect(
      decideFreeUsageAllowance({
        type: "voice",
        currentCount: 14,
        sessionCompleted: false,
      })
    ).toEqual({ allowed: true });
  });

  it("blocks free voice once today's session is complete", () => {
    expect(
      decideFreeUsageAllowance({
        type: "voice",
        currentCount: 2,
        sessionCompleted: true,
      })
    ).toEqual({ allowed: false, reason: "session_complete" });
  });

  it("blocks free voice at the cost ceiling even if the loop never completes", () => {
    expect(
      decideFreeUsageAllowance({
        type: "voice",
        currentCount: 15,
        sessionCompleted: false,
      })
    ).toEqual({ allowed: false, reason: "limit" });
  });

  it("ignores session completion for text and keeps the text cap", () => {
    expect(
      decideFreeUsageAllowance({
        type: "text",
        currentCount: 9,
        sessionCompleted: true,
      })
    ).toEqual({ allowed: true });

    expect(
      decideFreeUsageAllowance({
        type: "text",
        currentCount: 10,
        sessionCompleted: false,
      })
    ).toEqual({ allowed: false, reason: "limit" });
  });
});
