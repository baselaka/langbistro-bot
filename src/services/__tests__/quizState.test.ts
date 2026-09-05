import { describe, expect, it } from "vitest";
import {
  clearQuizState,
  getQuizState,
  isInQuiz,
  replaceQuizAfterWordSet,
  sendAndClearQuiz,
  setQuizState,
  type QuizState,
} from "../quizState";

const telegramId = 900022;

const oldQuiz: QuizState = {
  type: "fill_blank",
  word: "casa",
  vocabularyId: 1,
  targetLanguage: "es",
};

const newQuiz: QuizState = {
  type: "fill_blank",
  word: "chien",
  vocabularyId: 2,
  targetLanguage: "fr",
};

function seedOldQuiz(): void {
  setQuizState(telegramId, oldQuiz);
}

describe("sendAndClearQuiz", () => {
  it("clears quiz expectation after an inactivity message is sent", async () => {
    seedOldQuiz();

    await sendAndClearQuiz(telegramId, async () => {
      // simulate successful outbound inactivity message
    });

    expect(isInQuiz(telegramId)).toBe(false);
    expect(getQuizState(telegramId)).toBeUndefined();
  });

  it("does not clear quiz if sending the inactivity message fails", async () => {
    seedOldQuiz();

    await expect(
      sendAndClearQuiz(telegramId, async () => {
        throw new Error("telegram send failed");
      })
    ).rejects.toThrow("telegram send failed");

    expect(isInQuiz(telegramId)).toBe(true);
    expect(getQuizState(telegramId)?.word).toBe("casa");
    clearQuizState(telegramId);
  });
});

describe("replaceQuizAfterWordSet", () => {
  it("drops the previous quiz as soon as the new word set is sent", async () => {
    seedOldQuiz();
    let sawQuizDuringFillBlank = true;

    await replaceQuizAfterWordSet(
      telegramId,
      async () => {
        // word list delivered
      },
      async () => {
        sawQuizDuringFillBlank = isInQuiz(telegramId);
      },
      newQuiz
    );

    expect(sawQuizDuringFillBlank).toBe(false);
    expect(getQuizState(telegramId)).toEqual(newQuiz);
    clearQuizState(telegramId);
  });

  it("does not grade against the old quiz if the new quiz prompt fails to send", async () => {
    seedOldQuiz();

    await expect(
      replaceQuizAfterWordSet(
        telegramId,
        async () => {
          // word set sent
        },
        async () => {
          throw new Error("fill-blank send failed");
        },
        newQuiz
      )
    ).rejects.toThrow("fill-blank send failed");

    expect(isInQuiz(telegramId)).toBe(false);
    expect(getQuizState(telegramId)).toBeUndefined();
  });

  it("keeps the previous quiz if the new word set never sends", async () => {
    seedOldQuiz();

    await expect(
      replaceQuizAfterWordSet(
        telegramId,
        async () => {
          throw new Error("word list send failed");
        },
        async () => {
          throw new Error("should not send quiz prompt");
        },
        newQuiz
      )
    ).rejects.toThrow("word list send failed");

    expect(getQuizState(telegramId)?.word).toBe("casa");
    clearQuizState(telegramId);
  });
});
