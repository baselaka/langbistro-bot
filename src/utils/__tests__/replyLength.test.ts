import { describe, expect, it } from "vitest";
import {
  maxReplyCharsForLevel,
  REPLY_CHAR_CAPS,
  truncateAtSentenceBoundary,
} from "../replyLength";

describe("maxReplyCharsForLevel", () => {
  it("maps beginner / intermediate / advanced to ticket caps", () => {
    expect(maxReplyCharsForLevel("beginner")).toBe(90);
    expect(maxReplyCharsForLevel("intermediate")).toBe(120);
    expect(maxReplyCharsForLevel("advanced")).toBe(180);
  });

  it("normalizes unknown levels to beginner", () => {
    expect(maxReplyCharsForLevel("unknown")).toBe(REPLY_CHAR_CAPS.beginner);
    expect(maxReplyCharsForLevel("BEGINNER")).toBe(90);
  });
});

describe("truncateAtSentenceBoundary", () => {
  it("returns text unchanged when within budget", () => {
    expect(truncateAtSentenceBoundary("Hola. ¿Cómo estás?", 90)).toBe("Hola. ¿Cómo estás?");
  });

  it("cuts at the last sentence end within the budget", () => {
    const text = "First sentence. Second sentence goes on and on forever without stopping here.";
    const result = truncateAtSentenceBoundary(text, 20);
    expect(result).toBe("First sentence.");
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith(".")).toBe(true);
  });

  it("never cuts mid-sentence when a boundary exists in budget", () => {
    const text = "Short one! Then a much longer second sentence that exceeds the limit badly.";
    const result = truncateAtSentenceBoundary(text, 40);
    expect(result).toBe("Short one!");
    expect(result).not.toContain("longer");
  });

  it("falls back to last whitespace when no sentence end in budget", () => {
    const text = "wordone wordtwo wordthree wordfour";
    const result = truncateAtSentenceBoundary(text, 18);
    expect(result).toBe("wordone wordtwo");
    expect(result.length).toBeLessThanOrEqual(18);
  });

  it("hard-slices when there is no whitespace or sentence end", () => {
    expect(truncateAtSentenceBoundary("abcdefghij", 5)).toBe("abcde");
  });

  it("supports ellipsis and question marks as boundaries", () => {
    expect(truncateAtSentenceBoundary("Wait… then more text that is too long for the cap.", 10)).toBe(
      "Wait…"
    );
    expect(truncateAtSentenceBoundary("¿Sí? No, mucho más texto después del límite aquí.", 8)).toBe(
      "¿Sí?"
    );
  });
});
