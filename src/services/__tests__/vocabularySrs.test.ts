import { describe, expect, it } from "vitest";
import { parseSentWords } from "../dailySession";

describe("parseSentWords kind", () => {
  it("preserves new/due kind when present", () => {
    expect(
      parseSentWords([
        { id: 1, word: "casa", kind: "due" },
        { id: 2, word: "perro", kind: "new" },
        { id: 3, word: "gato" },
      ])
    ).toEqual([
      { id: 1, word: "casa", kind: "due" },
      { id: 2, word: "perro", kind: "new" },
      { id: 3, word: "gato" },
    ]);
  });

  it("ignores invalid kind values", () => {
    expect(parseSentWords([{ id: 1, word: "casa", kind: "review" }])).toEqual([
      { id: 1, word: "casa" },
    ]);
  });
});
