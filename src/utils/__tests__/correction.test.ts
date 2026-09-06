import { describe, expect, it } from "vitest";
import {
  formatCorrectionMarkdownV2,
  normalizeCorrection,
  shouldKeepCorrection,
} from "../correction";

function identity(value: string): string {
  return value;
}

describe("normalizeCorrection", () => {
  it("strikes only the wrong word when both fields are full sentences", () => {
    const result = normalizeCorrection(
      "El repetir de idiomas es muy importante para el futuro",
      "El estudio de idiomas es muy importante para el futuro"
    );

    expect(result.mistake).toBe("repetir");
    expect(result.correctedSentence).toBe("El estudio de idiomas es muy importante para el futuro");
  });

  it("keeps a fragment original and a full corrected sentence", () => {
    const result = normalizeCorrection(
      "repetir",
      "El estudio de idiomas es muy importante para el futuro"
    );

    expect(result.mistake).toBe("repetir");
    expect(result.correctedSentence).toBe("El estudio de idiomas es muy importante para el futuro");
  });

  it("does not strike the whole original sentence when corrected is only a word", () => {
    const result = normalizeCorrection(
      "El repetir de idiomas es muy importante para el futuro",
      "estudio"
    );

    expect(result.mistake).toBe("");
    expect(result.correctedSentence).toBe("estudio");
  });

  it("reconstructs the full sentence when both fields are fragments and user text is available", () => {
    const result = normalizeCorrection(
      "repetir",
      "estudio",
      "El repetir de idiomas es muy importante para el futuro"
    );

    expect(result.mistake).toBe("repetir");
    expect(result.correctedSentence).toBe("El estudio de idiomas es muy importante para el futuro");
  });

  it("replaces a close misspelling when the model returns only the corrected word", () => {
    const result = normalizeCorrection("Yo hablo español todos los días", "habló");

    expect(result.mistake).toBe("hablo");
    expect(result.correctedSentence).toBe("Yo habló español todos los días");
  });

  it("strikes a multi-word phrase", () => {
    const result = normalizeCorrection("Quiero que tu vas conmigo", "Quiero que tú vayas conmigo");

    expect(result.mistake).toBe("tu vas");
    expect(result.correctedSentence).toBe("Quiero que tú vayas conmigo");
  });

  it("returns no mistake fragment for a missing-word insertion", () => {
    const result = normalizeCorrection(
      "Yo voy escuela todos los días",
      "Yo voy a la escuela todos los días"
    );

    expect(result.mistake).toBe("");
    expect(result.correctedSentence).toBe("Yo voy a la escuela todos los días");
  });

  it("strikes an extra word the user inserted", () => {
    const result = normalizeCorrection("Yo voy a a la escuela ahora", "Yo voy a la escuela ahora");

    expect(result.mistake).toBe("a");
    expect(result.correctedSentence).toBe("Yo voy a la escuela ahora");
  });

  it("ignores trailing punctuation when aligning sentences", () => {
    const result = normalizeCorrection(
      "El repetir de idiomas es muy importante para el futuro.",
      "El estudio de idiomas es muy importante para el futuro."
    );

    expect(result.mistake).toBe("repetir");
  });

  it("handles a short one-word correction", () => {
    const result = normalizeCorrection("voy", "fui");

    expect(result.mistake).toBe("voy");
    expect(result.correctedSentence).toBe("fui");
  });

  it("handles French phrase replacement", () => {
    const result = normalizeCorrection(
      "Je suis allé au magasin hier",
      "Je suis allée au magasin hier"
    );

    expect(result.mistake).toBe("allé");
    expect(result.correctedSentence).toBe("Je suis allée au magasin hier");
  });
});

describe("formatCorrectionMarkdownV2", () => {
  it("formats the expected Telegram correction shape", () => {
    const markdown = formatCorrectionMarkdownV2(
      "El repetir de idiomas es muy importante para el futuro",
      "El estudio de idiomas es muy importante para el futuro",
      identity
    );

    expect(markdown).toBe("~repetir~ \\-\\> *El estudio de idiomas es muy importante para el futuro*");
  });

  it("does not wrap a full original sentence in strikethrough", () => {
    const markdown = formatCorrectionMarkdownV2(
      "El repetir de idiomas es muy importante para el futuro",
      "estudio",
      identity
    );

    expect(markdown).toBe(
      "El repetir de idiomas es muy importante para el futuro \\-\\> *estudio*"
    );
    expect(markdown.startsWith("~")).toBe(false);
  });

  it("strikes only the attempted blank in a spoken fill-blank sentence", () => {
    const markdown = formatCorrectionMarkdownV2(
      "Solo di siedimos salir temprano para evitar el tráfico.",
      "Entonces, decidimos salir temprano para evitar el tráfico.",
      identity
    );

    expect(markdown).toBe(
      "~Solo di siedimos~ \\-\\> *Entonces, decidimos salir temprano para evitar el tráfico.*"
    );
  });
});

describe("shouldKeepCorrection", () => {
  it("drops stylistic paraphrases of valid English (pelmeni case)", () => {
    expect(
      shouldKeepCorrection(
        "and what about yourself?",
        "I love pelmeni. What about you?",
        "I love pelmeni, and what about yourself?"
      )
    ).toBe(false);
  });

  it("drops stale corrections that are not grounded in the latest user text (borscht case)", () => {
    expect(
      shouldKeepCorrection(
        "and what about yourself?",
        "I love pelmeni. What about you?",
        "I like borscht. Do you like borscht?"
      )
    ).toBe(false);
  });

  it("keeps a real vocabulary mistake grounded in the user text", () => {
    expect(
      shouldKeepCorrection(
        "I go to school yesterday",
        "I went to school yesterday",
        "I go to school yesterday"
      )
    ).toBe(true);
  });
});
