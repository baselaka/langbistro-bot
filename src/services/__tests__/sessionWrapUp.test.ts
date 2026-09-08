import { describe, expect, it } from "vitest";
import {
  buildChecklistMessage,
  buildWrapUpMessage,
  shouldAutoComplete,
  unusedWords,
  unusedWordsPromptInjection,
} from "../sessionWrapUp";

const sent = [
  { id: 1, word: "comer" },
  { id: 2, word: "casa" },
  { id: 3, word: "agua" },
];

describe("shouldAutoComplete", () => {
  it("completes when all sent words are used", () => {
    expect(shouldAutoComplete(sent, sent)).toBe(true);
  });

  it("does not complete on empty words_sent", () => {
    expect(shouldAutoComplete([], [])).toBe(false);
  });

  it("does not complete when some words remain", () => {
    expect(shouldAutoComplete(sent, [{ id: 1, word: "comer" }])).toBe(false);
  });
});

describe("unusedWords", () => {
  it("returns leftovers", () => {
    expect(unusedWords(sent, [{ id: 2, word: "casa" }])).toEqual([
      { id: 1, word: "comer" },
      { id: 3, word: "agua" },
    ]);
  });
});

describe("buildWrapUpMessage", () => {
  it("includes n/sent, streak, win, and no trailing question", () => {
    const text = buildWrapUpMessage("en", {
      wordsUsed: 7,
      wordsSent: 10,
      streak: 4,
      sessionWin: "comer → como",
      leftoverWord: "hablar",
    });
    expect(text).toContain("7/10");
    expect(text).toContain("4");
    expect(text).toContain("comer → como");
    expect(text).toContain("hablar");
    expect(text.trim().endsWith("?")).toBe(false);
  });

  it("omits the win line when empty and uses fresh-set tomorrow hook", () => {
    const text = buildWrapUpMessage("en", {
      wordsUsed: 10,
      wordsSent: 10,
      streak: 1,
      sessionWin: null,
      leftoverWord: null,
    });
    expect(text).toContain("10/10");
    expect(text.toLowerCase()).not.toContain("win:");
    expect(text).toMatch(/tomorrow|new/i);
    expect(text.trim().endsWith("?")).toBe(false);
  });
});

describe("buildChecklistMessage", () => {
  it("shows progress and used/unused lines", () => {
    const text = buildChecklistMessage("en", sent, [{ id: 1, word: "comer" }]);
    expect(text).toContain("1/3");
    expect(text).toContain("✓ comer");
    expect(text).toContain("casa");
    expect(text).toContain("agua");
  });
});

describe("unusedWordsPromptInjection", () => {
  it("returns null when nothing left", () => {
    expect(unusedWordsPromptInjection([])).toBeNull();
  });

  it("lists unused words", () => {
    const text = unusedWordsPromptInjection([{ id: 3, word: "agua" }]);
    expect(text).toContain("agua");
    expect(text).toContain("Naturally elicit");
  });
});
