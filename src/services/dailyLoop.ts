import type { Api } from "grammy";
import { supabase } from "../db/client";
import { t, type InterfaceLanguage } from "../i18n";
import { getLocalDateString, isoWeekKey } from "../utils/dateTz";
import { matchNewWords, type SentWord } from "../utils/wordMatch";
import {
  getOrCreateDailySession,
  parseSentWords,
  type DailySession,
} from "./dailySession";
import {
  buildChecklistMessage,
  buildWrapUpMessage,
  shouldAutoComplete,
  unusedWords,
} from "./sessionWrapUp";
import { nextStreakState } from "./streak";
import { recordProductionFailure, recordProductionSuccess } from "./vocabulary";

export type DailyLoopResult = {
  session: DailySession;
  wordsSent: SentWord[];
  wordsUsed: SentWord[];
  newlyMatched: SentWord[];
  completedJustNow: boolean;
  wrapUpText: string | null;
  closingTurn: boolean;
};

async function persistSessionWords(
  sessionId: number,
  wordsUsed: SentWord[],
  sessionWin: string | null | undefined
): Promise<void> {
  const patch: Record<string, unknown> = { words_used: wordsUsed };
  if (sessionWin !== undefined) {
    patch.session_win = sessionWin;
  }
  const { error } = await supabase.from("daily_sessions").update(patch).eq("id", sessionId);
  if (error) {
    throw new Error(`Failed to update session words: ${error.message}`);
  }
}

export async function saveChecklistMessageId(sessionId: number, messageId: number): Promise<void> {
  const { error } = await supabase
    .from("daily_sessions")
    .update({ checklist_message_id: messageId })
    .eq("id", sessionId);
  if (error) {
    throw new Error(`Failed to save checklist message id: ${error.message}`);
  }
}

export async function editChecklistMessage(
  api: Api,
  chatId: number,
  session: DailySession,
  locale: InterfaceLanguage,
  wordsSent: SentWord[],
  wordsUsed: SentWord[]
): Promise<void> {
  if (!session.checklist_message_id) {
    return;
  }
  const text = buildChecklistMessage(locale, wordsSent, wordsUsed);
  try {
    await api.editMessageText(chatId, session.checklist_message_id, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/message is not modified|message to edit not found|MESSAGE_ID_INVALID/i.test(message)) {
      return;
    }
    console.warn(`[dailyLoop] checklist edit failed for session ${session.id}:`, message);
  }
}

export type CompleteSessionResult = {
  completed: boolean;
  wrapUpText: string | null;
  streak: number;
};

/**
 * Idempotent session completion. CAS on completed_at IS NULL.
 * Only the winning update increments streak / sessions_completed.
 */
export async function completeSession(
  userId: number,
  timezone: string,
  locale: InterfaceLanguage,
  session: DailySession
): Promise<CompleteSessionResult> {
  if (session.completed_at) {
    return { completed: false, wrapUpText: null, streak: 0 };
  }

  const completedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("daily_sessions")
    .update({ completed_at: completedAt })
    .eq("id", session.id)
    .is("completed_at", null)
    .select("id");

  if (claimError) {
    throw new Error(`Failed to claim session completion: ${claimError.message}`);
  }
  if (!claimed?.length) {
    return { completed: false, wrapUpText: null, streak: 0 };
  }

  const today = getLocalDateString(timezone);
  const thisWeek = isoWeekKey(timezone);

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("streak_current, streak_best, last_completed_date, sessions_completed, last_freeze_week")
    .eq("id", userId)
    .single();

  if (userError || !userRow) {
    throw new Error(`Failed to load streak state: ${userError?.message ?? "unknown"}`);
  }

  const streakUpdate = nextStreakState(
    {
      streak_current: userRow.streak_current ?? 0,
      streak_best: userRow.streak_best ?? 0,
      last_completed_date: userRow.last_completed_date ?? null,
      sessions_completed: userRow.sessions_completed ?? 0,
      last_freeze_week: userRow.last_freeze_week ?? null,
    },
    today,
    thisWeek
  );

  if (streakUpdate.applied) {
    const { error: streakError } = await supabase
      .from("users")
      .update({
        streak_current: streakUpdate.streak_current,
        streak_best: streakUpdate.streak_best,
        last_completed_date: streakUpdate.last_completed_date,
        sessions_completed: streakUpdate.sessions_completed,
        last_freeze_week: streakUpdate.last_freeze_week,
      })
      .eq("id", userId);

    if (streakError) {
      throw new Error(`Failed to update streak: ${streakError.message}`);
    }
  }

  const wordsSent = parseSentWords(session.words_sent);
  const wordsUsed = parseSentWords(session.words_used);
  const usedIds = new Set(wordsUsed.map((w) => w.id));
  const missedDueIds = wordsSent
    .filter((w) => w.kind === "due" && !usedIds.has(w.id))
    .map((w) => w.id);
  if (missedDueIds.length > 0) {
    await recordProductionFailure(userId, missedDueIds);
  }

  const leftovers = unusedWords(wordsSent, wordsUsed);
  const streak = streakUpdate.applied ? streakUpdate.streak_current : (userRow.streak_current ?? 0);

  const wrapUpText = buildWrapUpMessage(locale, {
    wordsUsed: wordsUsed.length,
    wordsSent: wordsSent.length,
    streak,
    sessionWin: session.session_win ?? null,
    leftoverWord: leftovers[0]?.word ?? null,
  });

  return { completed: true, wrapUpText, streak };
}

export type ProcessUtteranceOptions = {
  userId: number;
  timezone: string;
  locale: InterfaceLanguage;
  text: string;
  priorCorrection?: string | null;
  api?: Api;
  chatId?: number;
  forceComplete?: boolean;
};

/**
 * Match daily words in a learner utterance, update checklist, and maybe complete.
 * Does not send the wrap-up — caller sends wrapUpText.
 */
export async function processDailyUtterance(options: ProcessUtteranceOptions): Promise<DailyLoopResult> {
  const session = await getOrCreateDailySession(options.userId, options.timezone);
  const wordsSent = parseSentWords(session.words_sent);
  let wordsUsed = parseSentWords(session.words_used);
  const newlyMatched = session.completed_at
    ? []
    : matchNewWords(options.text, wordsSent, wordsUsed);

  let sessionWin: string | null | undefined = undefined;

  if (!session.completed_at && newlyMatched.length > 0) {
    wordsUsed = [...wordsUsed, ...newlyMatched];
    if (!session.session_win) {
      sessionWin = newlyMatched[0]!.word;
    }
  }

  if (
    !session.completed_at &&
    options.priorCorrection?.trim() &&
    !session.session_win &&
    sessionWin === undefined
  ) {
    const corrected = options.priorCorrection.trim();
    if (options.text.toLowerCase().includes(corrected.toLowerCase())) {
      sessionWin = corrected;
    }
  }

  if (!session.completed_at && (newlyMatched.length > 0 || sessionWin !== undefined)) {
    await persistSessionWords(session.id, wordsUsed, sessionWin);
    session.words_used = wordsUsed;
    if (sessionWin !== undefined && sessionWin !== null) {
      session.session_win = sessionWin;
    }
  }

  if (!session.completed_at && newlyMatched.length > 0) {
    await recordProductionSuccess(
      options.userId,
      newlyMatched.map((w) => w.id)
    );
  }

  if (options.api && options.chatId != null && !session.completed_at) {
    await editChecklistMessage(options.api, options.chatId, session, options.locale, wordsSent, wordsUsed);
  }

  const wantsComplete =
    Boolean(options.forceComplete) || shouldAutoComplete(wordsSent, wordsUsed);
  let completedJustNow = false;
  let wrapUpText: string | null = null;
  let closingTurn = false;

  if (!session.completed_at && wantsComplete && (options.forceComplete || wordsSent.length > 0)) {
    const refreshed: DailySession = {
      ...session,
      words_used: wordsUsed,
      session_win: sessionWin !== undefined ? sessionWin : session.session_win,
    };
    const result = await completeSession(options.userId, options.timezone, options.locale, refreshed);
    completedJustNow = result.completed;
    wrapUpText = result.wrapUpText;
    closingTurn = result.completed && !options.forceComplete;
    if (result.completed) {
      session.completed_at = new Date().toISOString();
    }
  }

  return {
    session,
    wordsSent,
    wordsUsed,
    newlyMatched,
    completedJustNow,
    wrapUpText,
    closingTurn,
  };
}

export async function handleDoneCommand(options: {
  userId: number;
  timezone: string;
  locale: InterfaceLanguage;
}): Promise<{ text: string }> {
  const session = await getOrCreateDailySession(options.userId, options.timezone);
  if (session.completed_at) {
    return { text: t(options.locale, "session.alreadyDone") };
  }
  const wordsSent = parseSentWords(session.words_sent);
  if (wordsSent.length === 0 && !session.delivered_at) {
    return { text: t(options.locale, "session.noSession") };
  }

  const result = await completeSession(options.userId, options.timezone, options.locale, session);
  if (!result.completed || !result.wrapUpText) {
    return { text: t(options.locale, "session.alreadyDone") };
  }
  return { text: result.wrapUpText };
}
