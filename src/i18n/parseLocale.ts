import {
  DEFAULT_INTERFACE_LANGUAGE,
  INTERFACE_LANGUAGES,
  type InterfaceLanguage,
} from "./types";

export function isInterfaceLanguage(value: string): value is InterfaceLanguage {
  return (INTERFACE_LANGUAGES as readonly string[]).includes(value);
}

export function parseInterfaceLanguage(
  raw: string | null | undefined,
  fallback: InterfaceLanguage = DEFAULT_INTERFACE_LANGUAGE
): InterfaceLanguage {
  if (raw && isInterfaceLanguage(raw)) {
    return raw;
  }
  return fallback;
}

/** Map Telegram `language_code` (e.g. es-MX, pt-BR, ru) onto a supported UI locale. */
export function localeFromTelegramCode(code: string | null | undefined): InterfaceLanguage {
  if (!code) {
    return DEFAULT_INTERFACE_LANGUAGE;
  }
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  if (base === "es" || base === "pt" || base === "ru") {
    return base;
  }
  return DEFAULT_INTERFACE_LANGUAGE;
}

export function defaultInterfaceLanguage(languageCode: string | null | undefined): InterfaceLanguage {
  return localeFromTelegramCode(languageCode);
}
