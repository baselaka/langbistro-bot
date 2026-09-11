import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());
const generateResponseMock = vi.hoisted(() => vi.fn());
const generateVoiceMock = vi.hoisted(() => vi.fn());
const processDailyUtteranceMock = vi.hoisted(() => vi.fn());
const recordDailySessionUserTurnMock = vi.hoisted(() => vi.fn());

vi.mock("../../db/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock("../../ai/openai", () => ({
  generateResponse: generateResponseMock,
  generateVoice: generateVoiceMock,
  getVoiceSpeedForLevel: () => 1,
}));

vi.mock("../dailyLoop", () => ({
  processDailyUtterance: processDailyUtteranceMock,
}));

vi.mock("../dailySession", () => ({
  recordDailySessionUserTurn: recordDailySessionUserTurnMock,
}));

vi.mock("../../bot/ux-memory", () => ({
  getPendingCorrection: () => undefined,
  clearPendingCorrection: vi.fn(),
}));

import { runAssistantTurn } from "../conversation";

type EqCall = [string, unknown];

function createHistoryBuilder(eqCalls: EqCall[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return builder;
  });
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(async () => ({ data: [], error: null }));
  return builder;
}

describe("conversation history target_language scoping", () => {
  const insertMock = vi.fn();

  beforeEach(() => {
    fromMock.mockReset();
    insertMock.mockReset();
    generateResponseMock.mockReset();
    generateVoiceMock.mockReset();
    processDailyUtteranceMock.mockReset();
    recordDailySessionUserTurnMock.mockReset();

    processDailyUtteranceMock.mockResolvedValue({
      session: { completed_at: null },
      closingTurn: false,
      wordsSent: [],
      wordsUsed: [],
      wrapUpText: null,
    });
    generateResponseMock.mockResolvedValue({
      reply: "Hello!",
      replyExplanation: "I said hello.",
      followUpQuestion: "How are you?",
      correction: null,
    });
    generateVoiceMock.mockResolvedValue(Buffer.from("audio"));
    recordDailySessionUserTurnMock.mockResolvedValue(undefined);
    insertMock.mockResolvedValue({ error: null });
  });

  it("filters history by target_language and inserts it on both rows", async () => {
    const historyEqCalls: EqCall[] = [];

    fromMock.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  level: "beginner",
                  interface_language: "ru",
                  preferred_word_timezone: "America/New_York",
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "messages") {
        if (fromMock.mock.calls.filter((call) => call[0] === "messages").length === 1) {
          return createHistoryBuilder(historyEqCalls);
        }
        return { insert: insertMock };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await runAssistantTurn(42, "en", "hi", "text", false, "ru", "beginner");

    expect(historyEqCalls).toEqual([
      ["user_id", 42],
      ["target_language", "en"],
    ]);

    expect(insertMock).toHaveBeenCalledWith([
      {
        user_id: 42,
        role: "user",
        content: "hi",
        message_type: "text",
        target_language: "en",
      },
      {
        user_id: 42,
        role: "assistant",
        content: expect.any(String),
        message_type: "text",
        target_language: "en",
      },
    ]);
  });
});
