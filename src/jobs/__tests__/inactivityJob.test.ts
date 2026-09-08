import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrammyError, type Bot } from "grammy";

const { fromMock, sendAndClearQuizMock, resolveGlossMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  sendAndClearQuizMock: vi.fn(),
  resolveGlossMock: vi.fn(),
}));

vi.mock("../../db/client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("../../services/quizState", () => ({
  sendAndClearQuiz: sendAndClearQuizMock,
}));

vi.mock("../../services/vocabGloss", () => ({
  resolveGloss: resolveGlossMock,
}));

import { processWinbackUser, type WinbackUser } from "../inactivityJob";

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

function baseUser(overrides: Partial<WinbackUser> = {}): WinbackUser {
  return {
    id: 11,
    telegram_id: 11001,
    last_active_at: "2026-09-01T12:00:00.000Z",
    created_at: "2026-08-01T12:00:00.000Z",
    inactivity_stage: 0,
    target_language: "es",
    interface_language: "en",
    ...overrides,
  };
}

function mockUsersUpdate(): { update: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> } {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  fromMock.mockImplementation((table: string) => {
    if (table === "users") {
      return { update };
    }
    if (table === "user_vocabulary") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { update, eq };
}

describe("processWinbackUser", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    sendAndClearQuizMock.mockImplementation(async (_id: number, fn: () => Promise<void>) => {
      await fn();
    });
  });

  it("sends the day-3 hook and advances to stage 1", async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const { update, eq } = mockUsersUpdate();

    await processWinbackUser(makeBot(sendMessage), baseUser({ inactivity_stage: 0 }), now);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(String(sendMessage.mock.calls[0]![1])).toContain("hola");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ inactivity_stage: 1, winback_hook_sent_at: now.toISOString() })
    );
    expect(eq).toHaveBeenCalledWith("id", 11);
  });

  it("sends settings offer at stage 1 after 10 days", async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const { update } = mockUsersUpdate();

    await processWinbackUser(
      makeBot(sendMessage),
      baseUser({
        inactivity_stage: 1,
        last_active_at: "2026-08-29T12:00:00.000Z",
      }),
      now
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(String(sendMessage.mock.calls[0]![1])).toContain("/settings");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ inactivity_stage: 2, winback_settings_sent_at: now.toISOString() })
    );
  });

  it("sends final message and sets stage 4", async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const { update } = mockUsersUpdate();

    await processWinbackUser(
      makeBot(sendMessage),
      baseUser({
        inactivity_stage: 2,
        last_active_at: "2026-08-18T12:00:00.000Z",
      }),
      now
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(String(sendMessage.mock.calls[0]![1])).toMatch(/stop messaging|I'll be here/i);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ inactivity_stage: 4, winback_final_sent_at: now.toISOString() })
    );
  });

  it("no-ops when already at stage 4", async () => {
    const sendMessage = vi.fn();
    fromMock.mockReset();

    await processWinbackUser(makeBot(sendMessage), baseUser({ inactivity_stage: 4 }), now);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sets stage 4 when Telegram reports the bot was blocked", async () => {
    const sendMessage = vi.fn().mockRejectedValue(blockedError());
    const { update, eq } = mockUsersUpdate();

    await processWinbackUser(makeBot(sendMessage), baseUser({ inactivity_stage: 0 }), now);

    expect(update).toHaveBeenCalledWith({ inactivity_stage: 4 });
    expect(eq).toHaveBeenCalledWith("id", 11);
  });
});
