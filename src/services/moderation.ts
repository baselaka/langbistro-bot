import type { Api } from "grammy";
import { openai } from "../ai/openai";
import { env } from "../config/env";
import { parseTargetLanguage, type TargetLanguage } from "../config/languages";
import { supabase } from "../db/client";
import { moderationSafeTopic, t, type InterfaceLanguage } from "../i18n";

export const MODERATION_MODEL = "omni-moderation-latest";
export const HARD_SCORE_THRESHOLD = 0.7;

/** Blocks the turn and counts a strike when score >= HARD_SCORE_THRESHOLD and enforce is on. */
export const HARD_BLOCK_CATEGORIES = [
  "sexual/minors",
  "harassment/threatening",
  "hate/threatening",
  "self-harm/intent",
  "self-harm/instructions",
  "illicit/violent",
] as const;

export type HardBlockCategory = (typeof HARD_BLOCK_CATEGORIES)[number];

export type CategoryScores = Record<string, number>;
export type CategoryFlags = Record<string, boolean | null>;
export type CategoryAppliedInputTypes = Record<string, string[]>;

export type ModerationCheckResult = {
  shouldBlock: boolean;
  primaryCategory: string | null;
  categories: CategoryFlags;
  categoryScores: CategoryScores;
  categoryAppliedInputTypes: CategoryAppliedInputTypes;
  model: string;
  maxHardScore: number;
};

export type ModerationGateResult =
  | { action: "allow" }
  | { action: "block"; reply: string };

function asScoreMap(scores: unknown): CategoryScores {
  if (!scores || typeof scores !== "object") {
    return {};
  }
  return { ...(scores as CategoryScores) };
}

function asFlagMap(categories: unknown): CategoryFlags {
  if (!categories || typeof categories !== "object") {
    return {};
  }
  return { ...(categories as CategoryFlags) };
}

function asAppliedMap(applied: unknown): CategoryAppliedInputTypes {
  if (!applied || typeof applied !== "object") {
    return {};
  }
  return { ...(applied as CategoryAppliedInputTypes) };
}

export function decideShouldBlock(categoryScores: CategoryScores): {
  shouldBlock: boolean;
  primaryCategory: string | null;
  maxHardScore: number;
} {
  let maxHardScore = 0;
  let primaryCategory: string | null = null;

  for (const category of HARD_BLOCK_CATEGORIES) {
    const score = categoryScores[category] ?? 0;
    if (score > maxHardScore) {
      maxHardScore = score;
      primaryCategory = category;
    }
  }

  return {
    shouldBlock: maxHardScore >= HARD_SCORE_THRESHOLD,
    primaryCategory: maxHardScore >= HARD_SCORE_THRESHOLD ? primaryCategory : null,
    maxHardScore,
  };
}

export async function checkViolation(text: string): Promise<ModerationCheckResult> {
  const moderation = await openai.moderations.create({
    model: MODERATION_MODEL,
    input: text,
  });

  const result = moderation.results[0];
  const model = moderation.model || MODERATION_MODEL;
  const categories = asFlagMap(result?.categories);
  const categoryScores = asScoreMap(result?.category_scores);
  const categoryAppliedInputTypes = asAppliedMap(result?.category_applied_input_types);

  const decision = decideShouldBlock(categoryScores);

  return {
    shouldBlock: decision.shouldBlock,
    primaryCategory: decision.primaryCategory,
    categories,
    categoryScores,
    categoryAppliedInputTypes,
    model,
    maxHardScore: decision.maxHardScore,
  };
}

export async function recordModerationResult(input: {
  userId: number;
  content: string;
  check: ModerationCheckResult;
  enforced: boolean;
}): Promise<void> {
  const { error } = await supabase.from("violations").insert({
    user_id: input.userId,
    violation_type: input.check.primaryCategory,
    content: input.content,
    categories: input.check.categories,
    category_scores: input.check.categoryScores,
    category_applied_input_types: input.check.categoryAppliedInputTypes,
    model: input.check.model,
    enforced: input.enforced,
  });

  if (error) {
    throw new Error(`Failed to insert moderation result: ${error.message}`);
  }
}

export async function applyEnforcement(
  userId: number
): Promise<{ violation_count: number; is_banned: boolean }> {
  const { data, error } = await supabase.rpc("increment_violation_count", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to increment violation count: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.violation_count !== "number") {
    throw new Error("Failed to increment violation count: empty RPC result");
  }

  return {
    violation_count: Number(row.violation_count),
    is_banned: Boolean(row.is_banned),
  };
}

export function moderationUserCopy(
  violationCount: number,
  locale: InterfaceLanguage,
  targetLanguage: TargetLanguage
): string {
  if (violationCount >= 5) {
    return t(locale, "moderation.banned");
  }
  if (violationCount >= 3) {
    return t(locale, "moderation.warning");
  }
  return moderationSafeTopic(locale, targetLanguage);
}

export async function notifyAdmins(
  api: Api,
  payload: {
    userId: number;
    primaryCategory: string | null;
    maxHardScore: number;
    enforced: boolean;
    banned: boolean;
    contentPreview: string;
  }
): Promise<void> {
  const ids = env.adminTelegramIds;
  if (ids.length === 0) {
    return;
  }

  const preview =
    payload.contentPreview.length > 200
      ? `${payload.contentPreview.slice(0, 200)}…`
      : payload.contentPreview;

  const lines = [
    payload.banned ? "LangBistro moderation: USER BANNED" : "LangBistro moderation: hard-set hit",
    `user_id=${payload.userId}`,
    `category=${payload.primaryCategory ?? "n/a"}`,
    `max_hard_score=${payload.maxHardScore.toFixed(3)}`,
    `enforced=${payload.enforced}`,
    `preview=${preview}`,
  ];
  const text = lines.join("\n");

  await Promise.all(
    ids.map(async (telegramId) => {
      try {
        await api.sendMessage(telegramId, text);
      } catch (err) {
        console.error(`Failed to notify admin ${telegramId}:`, err);
      }
    })
  );
}

export async function runModerationGate(input: {
  userId: number;
  text: string;
  locale: InterfaceLanguage;
  targetLanguage: string;
  api: Api;
  enforce?: boolean;
}): Promise<ModerationGateResult> {
  const enforce = input.enforce ?? env.moderationEnforce;
  const targetLang = parseTargetLanguage(input.targetLanguage);
  const check = await checkViolation(input.text);
  const enforced = check.shouldBlock && enforce;

  await recordModerationResult({
    userId: input.userId,
    content: input.text,
    check,
    enforced,
  });

  if (!check.shouldBlock) {
    return { action: "allow" };
  }

  if (!enforce) {
    await notifyAdmins(input.api, {
      userId: input.userId,
      primaryCategory: check.primaryCategory,
      maxHardScore: check.maxHardScore,
      enforced: false,
      banned: false,
      contentPreview: input.text,
    });
    return { action: "allow" };
  }

  const strike = await applyEnforcement(input.userId);

  await notifyAdmins(input.api, {
    userId: input.userId,
    primaryCategory: check.primaryCategory,
    maxHardScore: check.maxHardScore,
    enforced: true,
    banned: strike.is_banned,
    contentPreview: input.text,
  });

  return {
    action: "block",
    reply: moderationUserCopy(strike.violation_count, input.locale, targetLang),
  };
}
