import { describe, expect, it } from "vitest";
import { buildWordMessage } from "../dailySession";
import type { DailyWord } from "../srs";

function word(partial: Partial<DailyWord> & Pick<DailyWord, "id" | "word" | "kind">): DailyWord {
  return {
    translation: partial.translation ?? "gloss",
    example_sentence: partial.example_sentence ?? "Example.",
    tier: 1,
    frequency_rank: 1,
    language: "es",
    ...partial,
  };
}

describe("buildWordMessage", () => {
  it("marks due words with 🔁 and leaves new words unmarked", () => {
    const { text } = buildWordMessage(
      [
        word({ id: 1, word: "casa", kind: "new" }),
        word({ id: 2, word: "comer", kind: "due" }),
      ],
      "en"
    );

    expect(text).toContain("*casa* —");
    expect(text).not.toMatch(/\*casa\* 🔁/);
    expect(text).toContain("*comer* 🔁 —");
  });

  it("appends the daily goal line under the word list", () => {
    const { text } = buildWordMessage([word({ id: 1, word: "agua", kind: "new" })], "en");
    expect(text).toContain("/done");
    expect(text).toMatch(/text or voice/i);
    expect(text.indexOf("agua")).toBeLessThan(text.indexOf("/done"));
  });
});
