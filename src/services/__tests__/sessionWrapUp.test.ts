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
  const tenWords = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    word: `w${i + 1}`,
  }));

  it("completes when all sent words are used, even with few turns", () => {
    expect(shouldAutoComplete(tenWords, tenWords, 1)).toBe(true);
  });

  it("completes when enough target-language turns even if words remain", () => {
    expect(shouldAutoComplete(tenWords, tenWords.slice(0, 2), 5)).toBe(true);
  });

  it("does not complete on partial words below the turn floor", () => {
    expect(shouldAutoComplete(tenWords, tenWords.slice(0, 2), 3)).toBe(false);
  });

  it("does not complete on empty words_sent regardless of turns", () => {
    expect(shouldAutoComplete([], [], 5)).toBe(false);
    expect(shouldAutoComplete([], [], 0)).toBe(false);
  });

  it("does not complete when some words remain and turns are below floor", () => {
    expect(shouldAutoComplete(sent, [{ id: 1, word: "comer" }], 1)).toBe(false);
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
