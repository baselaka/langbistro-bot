import { describe, expect, it } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  buildDetectUserPrompt,
  buildFillBlankPrompts,
  buildGradeSystemPrompt,
  getLanguageConfig,
  getMilestoneMessage,
  isSupportedLanguage,
  languageDisplayLabel,
  parseTargetLanguage,
  pickerLabel,
  settingsLevelAsk,
} from "../languages";

describe("languages config", () => {
  it("includes English among supported languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["es", "fr", "en"]);
  });

  it("parses supported codes and falls back for unknown without fr-else-es collapse", () => {
    expect(parseTargetLanguage("en")).toBe("en");
    expect(parseTargetLanguage("fr")).toBe("fr");
    expect(parseTargetLanguage("es")).toBe("es");
    expect(parseTargetLanguage(null)).toBe("es");
    expect(parseTargetLanguage(undefined)).toBe("es");
    expect(parseTargetLanguage("de")).toBe("es");
    expect(parseTargetLanguage("de", "en")).toBe("en");
  });

  it("isSupportedLanguage accepts only es/fr/en", () => {
    expect(isSupportedLanguage("en")).toBe(true);
    expect(isSupportedLanguage("es")).toBe(true);
    expect(isSupportedLanguage("fr")).toBe(true);
    expect(isSupportedLanguage("de")).toBe(false);
  });

  it("exposes English picker and display labels", () => {
    expect(pickerLabel("en", "es")).toBe("🇬🇧 English");
    expect(pickerLabel("en", "en")).toBe("🇬🇧 English ✓");
    expect(languageDisplayLabel("en")).toBe("English 🇬🇧");
  });

  it("builds English detection prompts that treat English as the target", () => {
    const prompt = buildDetectUserPrompt("Hello there", "en");
    expect(prompt).toContain("written in English");
    expect(prompt).not.toContain("especially English");
  });

  it("builds language-specific grade prompts", () => {
    const en = buildGradeSystemPrompt("fill_blank", "en");
    expect(en).toContain("English learner");
    expect(en).toContain("walk");
    expect(en).not.toContain("Spanish gender");

    const es = buildGradeSystemPrompt("review", "es");
    expect(es).toContain("Spanish learner");
    expect(es).toContain("abierto");
  });

  it("returns English copy from getLanguageConfig", () => {
    const cfg = getLanguageConfig("en");
    expect(cfg.name).toBe("English");
    expect(cfg.whisperLanguage).toBe("en");
    expect(cfg.levelAsk).toContain("English");
    expect(cfg.conversationNudge.reply).toContain("English");
    expect(cfg.fillBlankTeacherPrompt).toContain("English");
    expect(cfg.quizMessages.correct.length).toBeGreaterThan(0);
  });

  it("uses English UI for settings level ask across languages", () => {
    expect(settingsLevelAsk("en")).toBe("What is your English level?");
    expect(settingsLevelAsk("fr")).toBe("What is your French level?");
    expect(settingsLevelAsk("es")).toBe("What is your Spanish level?");
  });

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
    const messages = getLanguageConfig("en").quizMessages;
    expect(messages.correct[0]).toBe("Correct! 🎉");
    expect(messages.encouragement[0]).toBe("Keep going! 💪");
  });

  it("builds language-aware review prompts", () => {
    expect(getLanguageConfig("en").reviewAsk("a greeting")).toContain("English");
    expect(getLanguageConfig("es").reviewAsk("house")).toContain("Spanish");
  });

  it("returns language-neutral milestone copy for English", () => {
    const msg = getMilestoneMessage(50, "en");
    expect(msg).toContain("English");
    expect(msg).not.toContain("Spanish");
    expect(msg).not.toContain("¡");
  });
});
