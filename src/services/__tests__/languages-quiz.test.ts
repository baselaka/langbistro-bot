import { describe, expect, it } from "vitest";
import { buildFillBlankPrompts, buildReviewMessage } from "../dailySession";
import { getQuizMessages } from "../quizHandler";
import { getMilestoneMessage } from "../vocabulary";

describe("language-aware quiz helpers", () => {
  it("builds English fill-blank prompts and does not fall through to Spanish", () => {
    const prompts = buildFillBlankPrompts("hello", "en", "Hello, how are you today?");
    expect(prompts.system).toContain("English");
    expect(prompts.system).not.toContain("Spanish language teacher");
    expect(prompts.system).toContain("Do not reuse or lightly paraphrase this example sentence");
    expect(prompts.user).toContain("English word: hello");
  });

  it("builds French fill-blank prompts", () => {
    const prompts = buildFillBlankPrompts("bonjour", "fr");
    expect(prompts.system).toContain("French");
    expect(prompts.user).toContain("French word: bonjour");
  });

  it("returns English quiz messages instead of Spanish fallback", () => {
    const messages = getQuizMessages("en");
    expect(messages.correct[0]).toBe("Correct! 🎉");
    expect(messages.encouragement[0]).toBe("Keep going! 💪");
  });

  it("builds language-aware review prompts", () => {
    expect(buildReviewMessage({ id: 1, word: "hello", translation: "a greeting", example_sentence: null, tier: 1, frequency_rank: 1 }, "en")).toContain(
      "English"
    );
    expect(buildReviewMessage({ id: 1, word: "casa", translation: "house", example_sentence: null, tier: 1, frequency_rank: 1 }, "es")).toContain(
      "Spanish"
    );
  });

  it("returns language-neutral milestone copy for English", () => {
    const msg = getMilestoneMessage(50, "en");
    expect(msg).toContain("English");
    expect(msg).not.toContain("Spanish");
    expect(msg).not.toContain("¡");
  });
});
