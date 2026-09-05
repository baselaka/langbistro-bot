import { describe, expect, it } from "vitest";
import { chatParams, isTemperatureLocked } from "../models";

describe("isTemperatureLocked", () => {
  it("returns true for gpt-5.6 family models", () => {
    expect(isTemperatureLocked("gpt-5.6-terra")).toBe(true);
    expect(isTemperatureLocked("gpt-5.6-luna")).toBe(true);
  });

  it("returns true for gpt-5-mini prefix", () => {
    expect(isTemperatureLocked("gpt-5-mini")).toBe(true);
  });

  it("returns false for GA models that accept custom temperature", () => {
    expect(isTemperatureLocked("gpt-5.2")).toBe(false);
    expect(isTemperatureLocked("gpt-5.4-mini")).toBe(false);
  });
});

describe("chatParams", () => {
  it("includes temperature for temperature-capable models", () => {
    expect(chatParams("gpt-5.4-mini", 0)).toEqual({
      model: "gpt-5.4-mini",
      temperature: 0,
    });
  });

  it("omits temperature for locked models even when a value is passed", () => {
    expect(chatParams("gpt-5.6-terra", 0.7)).toEqual({
      model: "gpt-5.6-terra",
    });
  });

  it("omits temperature when undefined", () => {
    expect(chatParams("gpt-5.2", undefined)).toEqual({ model: "gpt-5.2" });
  });
});
