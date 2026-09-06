import type { Bot } from "grammy";
import { INTERFACE_LANGUAGES, t, type InterfaceLanguage, type MessageKey } from "../i18n";

const COMMAND_DEFS: ReadonlyArray<{ command: string; key: MessageKey }> = [
  { command: "start", key: "command.start" },
  { command: "language", key: "command.language" },
  { command: "interface", key: "command.interface" },
  { command: "settings", key: "command.settings" },
  { command: "subscribe", key: "command.subscribe" },
];

type CommandScope = { type: "default" } | { type: "all_private_chats" };

/** Private chats use all_private_chats and ignore the default BotFather list. */
export const COMMAND_SCOPES: CommandScope[] = [{ type: "default" }, { type: "all_private_chats" }];

export function botCommandsFor(
  locale: InterfaceLanguage
): Array<{ command: string; description: string }> {
  return COMMAND_DEFS.map((def) => ({
    command: def.command,
    description: t(locale, def.key),
  }));
}

export async function syncBotCommands(bot: Bot): Promise<void> {
  const commandsByLocale = Object.fromEntries(
    INTERFACE_LANGUAGES.map((locale) => [locale, botCommandsFor(locale)])
  ) as Record<InterfaceLanguage, ReturnType<typeof botCommandsFor>>;

  for (const scope of COMMAND_SCOPES) {
    await bot.api.setMyCommands(commandsByLocale.en, { scope });
    for (const locale of INTERFACE_LANGUAGES) {
      await bot.api.setMyCommands(commandsByLocale[locale], { scope, language_code: locale });
    }
  }
}
