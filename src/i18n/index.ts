export {
  DEFAULT_INTERFACE_LANGUAGE,
  INTERFACE_LANGUAGES,
  INTERFACE_LANGUAGE_ENGLISH_NAME,
  INTERFACE_LANGUAGE_LABELS,
  type InterfaceLanguage,
} from "./types";
export {
  defaultInterfaceLanguage,
  isInterfaceLanguage,
  localeFromTelegramCode,
  parseInterfaceLanguage,
} from "./parseLocale";
export { catalogFor, catalogKeys, interpolate, t, tMd2, type MessageKey, type MessageVars } from "./t";
export {
  conversationNudgeExplanation,
  getMilestoneMessage,
  inactivityFinalPause,
  inactivityMonthProgress,
  inactivityNeverStarted24h,
  inactivityNeverStarted72h,
  inactivityRecall,
  inactivityWeekPause,
  languageDisplayLabel,
  localizedLevelName,
  localizedTargetName,
  moderationRedirect,
  moderationSafeTopic,
  onboardingLevelAsk,
  pickerLabel,
  interfacePickerLabel,
  reviewAsk,
  settingsLevelAsk,
  buildMetaExplanationRule,
} from "./copy";
