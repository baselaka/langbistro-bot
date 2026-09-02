/**
 * Central OpenAI model IDs for LangBistro.
 *
 * Update here only — do not hardcode model strings at call sites.
 * Verified against OpenAI docs + live API (2026-07):
 * - Chat Pro/Free: gpt-5.2 / gpt-5.4-mini (GA, custom temperature supported).
 * - Chat grading + language detect: gpt-5.4-mini (temperature: 0).
 * - GPT-5.6-* is temperature-locked; chatParams() omits temperature for that family
 *   when we switch back after restricted rollout ends.
 * - Transcription: gpt-4o-mini-transcribe (batch /audio/transcriptions).
 * - TTS: gpt-4o-mini-tts.
 */

/** Subscribed users — flagship chat (temperature-capable). */
export const CHAT_MODEL_PRO = "gpt-5.2";

/** Free-tier chat, fill-blank, seeds — mini-tier (temperature-capable). */
export const CHAT_MODEL_FREE = "gpt-5.4-mini";

/** Quiz grading + language detect — temperature: 0 for deterministic yes/no and grading. */
export const CHAT_MODEL_GRADE = "gpt-5.4-mini";

export const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
export const TTS_MODEL = "gpt-4o-mini-tts";

const TEMPERATURE_LOCKED_PREFIXES = ["gpt-5.6-", "gpt-5-mini"] as const;

/** True when the model rejects non-default temperature (live API: only default 1). */
export function isTemperatureLocked(model: string): boolean {
  return TEMPERATURE_LOCKED_PREFIXES.some((prefix) => model.startsWith(prefix));
}

/**
 * Build chat-completion model params. Omits `temperature` for locked families
 * so callers can keep their preferred values without 400 errors.
 */
export function chatParams(
  model: string,
  temperature?: number
): { model: string; temperature?: number } {
  if (isTemperatureLocked(model) || temperature === undefined) {
    return { model };
  }
  return { model, temperature };
}
