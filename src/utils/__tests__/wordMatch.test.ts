import { describe, expect, it } from "vitest";
import { matchNewWords, textContainsWord, tokenizeForMatch } from "../wordMatch";

describe("tokenizeForMatch", () => {
  it("lowercases and strips punctuation", () => {
    expect(tokenizeForMatch("¡Hola, cómo estás?")).toEqual(["hola", "cómo", "estás"]);
  });
});

describe("textContainsWord", () => {
  it("matches Spanish conjugations of comer", () => {
    expect(textContainsWord("Yo como pan", "comer")).toBe(true);
    expect(textContainsWord("Ayer comí pizza", "comer")).toBe(true);
    expect(textContainsWord("Nosotros comemos juntos", "comer")).toBe(true);
  });

  it("matches clitics like comerlo", () => {
    expect(textContainsWord("Quiero comerlo ahora", "comer")).toBe(true);
  });

  it("matches English plurals", () => {
    expect(textContainsWord("I see two houses", "house")).toBe(true);
  });

  it("matches French être irregular forms including suis", () => {
    expect(textContainsWord("Je suis content", "être")).toBe(true);
    expect(textContainsWord("Ils sont là", "être")).toBe(true);
    expect(textContainsWord("Je veux être libre", "être")).toBe(true);
  });

  it("rejects near-misses that are unrelated", () => {
    expect(textContainsWord("El perro corre", "comer")).toBe(false);
    expect(textContainsWord("I like cats", "house")).toBe(false);
  });

  it("requires all parts of a multi-word target", () => {
    expect(textContainsWord("Buenos días amigo", "buenos días")).toBe(true);
    expect(textContainsWord("Buenos amigos", "buenos días")).toBe(false);
  });
});

describe("matchNewWords", () => {
  const sent = [
    { id: 1, word: "comer" },
    { id: 2, word: "casa" },
    { id: 3, word: "agua" },
  ];

  it("returns only newly matched words", () => {
    expect(matchNewWords("Como en mi casa", sent, [{ id: 1, word: "comer" }])).toEqual([
      { id: 2, word: "casa" },
    ]);
  });

  it("returns empty when nothing new matches", () => {
    expect(matchNewWords("Hola mundo", sent, [])).toEqual([]);
  });
});
