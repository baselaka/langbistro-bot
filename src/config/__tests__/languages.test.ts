import { describe, expect, it } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  buildDetectUserPrompt,
  buildGradeSystemPrompt,
  getLanguageConfig,
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
});
