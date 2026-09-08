import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrammyError, type Bot } from "grammy";

const {
  getOrCreateDailySessionMock,
  isDailyWordDeliveredMock,
  markDailyWordDeliveredMock,
  buildWordMessageMock,
  buildFillBlankMock,
  getDailyWordsMock,
  attachGlossesMock,
  buildChecklistMessageMock,
  saveChecklistMessageIdMock,
  replaceQuizAfterWordSetMock,
  fromMock,
} = vi.hoisted(() => ({
  getOrCreateDailySessionMock: vi.fn(),
  isDailyWordDeliveredMock: vi.fn(),
  markDailyWordDeliveredMock: vi.fn(),
  buildWordMessageMock: vi.fn(),
  buildFillBlankMock: vi.fn(),
  getDailyWordsMock: vi.fn(),
  attachGlossesMock: vi.fn(),
  buildChecklistMessageMock: vi.fn(),
  saveChecklistMessageIdMock: vi.fn(),
  replaceQuizAfterWordSetMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("../../db/client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("../../services/dailySession", () => ({
  getOrCreateDailySession: getOrCreateDailySessionMock,
  isDailyWordDelivered: isDailyWordDeliveredMock,
  markDailyWordDelivered: markDailyWordDeliveredMock,
  buildWordMessage: buildWordMessageMock,
  buildFillBlank: buildFillBlankMock,
}));

vi.mock("../../services/dailyLoop", () => ({
  saveChecklistMessageId: saveChecklistMessageIdMock,
}));

vi.mock("../../services/sessionWrapUp", () => ({
  buildChecklistMessage: buildChecklistMessageMock,
}));

vi.mock("../../services/quizState", () => ({
  replaceQuizAfterWordSet: replaceQuizAfterWordSetMock,
}));

vi.mock("../../services/vocabGloss", () => ({
  attachGlosses: attachGlossesMock,
}));

vi.mock("../../services/vocabulary", () => ({
  getDailyWords: getDailyWordsMock,
}));

import {
  deliverDailyWordsForUser,
  isTelegramBotBlockedError,
  resetDeliveringUserIdsForTests,
  type DeliveryUser,
} from "../wordDelivery";

const sampleWord = {
  id: 101,
  word: "casa",
  translation: "house",
  example_sentence: "La casa es grande.",
  tier: 1,
  frequency_rank: 1,
  language: "es",
};

const user: DeliveryUser = {
  id: 7,
  telegram_id: 7001,
  preferred_word_timezone: "America/New_York",
  words_learned_count: 3,
  current_tier: 1,
  target_language: "es",
  interface_language: "en",
};

function makeBot(sendMessage: ReturnType<typeof vi.fn>): Bot {
  return { api: { sendMessage } } as unknown as Bot;
}

function blockedError(): GrammyError {
  return new GrammyError(
    "Forbidden: bot was blocked by the user",
    { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" },
    "sendMessage",
    {}
  );
}

describe("isTelegramBotBlockedError", () => {
  it("is true for Grammy 403 blocked-by-user", () => {
    expect(isTelegramBotBlockedError(blockedError())).toBe(true);
  });

  it("is false for other Grammy errors", () => {
    const err = new GrammyError(
      "Too Many Requests",
      { ok: false, error_code: 429, description: "Too Many Requests: retry after 3" },
      "sendMessage",
      {}
    );
    expect(isTelegramBotBlockedError(err)).toBe(false);
  });

  it("is false for non-Grammy errors", () => {
    expect(isTelegramBotBlockedError(new Error("network"))).toBe(false);
  });
});

describe("deliverDailyWordsForUser", () => {
  beforeEach(() => {
    resetDeliveringUserIdsForTests();
    vi.clearAllMocks();

    getOrCreateDailySessionMock.mockResolvedValue({
      id: 42,
      delivered_at: null,
      user_turns: 0,
    });
    isDailyWordDeliveredMock.mockReturnValue(false);
    getDailyWordsMock.mockResolvedValue([sampleWord]);
    attachGlossesMock.mockResolvedValue([sampleWord]);
    buildWordMessageMock.mockReturnValue({
      text: "word list",
      keyboard: {},
    });
    buildChecklistMessageMock.mockReturnValue("checklist");
    buildFillBlankMock.mockResolvedValue({
      message: "fill blank",
      sentence: "La _____ es grande.",
    });
    markDailyWordDeliveredMock.mockResolvedValue(true);
    saveChecklistMessageIdMock.mockResolvedValue(undefined);

    replaceQuizAfterWordSetMock.mockImplementation(
      async (
        _telegramId: number,
        sendWordSet: () => Promise<void>,
        sendNewQuizPrompt: () => Promise<void>
      ) => {
        await sendWordSet();
        await sendNewQuizPrompt();
      }
    );

    fromMock.mockReset();
  });

  it("marks delivered_at only after successful sends", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 99 });
    const callOrder: string[] = [];

    sendMessage.mockImplementation(async () => {
      callOrder.push("send");
      return { message_id: 99 };
    });
    markDailyWordDeliveredMock.mockImplementation(async () => {
      callOrder.push("mark");
      return true;
    });

    await deliverDailyWordsForUser(makeBot(sendMessage), user);

    expect(sendMessage).toHaveBeenCalled();
    expect(markDailyWordDeliveredMock).toHaveBeenCalledTimes(1);
    expect(markDailyWordDeliveredMock).toHaveBeenCalledWith(42, {
      wordsSent: [{ id: 101, word: "casa" }],
      fillBlankWordId: 101,
    });
    expect(callOrder.indexOf("send")).toBeLessThan(callOrder.indexOf("mark"));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("leaves delivered_at unset when sendMessage fails transiently", async () => {
    replaceQuizAfterWordSetMock.mockRejectedValue(new Error("telegram 5xx"));

    await expect(deliverDailyWordsForUser(makeBot(vi.fn()), user)).rejects.toThrow("telegram 5xx");

    expect(markDailyWordDeliveredMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("suppresses blocked users without marking delivered_at", async () => {
    replaceQuizAfterWordSetMock.mockRejectedValue(blockedError());

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    fromMock.mockReturnValue({ update });

    await deliverDailyWordsForUser(makeBot(vi.fn()), user);

    expect(markDailyWordDeliveredMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("users");
    expect(update).toHaveBeenCalledWith({ inactivity_stage: 4 });
    expect(updateEq).toHaveBeenCalledWith("id", 7);
  });
});
