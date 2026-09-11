import { describe, expect, it } from "vitest";
import { buildTutorSystemPrompt, CORRECTION_RULES, SYSTEM_PROMPTS } from "../tutorPrompts";
import { REPLY_CHAR_CAPS } from "../../utils/replyLength";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const LANGS = ["en", "es", "fr"] as const;

describe("tutor system prompts", () => {
  it("requires missing-article and agreement corrections at every level", () => {
    const rules = CORRECTION_RULES.join("\n");
    expect(rules).toContain("missing articles");
    expect(rules).toContain("I'm eating pancake");
    expect(rules).toContain("optional re-attempt invite");
    expect(rules).not.toContain("When in doubt, set correction to null");

    for (const lang of LANGS) {
      for (const level of LEVELS) {
        const prompt = buildTutorSystemPrompt(lang, level, "en");
        expect(prompt).toContain("missing articles");
        expect(prompt).toContain("grammatical native");
        expect(prompt).toContain("optional re-attempt invite");
      }
    }
  });

  it("golden-set: beginner English replies stay grammatical and still correct errors", () => {
    const prompt = SYSTEM_PROMPTS.en.beginner;
    expect(prompt).toContain("grammatical native English");
    expect(prompt).toContain("present continuous");
    expect(prompt).toContain("What are you eating?");
    expect(prompt).toContain("What do you do today?");
    expect(prompt).toContain("missing articles");
    expect(prompt).not.toContain("Use present tense only, avoid past/future/conditionals");
  });

  it("golden-set: beginner Spanish and French replies must stay grammatical", () => {
    expect(SYSTEM_PROMPTS.es.beginner).toContain("grammatical native Spanish");
    expect(SYSTEM_PROMPTS.es.beginner).toContain("missing articles");
    expect(SYSTEM_PROMPTS.fr.beginner).toContain("grammatical native French");
    expect(SYSTEM_PROMPTS.fr.beginner).toContain("missing articles");
  });

  it("includes level-scaled reply character caps for TTS cost control", () => {
    for (const lang of LANGS) {
      for (const level of LEVELS) {
        const prompt = buildTutorSystemPrompt(lang, level, "en");
        const max = REPLY_CHAR_CAPS[level];
        expect(prompt).toContain(`at most ${max} characters`);
        expect(prompt).toContain("followUpQuestion");
      }
    }
  });

  it("requires followUpQuestion in the JSON response shape", () => {
    const prompt = buildTutorSystemPrompt("en", "beginner", "en");
    expect(prompt).toContain('"followUpQuestion":string');
    expect(prompt).toContain("exactly ONE short follow-up question");
  });

  it("hardens meta-explanation for target EN + interface RU", () => {
    const prompt = buildTutorSystemPrompt("en", "beginner", "ru");
    expect(prompt).toContain("CRITICAL —");
    expect(prompt).toContain("in Russian only");
    expect(prompt).toContain("never in English or any other language");
    expect(prompt).toContain(
      "This applies regardless of the language used in earlier messages in this conversation."
    );
  });

  it("hardens meta-explanation for target FR + interface RU", () => {
    const prompt = buildTutorSystemPrompt("fr", "beginner", "ru");
    expect(prompt).toContain("CRITICAL —");
    expect(prompt).toContain("in Russian only");
    expect(prompt).toContain("never in French or any other language");
    expect(prompt).toContain(
      "This applies regardless of the language used in earlier messages in this conversation."
    );
  });

  it("keeps simplified-English explanation rule for target EN + interface EN", () => {
    const prompt = buildTutorSystemPrompt("en", "beginner", "en");
    expect(prompt).toContain("CRITICAL —");
    expect(prompt).toContain("simpler English");
    expect(prompt).toContain("Do not translate into another language.");
    expect(prompt).toContain(
      "This applies regardless of the language used in earlier messages in this conversation."
    );
  });
});
