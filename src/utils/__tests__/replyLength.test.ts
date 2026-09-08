import { describe, expect, it } from "vitest";
import {
  composeSpokenReply,
  fallbackFollowUpQuestion,
  looksLikeQuestion,
  maxReplyCharsForLevel,
  REPLY_CHAR_CAPS,
  resolveFollowUpQuestion,
  truncateAtSentenceBoundary,
  TTS_BUDGET_CAPS,
} from "../replyLength";

describe("maxReplyCharsForLevel", () => {
  it("maps beginner / intermediate / advanced to statement caps", () => {
    expect(maxReplyCharsForLevel("beginner")).toBe(60);
    expect(maxReplyCharsForLevel("intermediate")).toBe(90);
    expect(maxReplyCharsForLevel("advanced")).toBe(150);
  });

  it("normalizes unknown levels to beginner", () => {
    expect(maxReplyCharsForLevel("unknown")).toBe(REPLY_CHAR_CAPS.beginner);
    expect(maxReplyCharsForLevel("BEGINNER")).toBe(60);
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

describe("looksLikeQuestion / resolveFollowUpQuestion", () => {
  it("detects Latin and fullwidth question marks", () => {
    expect(looksLikeQuestion("And you?")).toBe(true);
    expect(looksLikeQuestion("¿Y tú?")).toBe(true);
    expect(looksLikeQuestion("你好？")).toBe(true);
    expect(looksLikeQuestion("Nice work")).toBe(false);
  });

  it("returns language fallbacks from config", () => {
    expect(fallbackFollowUpQuestion("en")).toBe("And you?");
    expect(fallbackFollowUpQuestion("es")).toBe("¿Y tú?");
    expect(fallbackFollowUpQuestion("fr")).toBe("Et toi ?");
  });

  it("uses fallback when empty or non-interrogative", () => {
    expect(resolveFollowUpQuestion("", "en", { closingTurn: false })).toBe("And you?");
    expect(resolveFollowUpQuestion("Nice work", "en", { closingTurn: false })).toBe("And you?");
    expect(resolveFollowUpQuestion("What did you do after that?", "en", { closingTurn: false })).toBe(
      "What did you do after that?"
    );
  });

  it("returns empty on closing turns without fallback", () => {
    expect(resolveFollowUpQuestion("And you?", "en", { closingTurn: true })).toBe("");
    expect(resolveFollowUpQuestion("", "es", { closingTurn: true })).toBe("");
  });
});

describe("composeSpokenReply", () => {
  it("keeps the follow-up verbatim when the statement is over budget", () => {
    const statement =
      "Good. That's the right form and I am very happy you got it after practicing carefully.";
    const question = "What did you do after that?";
    const result = composeSpokenReply(statement, question, REPLY_CHAR_CAPS.beginner);
    expect(result.endsWith(question)).toBe(true);
    expect(result).toContain(question);
    const statementPart = result.slice(0, result.length - question.length).trimEnd();
    expect(statementPart.length).toBeLessThanOrEqual(REPLY_CHAR_CAPS.beginner);
    expect(statementPart).not.toContain(question);
  });

  it("appends fallback so output still ends with a question mark", () => {
    const result = composeSpokenReply(
      "Nice work today.",
      resolveFollowUpQuestion("", "en", { closingTurn: false }),
      REPLY_CHAR_CAPS.beginner
    );
    expect(result.endsWith("?")).toBe(true);
    expect(result).toContain("And you?");
  });

  it("omits follow-up on closing turns", () => {
    const result = composeSpokenReply(
      "Great job finishing today's words!",
      resolveFollowUpQuestion("And you?", "en", { closingTurn: true }),
      REPLY_CHAR_CAPS.beginner
    );
    expect(result).toBe("Great job finishing today's words!");
    expect(result).not.toContain("?");
  });

  it("keeps combined length within the prior TTS budget for a short question", () => {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      const statement = "A".repeat(REPLY_CHAR_CAPS[level] + 40);
      const question = "And you?"; // 8 chars
      const composed = composeSpokenReply(statement, question, REPLY_CHAR_CAPS[level]);
      expect(composed.length).toBeLessThanOrEqual(TTS_BUDGET_CAPS[level]);
      expect(composed.endsWith(question)).toBe(true);
    }
  });
});
