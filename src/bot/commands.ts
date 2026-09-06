import type { Bot } from "grammy";
import { INTERFACE_LANGUAGES, t, type InterfaceLanguage, type MessageKey } from "../i18n";

const COMMAND_DEFS: ReadonlyArray<{ command: string; key: MessageKey }> = [
  { command: "start", key: "command.start" },
  { command: "language", key: "command.language" },
  { command: "interface", key: "command.interface" },
  { command: "settings", key: "command.settings" },
  { command: "subscribe", key: "command.subscribe" },
];

export function botCommandsFor(
  locale: InterfaceLanguage
): Array<{ command: string; description: string }> {
  return COMMAND_DEFS.map((def) => ({
    command: def.command,
    description: t(locale, def.key),
  }));
}

export async function syncBotCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands(botCommandsFor("en"));
  for (const locale of INTERFACE_LANGUAGES) {
    await bot.api.setMyCommands(botCommandsFor(locale), { language_code: locale });
  }
}
