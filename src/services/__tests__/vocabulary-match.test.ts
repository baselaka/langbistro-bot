import { describe, expect, it } from "vitest";
import { checkAnswerMatch, startsWithExpectedPhrase } from "../vocabulary";

describe("checkAnswerMatch", () => {
  it("matches the expected word ignoring case and accents", () => {
    expect(checkAnswerMatch("Entonces", "entonces")).toBe(true);
    expect(checkAnswerMatch("  café  ", "cafe")).toBe(true);
  });

  it("does not treat a full sentence as an exact word match", () => {
    expect(
      checkAnswerMatch("entonces, decidimos salir temprano para evitar el tráfico", "entonces")
    ).toBe(false);
  });
});

describe("startsWithExpectedPhrase", () => {
  it("accepts a completed fill-blank sentence that starts with the missing word", () => {
    expect(
      startsWithExpectedPhrase(
        "entonces, decidimos salir temprano para evitar el tráfico",
        "entonces"
      )
    ).toBe(true);
  });

  it("accepts a multi-word expected phrase at the start", () => {
    expect(startsWithExpectedPhrase("te amo mucho", "te amo")).toBe(true);
  });

  it("does not accept the rest of the prompt when the blank is missing", () => {
    expect(
      startsWithExpectedPhrase("decidimos salir temprano para evitar el tráfico", "entonces")
    ).toBe(false);
  });

  it("does not match the expected word later in the given sentence", () => {
    expect(
      startsWithExpectedPhrase("decidimos salir temprano para evitar el tráfico", "para")
    ).toBe(false);
  });
});
