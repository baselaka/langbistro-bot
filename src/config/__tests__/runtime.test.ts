import { describe, expect, it } from "vitest";
import { isRailwayPrEnvironment } from "../runtime";

describe("isRailwayPrEnvironment", () => {
  it("detects Railway PR preview environment names", () => {
    expect(isRailwayPrEnvironment({ RAILWAY_ENVIRONMENT: "langbistro-bot-pr-13" })).toBe(true);
    expect(isRailwayPrEnvironment({ RAILWAY_ENVIRONMENT_NAME: "pr-12" })).toBe(true);
  });

  it("is false for production", () => {
    expect(isRailwayPrEnvironment({ RAILWAY_ENVIRONMENT: "production" })).toBe(false);
    expect(isRailwayPrEnvironment({})).toBe(false);
  });
});
