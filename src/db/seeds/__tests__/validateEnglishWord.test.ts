import { describe, expect, it } from "vitest";
import {
  EN_BACKFILL_WORDS,
  EN_JUNK_REPLACEMENTS,
  EN_REPLACEMENT_GLOSSES,
  EN_UNMAPPABLE_JUNK,
} from "../enJunkReplacements";
import {
  assertEnglishSeedWords,
  structuralEnglishOk,
  validateEnglishSeedWord,
} from "../validateEnglishWord";

const tinyLexicon = new Set([
  "ready",
  "test",
  "a",
  "i",
  "wasn't",
  "i'll",
  "o'clock",
  "don't",
  "so-called",
  "good-bye",
  "horizon",
]);

describe("EN_JUNK_REPLACEMENTS", () => {
  it("maps junk to distinct teachable targets with glosses", () => {
    const targets = Object.values(EN_JUNK_REPLACEMENTS);
    expect(new Set(targets).size).toBe(targets.length);
    for (const target of targets) {
      if (target === "because") continue; // may already exist; gloss optional for collision path
      expect(EN_REPLACEMENT_GLOSSES[target]).toBeDefined();
      expect(structuralEnglishOk(target)).toBe(true);
    }
  });

  it("includes dangerous contraction stems from PRS-99", () => {
    for (const stem of ["wasn", "won", "haven", "don", "ain"]) {
      expect(EN_JUNK_REPLACEMENTS[stem]).toBeTruthy();
    }
  });
});

describe("validateEnglishSeedWord", () => {
  it("rejects tokenizer junk and stems", () => {
    expect(validateEnglishSeedWord("wasn", tinyLexicon)).toBe("contraction_stem");
    expect(validateEnglishSeedWord("'ll", tinyLexicon)).toBe("contraction_stem");
    expect(validateEnglishSeedWord("won", tinyLexicon)).toBe("contraction_stem");
    expect(validateEnglishSeedWord("haven", tinyLexicon)).toBe("contraction_stem");
    expect(validateEnglishSeedWord("b", tinyLexicon)).toBe("single_letter");
    expect(validateEnglishSeedWord("'s-", tinyLexicon)).toBe("unmappable_junk");
    expect(validateEnglishSeedWord("uh", tinyLexicon)).toBe("unmappable_junk");
  });

  it("accepts real words and internal contractions", () => {
    expect(validateEnglishSeedWord("ready", tinyLexicon)).toBeNull();
    expect(validateEnglishSeedWord("test", tinyLexicon)).toBeNull();
    expect(validateEnglishSeedWord("a", tinyLexicon)).toBeNull();
    expect(validateEnglishSeedWord("i", tinyLexicon)).toBeNull();
    expect(validateEnglishSeedWord("wasn't", tinyLexicon)).toBeNull();
    expect(validateEnglishSeedWord("i'll", tinyLexicon)).toBeNull();
    expect(validateEnglishSeedWord("o'clock", tinyLexicon)).toBeNull();
    expect(validateEnglishSeedWord("so-called", tinyLexicon)).toBeNull();
  });

  it("rejects lexicon misses", () => {
    expect(validateEnglishSeedWord("zzzznotaword", tinyLexicon)).toBe("not_in_lexicon");
  });

  it("assertEnglishSeedWords throws on a dirty batch", () => {
    expect(() => assertEnglishSeedWords(["ready", "wasn", "'ll"], tinyLexicon)).toThrow(
      /Rejected 2/
    );
  });

  it("assertEnglishSeedWords passes a clean batch", () => {
    expect(() => assertEnglishSeedWords(["ready", "wasn't", "a"], tinyLexicon)).not.toThrow();
  });
});

describe("EN_UNMAPPABLE_JUNK / backfill", () => {
  it("lists known unmappable fragments", () => {
    expect(EN_UNMAPPABLE_JUNK.has("'s")).toBe(true);
    expect(EN_UNMAPPABLE_JUNK.has("'cause")).toBe(true);
  });

  it("backfill words are structurally valid and unique", () => {
    expect(EN_BACKFILL_WORDS.length).toBeGreaterThan(50);
    expect(new Set(EN_BACKFILL_WORDS).size).toBe(EN_BACKFILL_WORDS.length);
    for (const word of EN_BACKFILL_WORDS) {
      expect(structuralEnglishOk(word)).toBe(true);
      expect(word in EN_JUNK_REPLACEMENTS).toBe(false);
    }
  });
});
