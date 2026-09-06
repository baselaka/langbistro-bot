import {
  getLanguageConfig,
  parseTargetLanguage,
  type LanguageLevel,
  type TargetLanguage,
} from "../config/languages";
import {
  INTERFACE_LANGUAGE_LABELS,
  INTERFACE_LANGUAGE_ENGLISH_NAME,
  type InterfaceLanguage,
} from "./types";
import { t } from "./t";

const MILESTONES = [50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000] as const;
type MilestoneCount = (typeof MILESTONES)[number];

const MILESTONE_KEYS: Record<MilestoneCount, `milestone.${MilestoneCount}`> = {
  50: "milestone.50",
  100: "milestone.100",
  250: "milestone.250",
  500: "milestone.500",
  750: "milestone.750",
  1000: "milestone.1000",
  1500: "milestone.1500",
  2000: "milestone.2000",
  3000: "milestone.3000",
  4000: "milestone.4000",
};

const TARGET_NAME_KEYS: Record<TargetLanguage, "target.es" | "target.fr" | "target.en"> = {
  es: "target.es",
  fr: "target.fr",
  en: "target.en",
};

const LEVEL_KEYS: Record<LanguageLevel, "level.beginner" | "level.intermediate" | "level.advanced"> = {
  beginner: "level.beginner",
  intermediate: "level.intermediate",
  advanced: "level.advanced",
};

export function localizedTargetName(locale: InterfaceLanguage, code: TargetLanguage): string {
  return t(locale, TARGET_NAME_KEYS[code]);
}

export function localizedLevelName(locale: InterfaceLanguage, level: string): string {
  const normalized = level.toLowerCase();
  const key =
    normalized === "intermediate" || normalized === "advanced"
      ? LEVEL_KEYS[normalized]
      : LEVEL_KEYS.beginner;
  return t(locale, key);
}

export function pickerLabel(
  code: TargetLanguage,
  current: TargetLanguage,
  locale: InterfaceLanguage
): string {
  const lang = getLanguageConfig(code);
  const base = `${lang.flag} ${localizedTargetName(locale, code)}`;
  return code === current ? `${base} ✓` : base;
}

export function interfacePickerLabel(code: InterfaceLanguage, current: InterfaceLanguage): string {
  const base = INTERFACE_LANGUAGE_LABELS[code];
  return code === current ? `${base} ✓` : base;
}

export function languageDisplayLabel(code: TargetLanguage, locale: InterfaceLanguage): string {
  const lang = getLanguageConfig(code);
  return `${localizedTargetName(locale, code)} ${lang.flag}`;
}

export function settingsLevelAsk(targetLang: TargetLanguage, locale: InterfaceLanguage): string {
  return t(locale, "settings.levelAsk", { language: localizedTargetName(locale, targetLang) });
}

export function onboardingLevelAsk(targetLang: TargetLanguage, locale: InterfaceLanguage): string {
  return t(locale, "onboarding.levelAsk", { language: localizedTargetName(locale, targetLang) });
}

export function reviewAsk(
  translation: string,
  targetLang: TargetLanguage,
  locale: InterfaceLanguage
): string {
  return t(locale, "review.ask", {
    translation,
    language: localizedTargetName(locale, targetLang),
  });
}

export function conversationNudgeExplanation(
  targetLang: TargetLanguage,
  locale: InterfaceLanguage
): string {
  return t(locale, "nudge.explanation", { language: localizedTargetName(locale, targetLang) });
}

export function getMilestoneMessage(
  wordsCount: number,
  targetLang: string,
  locale: InterfaceLanguage
): string | null {
  if (!MILESTONES.includes(wordsCount as MilestoneCount)) {
    return null;
  }
  const key = MILESTONE_KEYS[wordsCount as MilestoneCount];
  return t(locale, key, {
    language: localizedTargetName(locale, parseTargetLanguage(targetLang)),
  });
}

export function inactivityNeverStarted24h(
  locale: InterfaceLanguage,
  targetLang: TargetLanguage
): string {
  const cfg = getLanguageConfig(targetLang);
  return t(locale, "inactivity.neverStarted24h", {
    greeting: cfg.inactivityGreeting,
    flag: cfg.flag,
  });
}

export function inactivityNeverStarted72h(
  locale: InterfaceLanguage,
  targetLang: TargetLanguage
): string {
  return t(locale, "inactivity.neverStarted72h", {
    language: localizedTargetName(locale, targetLang),
  });
}

export function inactivityWeekPause(locale: InterfaceLanguage, targetLang: TargetLanguage): string {
  const cfg = getLanguageConfig(targetLang);
  return t(locale, "inactivity.weekPause", { greeting: cfg.inactivityGreeting });
}

export function inactivityRecall(
  locale: InterfaceLanguage,
  word: string,
  translation: string
): string {
  return t(locale, "inactivity.recall", { word, translation });
}

export function inactivityMonthProgress(
  locale: InterfaceLanguage,
  targetLang: TargetLanguage,
  count: number
): string {
  return t(locale, "inactivity.monthProgress", {
    count,
    language: localizedTargetName(locale, targetLang),
  });
}

export function inactivityFinalPause(locale: InterfaceLanguage, targetLang: TargetLanguage): string {
  return t(locale, "inactivity.finalPause", {
    language: localizedTargetName(locale, targetLang),
  });
}

export function moderationRedirect(locale: InterfaceLanguage, targetLang: TargetLanguage): string {
  return t(locale, "moderation.redirect", { language: localizedTargetName(locale, targetLang) });
}

export function moderationSafeTopic(locale: InterfaceLanguage, targetLang: TargetLanguage): string {
  return t(locale, "moderation.safeTopic", { language: localizedTargetName(locale, targetLang) });
}

/** GPT instruction for `replyExplanation` / correction.explanation. Model-facing English. */
export function buildMetaExplanationRule(
  targetLang: TargetLanguage,
  interfaceLang: InterfaceLanguage
): string {
  const targetName = getLanguageConfig(targetLang).name;
  const ifaceName = INTERFACE_LANGUAGE_ENGLISH_NAME[interfaceLang];

  if (targetLang === "en" && interfaceLang === "en") {
    return "Always provide `replyExplanation` and any correction.explanation in simpler English speaking directly to the learner, paraphrasing what you said in your reply so a lower-level learner can follow. Use 'I said...' or 'I asked you...' phrasing. Never refer to the learner as 'the user'. Do not translate into another language.";
  }

  return `Always provide \`replyExplanation\` and any correction.explanation in ${ifaceName} speaking directly to the learner, explaining what you said in your ${targetName} reply. Use the equivalent of 'I said...' or 'I asked you...' phrasing in ${ifaceName}. Never refer to the learner as 'the user'.`;
}
