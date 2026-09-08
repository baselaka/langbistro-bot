import { describe, expect, it } from "vitest";
import {
  clearPendingCorrection,
  consumePendingCorrection,
  getPendingCorrection,
  storePendingCorrection,
} from "../ux-memory";

describe("pending correction memory", () => {
  it("stores, reads, and clears a pending correction", () => {
    const telegramId = 424242;
    clearPendingCorrection(telegramId);

    storePendingCorrection(telegramId, {
      correctedPhrase: "a pancake",
      correctedSentence: "I'm eating a pancake",
    });

    expect(getPendingCorrection(telegramId)?.correctedPhrase).toBe("a pancake");

    const consumed = consumePendingCorrection(telegramId);
    expect(consumed?.correctedSentence).toBe("I'm eating a pancake");
    expect(getPendingCorrection(telegramId)).toBeUndefined();
  });

  it("replaces an existing pending correction for the same user", () => {
    const telegramId = 424243;
    clearPendingCorrection(telegramId);

    storePendingCorrection(telegramId, {
      correctedPhrase: "a",
      correctedSentence: "I want a coffee",
    });
    storePendingCorrection(telegramId, {
      correctedPhrase: "went",
      correctedSentence: "I went home",
    });

    expect(getPendingCorrection(telegramId)?.correctedPhrase).toBe("went");
    clearPendingCorrection(telegramId);
  });
});
