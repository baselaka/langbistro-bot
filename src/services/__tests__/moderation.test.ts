import { beforeEach, describe, expect, it, vi } from "vitest";

const moderationsCreateMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const envState = vi.hoisted(() => ({
  moderationEnforce: false,
  adminTelegramIds: [999001] as number[],
}));

vi.mock("../../ai/openai", () => ({
  openai: {
    moderations: {
      create: moderationsCreateMock,
    },
  },
}));

vi.mock("../../db/client", () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

vi.mock("../../config/env", () => ({
  env: envState,
}));

import {
  HARD_SCORE_THRESHOLD,
  decideShouldBlock,
  moderationUserCopy,
  runModerationGate,
} from "../moderation";

function emptyScores(overrides: Record<string, number> = {}): Record<string, number> {
  return {
    harassment: 0,
    "harassment/threatening": 0,
    hate: 0,
    "hate/threatening": 0,
    illicit: 0,
    "illicit/violent": 0,
    "self-harm": 0,
    "self-harm/instructions": 0,
    "self-harm/intent": 0,
    sexual: 0,
    "sexual/minors": 0,
    violence: 0,
    "violence/graphic": 0,
    ...overrides,
  };
}

function mockInsertOk(): void {
  fromMock.mockReturnValue({
    insert: vi.fn().mockResolvedValue({ error: null }),
  });
}

describe("decideShouldBlock", () => {
  it("blocks when a hard-set score is at or above threshold", () => {
    const result = decideShouldBlock(
      emptyScores({ "harassment/threatening": HARD_SCORE_THRESHOLD })
    );
    expect(result.shouldBlock).toBe(true);
    expect(result.primaryCategory).toBe("harassment/threatening");
  });

  it("allows when hard-set scores are below threshold", () => {
    const result = decideShouldBlock(emptyScores({ "sexual/minors": 0.69 }));
    expect(result.shouldBlock).toBe(false);
    expect(result.primaryCategory).toBeNull();
  });

  it("ignores soft categories even at high scores", () => {
    const result = decideShouldBlock(
      emptyScores({ violence: 0.99, harassment: 0.95, hate: 0.9 })
    );
    expect(result.shouldBlock).toBe(false);
  });
});

describe("moderationUserCopy", () => {
  it("returns safe-topic copy for counts 1–2", () => {
    const copy = moderationUserCopy(1, "en", "es");
    expect(copy.toLowerCase()).toContain("safer");
  });

  it("returns warning copy at count 3", () => {
    const copy = moderationUserCopy(3, "en", "es");
    expect(copy.toLowerCase()).toContain("warning");
  });

  it("returns banned copy at count 5", () => {
    const copy = moderationUserCopy(5, "en", "es");
    expect(copy.toLowerCase()).toContain("suspended");
  });
});

describe("runModerationGate", () => {
  const api = { sendMessage: sendMessageMock } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    envState.moderationEnforce = false;
    envState.adminTelegramIds = [999001];
    mockInsertOk();
    sendMessageMock.mockResolvedValue({});
  });

  it("allows soft category hits and records enforced=false", async () => {
    moderationsCreateMock.mockResolvedValue({
      model: "omni-moderation-latest",
      results: [
        {
          flagged: true,
          categories: { violence: true, harassment: false },
          category_scores: emptyScores({ violence: 0.92 }),
          category_applied_input_types: { violence: ["text"] },
        },
      ],
    });

    const result = await runModerationGate({
      userId: 42,
      text: "I like books about war",
      locale: "en",
      targetLanguage: "fr",
      api,
      enforce: true,
    });

    expect(result).toEqual({ action: "allow" });
    expect(rpcMock).not.toHaveBeenCalled();
    const insertArg = fromMock.mock.results[0]?.value.insert.mock.calls[0]?.[0];
    expect(insertArg.enforced).toBe(false);
    expect(insertArg.content).toBe("I like books about war");
  });

  it("allows hard-set below threshold", async () => {
    moderationsCreateMock.mockResolvedValue({
      model: "omni-moderation-latest",
      results: [
        {
          flagged: true,
          categories: { "hate/threatening": true },
          category_scores: emptyScores({ "hate/threatening": 0.5 }),
          category_applied_input_types: {},
        },
      ],
    });

    const result = await runModerationGate({
      userId: 7,
      text: "borderline",
      locale: "en",
      targetLanguage: "es",
      api,
      enforce: true,
    });

    expect(result.action).toBe("allow");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("shadows hard-set hits when enforce is off", async () => {
    moderationsCreateMock.mockResolvedValue({
      model: "omni-moderation-latest",
      results: [
        {
          flagged: true,
          categories: { "self-harm/intent": true },
          category_scores: emptyScores({ "self-harm/intent": 0.88 }),
          category_applied_input_types: {},
        },
      ],
    });

    const result = await runModerationGate({
      userId: 3,
      text: "hard hit shadow",
      locale: "en",
      targetLanguage: "es",
      api,
      enforce: false,
    });

    expect(result.action).toBe("allow");
    expect(rpcMock).not.toHaveBeenCalled();
    const insertArg = fromMock.mock.results[0]?.value.insert.mock.calls[0]?.[0];
    expect(insertArg.enforced).toBe(false);
    expect(sendMessageMock).toHaveBeenCalled();
  });

  it("blocks hard-set hits when enforce is on and increments via RPC", async () => {
    moderationsCreateMock.mockResolvedValue({
      model: "omni-moderation-latest",
      results: [
        {
          flagged: true,
          categories: { "harassment/threatening": true },
          category_scores: emptyScores({ "harassment/threatening": 0.81 }),
          category_applied_input_types: {},
        },
      ],
    });
    rpcMock.mockResolvedValue({
      data: [{ violation_count: 1, is_banned: false }],
      error: null,
    });

    const result = await runModerationGate({
      userId: 11,
      text: "threatening content",
      locale: "en",
      targetLanguage: "es",
      api,
      enforce: true,
    });

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.reply.toLowerCase()).toContain("safer");
    }
    expect(rpcMock).toHaveBeenCalledWith("increment_violation_count", { p_user_id: 11 });
    const insertArg = fromMock.mock.results[0]?.value.insert.mock.calls[0]?.[0];
    expect(insertArg.enforced).toBe(true);
    expect(insertArg.violation_type).toBe("harassment/threatening");
  });

  it("returns banned copy when RPC count reaches 5", async () => {
    moderationsCreateMock.mockResolvedValue({
      model: "omni-moderation-latest",
      results: [
        {
          flagged: true,
          categories: { "sexual/minors": true },
          category_scores: emptyScores({ "sexual/minors": 0.95 }),
          category_applied_input_types: {},
        },
      ],
    });
    rpcMock.mockResolvedValue({
      data: [{ violation_count: 5, is_banned: true }],
      error: null,
    });

    const result = await runModerationGate({
      userId: 99,
      text: "banned path",
      locale: "en",
      targetLanguage: "es",
      api,
      enforce: true,
    });

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.reply.toLowerCase()).toContain("suspended");
    }
    expect(sendMessageMock).toHaveBeenCalledWith(
      999001,
      expect.stringContaining("USER BANNED")
    );
  });

  it("returns warning copy when RPC count is 3", async () => {
    moderationsCreateMock.mockResolvedValue({
      model: "omni-moderation-latest",
      results: [
        {
          flagged: true,
          categories: { "illicit/violent": true },
          category_scores: emptyScores({ "illicit/violent": 0.75 }),
          category_applied_input_types: {},
        },
      ],
    });
    rpcMock.mockResolvedValue({
      data: [{ violation_count: 3, is_banned: false }],
      error: null,
    });

    const result = await runModerationGate({
      userId: 12,
      text: "warning path",
      locale: "en",
      targetLanguage: "es",
      api,
      enforce: true,
    });

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.reply.toLowerCase()).toContain("warning");
    }
  });
});
