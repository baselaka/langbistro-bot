export const INTERFACE_LANGUAGES = ["en", "es", "pt", "ru"] as const;

export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

export const DEFAULT_INTERFACE_LANGUAGE: InterfaceLanguage = "en";

/** Native-script labels shown on the interface-language picker. */
export const INTERFACE_LANGUAGE_LABELS: Record<InterfaceLanguage, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  ru: "Русский",
};

/** English names for GPT system prompts (model instructions stay in English). */
export const INTERFACE_LANGUAGE_ENGLISH_NAME: Record<InterfaceLanguage, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  ru: "Russian",
};
