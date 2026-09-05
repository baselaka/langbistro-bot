import { describe, expect, it } from "vitest";
import { normalizeText } from "../text";

describe("normalizeText", () => {
  it("lowercases and trims", () => {
    expect(normalizeText("  Hola  ")).toBe("hola");
  });

  it("strips accents for comparison", () => {
    expect(normalizeText("grácias")).toBe("gracias");
    expect(normalizeText("café")).toBe("cafe");
  });

  it("treats accent variants as equal after normalization", () => {
    expect(normalizeText("grácias")).toBe(normalizeText("gracias"));
  });
});
