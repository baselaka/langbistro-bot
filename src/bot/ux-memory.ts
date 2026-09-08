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

export type PendingCorrection = {
  correctedPhrase: string;
  correctedSentence: string;
  createdAt: number;
};

const MAX_ENTRIES = 1000;
const callbackStore = new Map<string, CallbackMeta>();
const pendingCorrectionStore = new Map<number, PendingCorrection>();

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

function setPendingWithEviction(telegramId: number, value: PendingCorrection): void {
  if (!pendingCorrectionStore.has(telegramId) && pendingCorrectionStore.size >= MAX_ENTRIES) {
    const oldestKey = pendingCorrectionStore.keys().next().value as number | undefined;
    if (oldestKey !== undefined) {
      pendingCorrectionStore.delete(oldestKey);
    }
  }
  pendingCorrectionStore.set(telegramId, value);
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

export function storePendingCorrection(
  telegramId: number,
  payload: { correctedPhrase: string; correctedSentence: string }
): void {
  setPendingWithEviction(telegramId, {
    correctedPhrase: payload.correctedPhrase,
    correctedSentence: payload.correctedSentence,
    createdAt: Date.now(),
  });
}

export function getPendingCorrection(telegramId: number): PendingCorrection | undefined {
  return pendingCorrectionStore.get(telegramId);
}

export function clearPendingCorrection(telegramId: number): void {
  pendingCorrectionStore.delete(telegramId);
}

/** Return and remove the pending correction, if any. */
export function consumePendingCorrection(telegramId: number): PendingCorrection | undefined {
  const pending = pendingCorrectionStore.get(telegramId);
  if (pending) {
    pendingCorrectionStore.delete(telegramId);
  }
  return pending;
}
