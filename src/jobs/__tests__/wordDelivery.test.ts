import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrammyError, type Bot } from "grammy";

const envState = vi.hoisted(() => ({ winbackSuppressEnabled: true }));

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

vi.mock("../../config/env", () => ({
  env: envState,
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

function mockSessionQuery(rows: Array<{ date: string; delivered_at: string | null; engaged_at: string | null }>) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, order, limit };
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
    envState.winbackSuppressEnabled = true;

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
    fromMock.mockImplementation((table: string) => {
      if (table === "daily_sessions") {
        return mockSessionQuery([]);
      }
      if (table === "users") {
        const updateEq = vi.fn().mockResolvedValue({ error: null });
        const update = vi.fn().mockReturnValue({ eq: updateEq });
        return { update };
      }
      throw new Error(`unexpected table ${table}`);
    });
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
    expect(fromMock).toHaveBeenCalledWith("daily_sessions");
  });

  it("leaves delivered_at unset when sendMessage fails transiently", async () => {
    replaceQuizAfterWordSetMock.mockRejectedValue(new Error("telegram 5xx"));

    await expect(deliverDailyWordsForUser(makeBot(vi.fn()), user)).rejects.toThrow("telegram 5xx");

    expect(markDailyWordDeliveredMock).not.toHaveBeenCalled();
  });

  it("suppresses blocked users without marking delivered_at", async () => {
    replaceQuizAfterWordSetMock.mockRejectedValue(blockedError());

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    fromMock.mockImplementation((table: string) => {
      if (table === "daily_sessions") {
        return mockSessionQuery([]);
      }
      if (table === "users") {
        return { update };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await deliverDailyWordsForUser(makeBot(vi.fn()), user);

    expect(markDailyWordDeliveredMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("daily_sessions");
    expect(fromMock).toHaveBeenCalledWith("users");
    expect(update).toHaveBeenCalledWith({ inactivity_stage: 4 });
    expect(updateEq).toHaveBeenCalledWith("id", 7);
  });

  it("soft-pauses after 7 consecutive unengaged deliveries", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-09-${String(8 - i).padStart(2, "0")}`,
      delivered_at: "2026-09-08T08:00:00.000Z",
      engaged_at: null,
    }));
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    fromMock.mockImplementation((table: string) => {
      if (table === "daily_sessions") {
        return mockSessionQuery(rows);
      }
      if (table === "users") {
        return { update };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await deliverDailyWordsForUser(makeBot(vi.fn()), user);

    expect(getOrCreateDailySessionMock).not.toHaveBeenCalled();
    expect(markDailyWordDeliveredMock).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ inactivity_stage: 1 });
    expect(updateEq).toHaveBeenCalledWith("id", 7);
  });

  it("skips suppress check when WINBACK_SUPPRESS_ENABLED is off", async () => {
    envState.winbackSuppressEnabled = false;
    const rows = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-09-${String(8 - i).padStart(2, "0")}`,
      delivered_at: "2026-09-08T08:00:00.000Z",
      engaged_at: null,
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "daily_sessions") {
        return mockSessionQuery(rows);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const sendMessage = vi.fn().mockResolvedValue({ message_id: 99 });
    await deliverDailyWordsForUser(makeBot(sendMessage), user);

    expect(fromMock).not.toHaveBeenCalled();
    expect(getOrCreateDailySessionMock).toHaveBeenCalled();
    expect(markDailyWordDeliveredMock).toHaveBeenCalled();
  });
});
