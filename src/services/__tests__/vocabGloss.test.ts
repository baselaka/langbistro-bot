import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("../../db/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

import {
  attachGlosses,
  pickGloss,
  resolveGloss,
  shouldUseEnglishColumn,
} from "../vocabGloss";

describe("shouldUseEnglishColumn", () => {
  it("uses English for en interface locale", () => {
    expect(shouldUseEnglishColumn("es", "en")).toBe(true);
    expect(shouldUseEnglishColumn("fr", "en")).toBe(true);
    expect(shouldUseEnglishColumn("en", "en")).toBe(true);
  });

  it("uses English when interface locale matches word language", () => {
    expect(shouldUseEnglishColumn("es", "es")).toBe(true);
  });

  it("looks up the table for cross-language locales", () => {
    expect(shouldUseEnglishColumn("es", "ru")).toBe(false);
    expect(shouldUseEnglishColumn("es", "pt")).toBe(false);
    expect(shouldUseEnglishColumn("fr", "es")).toBe(false);
    expect(shouldUseEnglishColumn("en", "pt")).toBe(false);
  });
});

describe("pickGloss", () => {
  it("uses vocabulary.translation for en locale", () => {
    expect(pickGloss("house", "casa", "es", "en")).toBe("house");
  });

  it("falls back to English when localized gloss is missing", () => {
    expect(pickGloss("house", null, "es", "ru")).toBe("house");
    expect(pickGloss("house", "  ", "es", "ru")).toBe("house");
    expect(pickGloss("house", undefined, "es", "pt")).toBe("house");
  });

  it("never returns blank when English exists", () => {
    expect(pickGloss("house", null, "es", "ru")).not.toBe("");
  });

  it("uses English for same-language Spanish UI", () => {
    expect(pickGloss("house", "casa", "es", "es")).toBe("house");
  });

  it("uses table gloss for Spanish word + Russian UI", () => {
    expect(pickGloss("house", "дом", "es", "ru")).toBe("дом");
  });

  it("uses Portuguese gloss for ESL English word", () => {
    expect(pickGloss("relax; cool down", "relaxar", "en", "pt")).toBe("relaxar");
  });
});

describe("resolveGloss / attachGlosses", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  function mockTranslationsQuery(rows: Array<{ vocabulary_id: number; gloss: string }>): void {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.in = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => ({
      data: rows[0] ? { gloss: rows[0].gloss } : null,
      error: null,
    }));
    // For .in() batch path, the final awaited value is { data, error }
    Object.assign(builder, {
      then: undefined,
    });
    // Make the builder thenable for await supabase.from(...).select().in().eq()
    (builder as { then?: typeof Promise.prototype.then }).then = (
      onfulfilled: (value: { data: typeof rows; error: null }) => unknown,
      onrejected?: (reason: unknown) => unknown
    ) => Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);

    fromMock.mockReturnValue(builder);
  }

  it("resolveGloss uses English column without querying for en locale", async () => {
    const gloss = await resolveGloss({ id: 1, translation: "house", language: "es" }, "en");
    expect(gloss).toBe("house");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("resolveGloss uses table gloss for ru locale", async () => {
    mockTranslationsQuery([{ vocabulary_id: 1, gloss: "дом" }]);
    const gloss = await resolveGloss({ id: 1, translation: "house", language: "es" }, "ru");
    expect(gloss).toBe("дом");
    expect(fromMock).toHaveBeenCalledWith("vocabulary_translations");
  });

  it("resolveGloss falls back to English when table miss", async () => {
    mockTranslationsQuery([]);
    const gloss = await resolveGloss({ id: 1, translation: "house", language: "es" }, "ru");
    expect(gloss).toBe("house");
  });

  it("attachGlosses batch-resolves and overwrites translation", async () => {
    mockTranslationsQuery([
      { vocabulary_id: 1, gloss: "дом" },
      { vocabulary_id: 2, gloss: "собака" },
    ]);

    const result = await attachGlosses(
      [
        { id: 1, translation: "house", language: "es", word: "casa" },
        { id: 2, translation: "dog", language: "es", word: "perro" },
      ],
      "ru"
    );

    expect(result[0]?.translation).toBe("дом");
    expect(result[1]?.translation).toBe("собака");
  });

  it("attachGlosses skips DB when all words use English column", async () => {
    const result = await attachGlosses(
      [{ id: 1, translation: "house", language: "es", word: "casa" }],
      "en"
    );
    expect(result[0]?.translation).toBe("house");
    expect(fromMock).not.toHaveBeenCalled();
  });
});
