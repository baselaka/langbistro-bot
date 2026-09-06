import { en, type MessageKey } from "./catalogs/en";
import { es } from "./catalogs/es";
import { pt } from "./catalogs/pt";
import { ru } from "./catalogs/ru";
import { DEFAULT_INTERFACE_LANGUAGE, type InterfaceLanguage } from "./types";
import { escapeMarkdownV2 } from "../utils/markdown";

export type { MessageKey };

const catalogs: Record<InterfaceLanguage, Record<MessageKey, string>> = {
  en,
  es,
  pt,
  ru,
};

export type MessageVars = Record<string, string | number>;

export function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

export function t(locale: InterfaceLanguage, key: MessageKey, vars?: MessageVars): string {
  const catalog = catalogs[locale] ?? catalogs[DEFAULT_INTERFACE_LANGUAGE];
  const template = catalog[key] ?? catalogs[DEFAULT_INTERFACE_LANGUAGE][key] ?? key;
  return interpolate(template, vars);
}

/** Like `t()`, but MarkdownV2-escapes interpolated values. Templates keep their own markup. */
export function tMd2(locale: InterfaceLanguage, key: MessageKey, vars?: MessageVars): string {
  if (!vars) {
    return t(locale, key);
  }
  const escaped: MessageVars = {};
  for (const [name, value] of Object.entries(vars)) {
    escaped[name] = escapeMarkdownV2(String(value));
  }
  return t(locale, key, escaped);
}

export function catalogKeys(): MessageKey[] {
  return Object.keys(en) as MessageKey[];
}

export function catalogFor(locale: InterfaceLanguage): Record<MessageKey, string> {
  return catalogs[locale];
}
