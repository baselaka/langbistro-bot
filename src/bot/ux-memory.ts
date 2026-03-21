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
const callbackStore = new Map<number, CallbackMeta>();

function setWithEviction(messageId: number, value: CallbackMeta): void {
  if (!callbackStore.has(messageId) && callbackStore.size >= MAX_ENTRIES) {
    const oldestKey = callbackStore.keys().next().value as number | undefined;
    if (oldestKey !== undefined) {
      callbackStore.delete(oldestKey);
    }
  }

  callbackStore.set(messageId, value);
}

export function storeCorrectionExplanation(messageId: number, explanation: string): void {
  setWithEviction(messageId, { kind: "correction", explanation });
}

export function storeReplyMeta(messageId: number, reply: string, replyExplanation: string): void {
  setWithEviction(messageId, { kind: "reply", reply, replyExplanation });
}

export function getCallbackMeta(messageId: number): CallbackMeta | undefined {
  return callbackStore.get(messageId);
}
