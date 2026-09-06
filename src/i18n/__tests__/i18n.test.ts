import { describe, expect, it } from "vitest";
import {
  catalogFor,
  catalogKeys,
  defaultInterfaceLanguage,
  getMilestoneMessage,
  interpolate,
  languageDisplayLabel,
  localeFromTelegramCode,
  parseInterfaceLanguage,
  pickerLabel,
  interfacePickerLabel,
  settingsLevelAsk,
  t,
  tMd2,
  buildMetaExplanationRule,
} from "../index";
import { escapeMarkdownV2 } from "../../utils/markdown";
import { en } from "../catalogs/en";

describe("interface locale parsing", () => {
  it("maps Telegram language_code prefixes onto supported UI locales", () => {
    expect(localeFromTelegramCode("es")).toBe("es");
    expect(localeFromTelegramCode("es-MX")).toBe("es");
    expect(localeFromTelegramCode("ES_AR")).toBe("es");
    expect(localeFromTelegramCode("pt-BR")).toBe("pt");
    expect(localeFromTelegramCode("pt-PT")).toBe("pt");
    expect(localeFromTelegramCode("ru")).toBe("ru");
    expect(localeFromTelegramCode("ru-RU")).toBe("ru");
  });

  it("falls back to English for unknown or missing codes", () => {
    expect(localeFromTelegramCode(null)).toBe("en");
    expect(localeFromTelegramCode(undefined)).toBe("en");
    expect(localeFromTelegramCode("en")).toBe("en");
    expect(localeFromTelegramCode("de")).toBe("en");
    expect(localeFromTelegramCode("fr")).toBe("en");
    expect(defaultInterfaceLanguage("zh-Hans")).toBe("en");
  });

  it("parses stored interface_language values", () => {
    expect(parseInterfaceLanguage("pt")).toBe("pt");
    expect(parseInterfaceLanguage("nope")).toBe("en");
    expect(parseInterfaceLanguage(null, "ru")).toBe("ru");
  });
});

describe("t()", () => {
  it("interpolates placeholders", () => {
    expect(interpolate("Hello {name}", { name: "Bistro" })).toBe("Hello Bistro");
    expect(t("en", "settings.levelLine", { level: "Beginner" })).toBe("📊 Level: Beginner");
  });

  it("falls back to English when a catalog is missing a runtime key", () => {
    expect(t("es", "start.hello")).toBe("¡Hola desde LangBistro!");
    expect(t("en", "start.hello")).toBe("Hello from LangBistro!");
  });

  it("keeps the same keys across catalogs", () => {
    const keys = catalogKeys().sort();
    expect(Object.keys(catalogFor("es")).sort()).toEqual(keys);
    expect(Object.keys(catalogFor("pt")).sort()).toEqual(keys);
    expect(Object.keys(catalogFor("ru")).sort()).toEqual(keys);
    expect(Object.keys(catalogFor("en")).sort()).toEqual(Object.keys(en).sort());
  });
});

describe("MarkdownV2 interpolation", () => {
  it("escapes interpolated values but keeps template markup", () => {
    const text = tMd2("en", "daily.wordsHeader");
    expect(text).toContain("*Your 10 words for today:*");
    expect(escapeMarkdownV2("hola.")).toBe("hola\\.");
    expect(tMd2("en", "daily.fillBlank", { blanked: "Hola (amigo)!" })).toContain(
      "Hola \\(amigo\\)\\!"
    );
  });
});

describe("localized learning-language chrome", () => {
  it("localizes picker and display labels", () => {
    expect(pickerLabel("en", "es", "en")).toBe("🇬🇧 English");
    expect(pickerLabel("en", "en", "en")).toBe("🇬🇧 English ✓");
    expect(languageDisplayLabel("en", "en")).toBe("English 🇬🇧");
    expect(pickerLabel("es", "fr", "es")).toContain("español");
    expect(pickerLabel("fr", "es", "ru")).toContain("французский");
  });

  it("marks the current interface language on picker labels", () => {
    expect(interfacePickerLabel("en", "es")).toBe("English");
    expect(interfacePickerLabel("es", "es")).toBe("Español ✓");
    expect(interfacePickerLabel("ru", "pt")).toBe("Русский");
    expect(interfacePickerLabel("pt", "pt")).toBe("Português ✓");
  });

  it("localizes settings level ask", () => {
    expect(settingsLevelAsk("en", "en")).toBe("What is your English level?");
    expect(settingsLevelAsk("fr", "en")).toBe("What is your French level?");
    expect(settingsLevelAsk("es", "en")).toBe("What is your Spanish level?");
    expect(settingsLevelAsk("es", "es")).toContain("español");
  });

  it("localizes milestone copy", () => {
    const msg = getMilestoneMessage(50, "en", "en");
    expect(msg).toContain("English");
    expect(msg).not.toContain("Spanish");
    expect(getMilestoneMessage(50, "es", "es")).toContain("español");
    expect(getMilestoneMessage(49, "en", "en")).toBeNull();
  });
});

describe("GPT meta-explanation rule", () => {
  it("keeps simpler English paraphrase for ESL + English UI", () => {
    const rule = buildMetaExplanationRule("en", "en");
    expect(rule).toContain("simpler English");
    expect(rule).toContain("Do not translate");
  });

  it("asks for interface-language explanations otherwise", () => {
    const ruEs = buildMetaExplanationRule("es", "ru");
    expect(ruEs).toContain("Russian");
    expect(ruEs).toContain("Spanish");
    expect(ruEs).not.toContain("simpler English");

    const esEn = buildMetaExplanationRule("en", "es");
    expect(esEn).toContain("Spanish");
    expect(esEn).toContain("English");
  });
});
