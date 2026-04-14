type CorrectionMeta = {
  kind: "correction";
  explanation: string;
};

type ReplyMeta = {
  kind: "reply";
  reply: string;
  replyExplanation: string;
};

type CallbackMeta = CorrectionMeta | ReplyMeta;

const MAX_ENTRIES = 1000;
const callbackStore = new Map<string, CallbackMeta>();

function buildKey(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`;
}

function setWithEviction(chatId: number, messageId: number, value: CallbackMeta): void {
  const key = buildKey(chatId, messageId);
  if (!callbackStore.has(key) && callbackStore.size >= MAX_ENTRIES) {
    const oldestKey = callbackStore.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      callbackStore.delete(oldestKey);
    }
  }

  callbackStore.set(key, value);
}

export function storeCorrectionExplanation(chatId: number, messageId: number, explanation: string): void {
  setWithEviction(chatId, messageId, { kind: "correction", explanation });
}

export function storeReplyMeta(chatId: number, messageId: number, reply: string, replyExplanation: string): void {
  setWithEviction(chatId, messageId, { kind: "reply", reply, replyExplanation });
}

export function getCallbackMeta(chatId: number, messageId: number): CallbackMeta | undefined {
  return callbackStore.get(buildKey(chatId, messageId));
}
